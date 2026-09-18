import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import solc from 'solc';
import {
  C,
  TOKENS,
  deployment,
  sdk,
  buildStrategy,
  buildQuote,
  json,
  routerAbi,
  erc20,
} from '../strategy.mjs';
import { readonlyRpc, preflight } from '../readonly.mjs';
import {
  buildAquaShipPlan,
  buildAquaDockPlan,
  buildMakerWrapPlan,
  buildMakerUnwrapPlan,
  buildUnderlyingRoute,
} from '../index.mjs';
import { config as fixture, request as requestFixture, OPERATOR, MAKER, USER } from './fixtures.mjs';
import { runMarketCases } from './markets-fork.mjs';
import { runOfficialCases } from './official-fork.mjs';

const port = 18569,
  localUrl = `http://127.0.0.1:${port}`;
const report = {
  schema: 'ring.swapvm-fork-tests.v1',
  startedAt: new Date().toISOString(),
  safety: {
    mainnetTransactions: 0,
    realSignatures: 0,
    localWritesOnly: true,
    officialFrontendTraffic: 'unverified',
  },
  sourceBlock: deployment.referenceBlock,
  sdkVersions: { swapVm: '0.4.2', aqua: '0.3.2' },
  lockSha256: createHash('sha256')
    .update(readFileSync(new URL('../package-lock.json', import.meta.url)))
    .digest('hex'),
  sourceSha256: Object.fromEntries(
    [
      'strategy.mjs',
      'strategy-core.mjs',
      'integration-core.mjs',
      'index.mjs',
      'portable.mjs',
      'cli.mjs',
      'package.json',
      'examples/build-plans.mjs',
      'test/package.mjs',
      'test/repository.mjs',
      '.github/workflows/ci.yml',
      'test/integration.test.mjs',
      'test/cli.test.mjs',
      'readonly.mjs',
      'test/fork.mjs',
      'test/RecipeHarness.sol',
      'config/deployment.json',
      'assets.mjs',
      'config/assets.json',
      'test/market-fixtures.mjs',
      'test/markets.test.mjs',
      'test/markets-fork.mjs',
      'test/conversions-fork.mjs',
      'test/native.test.mjs',
      'index.d.mts',
      'portable.d.mts',
      'test/types.mts',
      'test/browser-entry.mjs',
      'test/browser-build.mjs',
      'test/browser-shims.mjs',
      'test/official.test.mjs',
      'test/official-fork.mjs',
      'test/official-reference.json',
      'test/fixtures/legacy-position-identity.json',
      'test/fixtures/legacy-strategy.json',
    ].map((path) => [
      path,
      createHash('sha256')
        .update(readFileSync(new URL(`../${path}`, import.meta.url)))
        .digest('hex'),
    ]),
  ),
  tests: [],
};
const evidence = new URL(
  process.env.RING_FORK_EVIDENCE_DIR
    ? `../${process.env.RING_FORK_EVIDENCE_DIR.replace(/\/$/, '')}/`
    : '../artifacts/fork/',
  import.meta.url,
);
mkdirSync(evidence, { recursive: true });
const save = () => writeFileSync(new URL('fork-attempt.json', evidence), json(report));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let child, provider;
async function main() {
  const remote = process.env.ETH_RPC_URL || process.env.RPC_URL;
  assert(remote, 'RPC environment is required');
  const ro = readonlyRpc(remote);
  const sourceHeader = await ro('eth_getBlockByNumber', [
    '0x' + deployment.referenceBlock.number.toString(16),
    false,
  ]);
  assert.equal(
    sourceHeader.hash,
    deployment.referenceBlock.hash,
    'Fork block differs from pinned canonical block',
  );
  // Never connect writes to an existing node, even on loopback.
  try {
    await fetch(localUrl, { method: 'POST', body: '{}', signal: AbortSignal.timeout(300) });
    throw new Error('PORT_OCCUPIED');
  } catch (e) {
    if (e.message === 'PORT_OCCUPIED') throw e;
  }
  child = spawn(
    'anvil',
    [
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--chain-id',
      '1',
      '--fork-url',
      remote,
      '--fork-block-number',
      String(deployment.referenceBlock.number),
      '--silent',
    ],
    { stdio: 'ignore' },
  );
  let startupError = false;
  child.on('error', () => {
    startupError = true;
  });
  const req = new ethers.FetchRequest(localUrl);
  req.timeout = 20000;
  provider = new ethers.JsonRpcProvider(req, 1, { staticNetwork: true, batchMaxCount: 1, cacheTimeout: -1 });
  provider.pollingInterval = 25;
  for (let i = 0; i < 100; i++) {
    if (startupError) throw new Error('ANVIL_START_FAILED');
    try {
      await provider.send('web3_clientVersion', []);
      break;
    } catch {
      await wait(100);
    }
  }
  assert.match(await provider.send('web3_clientVersion', []), /anvil/i);
  assert.equal(await provider.send('eth_chainId', []), '0x1');
  assert.equal(await provider.getBlockNumber(), deployment.referenceBlock.number);
  const rpc = readonlyRpc(localUrl);
  const now = BigInt(sourceHeader.timestamp);
  const config = { ...fixture, expiry: String(now + 86400n) };
  const request = { ...requestFixture, deadline: String(now + 3600n) };
  const opts = { now };
  const ercAbi = [
    'function balanceOf(address) view returns(uint256)',
    'function allowance(address,address) view returns(uint256)',
    'function approve(address,uint256) returns(bool)',
    'function transfer(address,uint256) returns(bool)',
    'function wrapTo(uint256,address) returns(uint256)',
  ];
  const token = (a, s = provider) => new ethers.Contract(a, ercAbi, s);
  async function impersonate(a) {
    await provider.send('anvil_impersonateAccount', [a]);
    await provider.send('anvil_setBalance', [a, '0x56bc75e2d63100000']);
    return provider.getSigner(a);
  }
  const maker = await impersonate(MAKER),
    operator = await impersonate(OPERATOR);
  assert((await token(C.resolverCredential).balanceOf(OPERATOR)) > 0n, 'Real resolver credential absent');
  const factory = new ethers.Contract(
    '0x1f98431c8ad98523631ae4a59f267346ea31f984',
    ['function getPool(address,address,uint24) view returns(address)'],
    provider,
  );
  const source = await factory.getPool(C.usdc, C.usdt, 100);
  assert.notEqual(source, ethers.ZeroAddress);
  const funder = await impersonate(source);
  const sent = async (s, tx) => {
    const { purpose, chainId, ...data } = tx;
    return (await s.sendTransaction(data)).wait();
  };
  for (const t of TOKENS) {
    await (await token(t.underlying, funder).transfer(MAKER, 1000_000000n)).wait();
    await (await token(t.underlying, funder).transfer(OPERATOR, 1000_000000n)).wait();
    for (const s of [maker, operator]) {
      await (await token(t.underlying, s).approve(t.address, 100_000000n)).wait();
      await (await token(t.address, s).wrapTo(100_000000n, await s.getAddress())).wait();
    }
    await (await token(t.address, operator).approve(C.swapVmRouter, 100_000000n)).wait();
  }
  await provider.send('anvil_stopImpersonatingAccount', [source]);
  const built = buildStrategy(config, opts);
  const compilerInput = {
    language: 'Solidity',
    sources: {
      'RecipeHarness.sol': { content: readFileSync(new URL('./RecipeHarness.sol', import.meta.url), 'utf8') },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: 'cancun',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const compiled = JSON.parse(solc.compile(JSON.stringify(compilerInput)));
  assert.equal(
    (compiled.errors || []).filter((e) => e.severity === 'error').length,
    0,
    'Harness compilation failed',
  );
  const recipeArtifact = compiled.contracts['RecipeHarness.sol'].RecipeHarness;
  const recipeHarness = await new ethers.ContractFactory(
    recipeArtifact.abi,
    recipeArtifact.evm.bytecode.object,
    operator,
  ).deploy(C.swapVmRouter, OPERATOR);
  await recipeHarness.waitForDeployment();
  const recipeExecutor = (await recipeHarness.getAddress()).toLowerCase();
  for (const t of TOKENS)
    await (await token(t.underlying, operator).approve(recipeExecutor, 100_000000n)).wait();
  async function test(name, fn) {
    const snap = await provider.send('evm_snapshot', []);
    report.currentCase = name;
    try {
      const details = await fn();
      report.tests.push({ name, passed: true, ...details });
      console.log(`PASS ${name}`);
      save();
    } finally {
      assert.equal(await provider.send('evm_revert', [snap]), true);
    }
  }
  await test('unshipped strategy detected before maker authorization', async () => {
    const r = await preflight(rpc, config, { ...opts, request });
    assert.equal(r.status, 'insufficient');
    assert(r.issues.includes('STRATEGY_NOT_ACTIVE'));
    return { state: r.maker.map((x) => x.state) };
  });
  for (const tx of buildAquaShipPlan(config, opts).transactions) await sent(maker, tx);
  report.strategyHash = built.bundle.strategyHash;
  report.syntheticInventory = {
    fwUSDC: '30',
    fwUSDT: '33',
    source: 'impersonated V3 pool and real FewToken.wrapTo on local fork only',
    capitalRecommendation: false,
  };
  writeFileSync(new URL('unsigned-fixture.json', evidence), json(built.bundle));
  await test('SDK v0.4.2 + Aqua v0.3.2 compatible with deployed v1.0.2 router', async () => {
    const r = await preflight(rpc, config, { ...opts, request });
    assert.equal(r.status, 'available', json(r));
    assert.equal(r.fillSimulation.status, 'passed');
    writeFileSync(new URL('preflight.json', evidence), json(r));
    return { block: r.block, quote: r.quote, fillSimulation: r.fillSimulation };
  });
  for (const [asset, t] of [
    ['USDC', TOKENS[0]],
    ['USDT', TOKENS[1]],
  ]) {
    await test(`SDK ${asset} wrap and unwrap plans reconcile real balances and allowances`, async () => {
      const input = { chainId: 1, maker: MAKER, asset, amount: '1250001' };
      const beforeOrigin = await token(t.underlying).balanceOf(MAKER);
      const beforeFew = await token(t.address).balanceOf(MAKER);
      for (const tx of buildMakerWrapPlan(input).transactions) await sent(maker, tx);
      assert.equal(await token(t.underlying).balanceOf(MAKER), beforeOrigin - 1250001n);
      assert.equal(await token(t.address).balanceOf(MAKER), beforeFew + 1250001n);
      assert.equal(await token(t.underlying).allowance(MAKER, t.address), 0n);
      for (const tx of buildMakerUnwrapPlan(input).transactions) await sent(maker, tx);
      assert.equal(await token(t.underlying).balanceOf(MAKER), beforeOrigin);
      assert.equal(await token(t.address).balanceOf(MAKER), beforeFew);
    });
  }
  const makeRecipe = (direction, exactIn = true, threshold = exactIn ? '800000' : '2000000') =>
    buildUnderlyingRoute(
      config,
      {
        chainId: 1,
        direction,
        exactIn,
        amount: '1000000',
        threshold,
        deadline: request.deadline,
        operator: OPERATOR,
        executor: recipeExecutor,
        receiver: USER,
      },
      opts,
    );
  const recipeArgs = (p) => [
    p.originIn,
    p.fewIn,
    p.fewOut,
    p.originOut,
    p.maxAmountIn,
    p.minAmountOut,
    p.deadline,
    p.receiver,
    p.swapCall.data,
  ];
  const recipeBalances = async (p) => {
    const balances = [];
    for (const a of [OPERATOR, USER, MAKER, recipeExecutor])
      for (const t of [p.originIn, p.fewIn, p.fewOut, p.originOut])
        balances.push(String(await token(t).balanceOf(a)));
    return balances;
  };
  for (const direction of ['USDC_USDT', 'USDT_USDC'])
    for (const exactIn of [true, false]) {
      await test(`SDK recipe ${direction} ${exactIn ? 'exact-in' : 'exact-out'} settles and refunds actual amounts`, async () => {
        const p = makeRecipe(direction, exactIn);
        // Donated/preexisting tokens are not part of this order and must not be swept.
        for (const t of [p.originIn, p.fewIn, p.fewOut, p.originOut])
          await (await token(t, operator).transfer(recipeExecutor, 7n)).wait();
        const raw = await provider.call(p.quoteCall);
        const [expectedIn, expectedOut] = routerAbi.decodeFunctionResult('quote', raw);
        const beforeIn = await token(p.originIn).balanceOf(OPERATOR);
        const beforeOut = await token(p.originOut).balanceOf(USER);
        const result = await recipeHarness.execute.staticCall(...recipeArgs(p));
        assert.equal(result[0], expectedIn);
        assert.equal(result[1], expectedOut);
        const receipt = await (await recipeHarness.execute(...recipeArgs(p))).wait();
        assert.equal(beforeIn - (await token(p.originIn).balanceOf(OPERATOR)), expectedIn);
        assert.equal((await token(p.originOut).balanceOf(USER)) - beforeOut, expectedOut);
        if (!exactIn) assert(BigInt(p.maxAmountIn) > expectedIn, 'Exact-out refund was not exercised');
        for (const t of [p.originIn, p.fewIn, p.fewOut, p.originOut])
          assert.equal(await token(t).balanceOf(recipeExecutor), 7n);
        assert.equal(await token(p.originIn).allowance(recipeExecutor, p.fewIn), 0n);
        assert.equal(await token(p.fewIn).allowance(recipeExecutor, C.swapVmRouter), 0n);
        const swaps = receipt.logs
          .filter((l) => l.address.toLowerCase() === C.swapVmRouter)
          .map((l) => {
            try {
              return routerAbi.parseLog(l);
            } catch {
              return null;
            }
          })
          .filter((l) => l?.name === 'Swapped');
        assert.equal(swaps.length, 1);
        return {
          amountIn: expectedIn,
          amountOut: expectedOut,
          refund: BigInt(p.maxAmountIn) - expectedIn,
          gasUsed: receipt.gasUsed,
          recipeHash: p.recipeHash,
          composition: 'Ring SDK recipe interpreted by a local test-only executor',
        };
      });
    }
  await test('SDK recipe failing after wrapping rolls back input, maker and recipient balances', async () => {
    const p = makeRecipe('USDC_USDT', true, '50000000');
    const before = await recipeBalances(p);
    await assert.rejects(async () =>
      (await recipeHarness.execute(...recipeArgs(p), { gasLimit: 1500000 })).wait(),
    );
    assert.deepEqual(await recipeBalances(p), before);
    assert.equal(await token(p.originIn).allowance(recipeExecutor, p.fewIn), 0n);
    assert.equal(await token(p.fewIn).allowance(recipeExecutor, C.swapVmRouter), 0n);
  });
  await test('SDK recipe wrong swap recipient cannot leave FewToken outside atomic settlement', async () => {
    const p = makeRecipe('USDC_USDT');
    const q = buildQuote(config, { ...request, threshold: p.minAmountOut, receiver: USER }, opts);
    const altered = { ...p, swapCall: new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(q.args) };
    const before = await recipeBalances(p);
    await assert.rejects(async () =>
      (await recipeHarness.execute(...recipeArgs(altered), { gasLimit: 1500000 })).wait(),
    );
    assert.deepEqual(await recipeBalances(p), before);
  });
  await test('SDK recipe insufficient immediate redemption backing rolls back the Aqua fill', async () => {
    const p = makeRecipe('USDC_USDT');
    const wrapper = await impersonate(p.fewOut);
    await (
      await token(p.originOut, wrapper).transfer(USER, await token(p.originOut).balanceOf(p.fewOut))
    ).wait();
    const before = await recipeBalances(p);
    await assert.rejects(async () =>
      (await recipeHarness.execute(...recipeArgs(p), { gasLimit: 1500000 })).wait(),
    );
    assert.deepEqual(await recipeBalances(p), before);
  });
  await test('SDK recipe deadline remains enforced during atomic execution', async () => {
    const p = makeRecipe('USDC_USDT');
    await provider.send('evm_setNextBlockTimestamp', [Number(p.deadline) + 1]);
    const before = await recipeBalances(p);
    await assert.rejects(async () =>
      (await recipeHarness.execute(...recipeArgs(p), { gasLimit: 1500000 })).wait(),
    );
    assert.deepEqual(await recipeBalances(p), before);
  });
  await test('SDK dock plan closes an expired position without requiring a future expiry', async () => {
    await provider.send('evm_setNextBlockTimestamp', [Number(config.expiry) + 1]);
    await provider.send('evm_mine', []);
    const p = buildAquaDockPlan(config);
    for (const tx of p.transactions) await sent(maker, tx);
    for (const t of TOKENS) assert.equal(await token(t.address).allowance(MAKER, C.aqua), 0n);
    const a = new ethers.Contract(
      C.aqua,
      ['function rawBalances(address,address,bytes32,address) view returns(uint248,uint8)'],
      provider,
    );
    for (const t of TOKENS)
      assert.equal((await a.rawBalances(MAKER, C.swapVmRouter, p.strategyHash, t.address))[1], 255n);
  });
  function quoteRequest(direction, exactIn, amount, threshold = '1', receiver = OPERATOR) {
    return { ...request, direction, exactIn, amount: String(amount), threshold: String(threshold), receiver };
  }
  async function quote(req) {
    const q = buildQuote(config, req, opts);
    const raw = await provider.call(q.transaction);
    const [amountIn, amountOut] = routerAbi.decodeFunctionResult('quote', raw);
    return { q, amountIn, amountOut };
  }
  for (const direction of ['USDC_USDT', 'USDT_USDC'])
    for (const exactIn of [true, false]) {
      await test(`direct ${direction} ${exactIn ? 'exact-in' : 'exact-out'} quote matches real settlement`, async () => {
        const req = quoteRequest(direction, exactIn, 1_000000n, exactIn ? 1n : 2_000000n);
        const { amountIn, amountOut } = await quote(req);
        const bounded = buildQuote(
          config,
          { ...req, threshold: String(exactIn ? amountOut : amountIn) },
          opts,
        );
        const inBefore = await token(bounded.tokenIn).balanceOf(OPERATOR),
          outBefore = await token(bounded.tokenOut).balanceOf(OPERATOR);
        const receipt = await sent(
          operator,
          new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(bounded.args),
        );
        assert.equal(inBefore - (await token(bounded.tokenIn).balanceOf(OPERATOR)), amountIn);
        assert.equal((await token(bounded.tokenOut).balanceOf(OPERATOR)) - outBefore, amountOut);
        return { amountIn, amountOut, gasUsed: receipt.gasUsed };
      });
      await test(`atomic wrap-Aqua-unwrap ${direction} ${exactIn ? 'exact-in' : 'exact-out'}`, async () => {
        const req = quoteRequest(direction, exactIn, 1_000000n, exactIn ? 1n : 2_000000n, recipeExecutor);
        const { amountIn, amountOut } = await quote(req);
        const b = buildQuote(config, { ...req, threshold: String(exactIn ? amountOut : amountIn) }, opts);
        const [a, z] = direction === 'USDC_USDT' ? TOKENS : [...TOKENS].reverse();
        const beforeIn = await token(a.underlying).balanceOf(OPERATOR),
          beforeOut = await token(z.underlying).balanceOf(OPERATOR);
        const tx = new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(b.args);
        const receipt = await (
          await recipeHarness.execute(
            a.underlying,
            a.address,
            z.address,
            z.underlying,
            amountIn,
            amountOut,
            req.deadline,
            OPERATOR,
            String(tx.data),
          )
        ).wait();
        assert.equal(beforeIn - (await token(a.underlying).balanceOf(OPERATOR)), amountIn);
        assert.equal((await token(z.underlying).balanceOf(OPERATOR)) - beforeOut, amountOut);
        assert.equal(await token(a.address).balanceOf(recipeExecutor), 0n);
        assert.equal(await token(z.address).balanceOf(recipeExecutor), 0n);
        assert.equal(await token(a.address).allowance(recipeExecutor, C.swapVmRouter), 0n);
        const swaps = receipt.logs
          .filter((l) => l.address.toLowerCase() === C.swapVmRouter)
          .map((l) => {
            try {
              return routerAbi.parseLog(l);
            } catch {
              return null;
            }
          })
          .filter((x) => x?.name === 'Swapped');
        assert.equal(swaps.length, 1, 'Missing official router Swapped event');
        return {
          amountIn,
          amountOut,
          gasUsed: receipt.gasUsed,
          transactionHash: receipt.hash,
          composition: 'explicit test harness; no official frontend involvement',
        };
      });
    }
  for (const direction of ['USDC_USDT', 'USDT_USDC'])
    for (const amount of [5_000000n, 25_000000n])
      await test(`atomic ${direction} size ${amount / 1000000n} with actual origin-token deltas`, async () => {
        const req = quoteRequest(direction, true, amount, 1n, recipeExecutor);
        const { amountIn, amountOut } = await quote(req);
        const b = buildQuote(config, { ...req, threshold: String(amountOut) }, opts);
        const [a, z] = direction === 'USDC_USDT' ? TOKENS : [...TOKENS].reverse();
        const beforeIn = await token(a.underlying).balanceOf(OPERATOR),
          beforeOut = await token(z.underlying).balanceOf(OPERATOR);
        const tx = new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(b.args);
        const receipt = await (
          await recipeHarness.execute(
            a.underlying,
            a.address,
            z.address,
            z.underlying,
            amountIn,
            amountOut,
            req.deadline,
            OPERATOR,
            String(tx.data),
          )
        ).wait();
        assert.equal(beforeIn - (await token(a.underlying).balanceOf(OPERATOR)), amountIn);
        assert.equal((await token(z.underlying).balanceOf(OPERATOR)) - beforeOut, amountOut);
        return { amountIn, amountOut, gasUsed: receipt.gasUsed };
      });
  await test('maker balances, virtual balances, protocol fee and cumulative allowances reconcile', async () => {
    const aqua = new ethers.Contract(
      C.aqua,
      ['function safeBalances(address,address,bytes32,address,address) view returns(uint256,uint256)'],
      provider,
    );
    const before = {};
    for (const t of TOKENS)
      before[t.address] = {
        balance: await token(t.address).balanceOf(MAKER),
        allowance: await token(t.address).allowance(MAKER, C.aqua),
      };
    const virtualBefore = await aqua.safeBalances(
      MAKER,
      C.swapVmRouter,
      built.bundle.strategyHash,
      C.fwUsdc,
      C.fwUsdt,
    );
    const feeBefore = await token(C.fwUsdc).balanceOf(config.protocolFeeReceiver);
    const q = await quote(request);
    const tx = new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(q.q.args);
    await sent(operator, tx);
    const fee = (await token(C.fwUsdc).balanceOf(config.protocolFeeReceiver)) - feeBefore;
    assert(fee > 0n, 'Protocol fee was not paid');
    const afterVirtual = await aqua.safeBalances(
      MAKER,
      C.swapVmRouter,
      built.bundle.strategyHash,
      C.fwUsdc,
      C.fwUsdt,
    );
    assert.equal((await token(C.fwUsdc).balanceOf(MAKER)) - before[C.fwUsdc].balance, q.amountIn - fee);
    assert.equal(before[C.fwUsdt].balance - (await token(C.fwUsdt).balanceOf(MAKER)), q.amountOut);
    assert.equal(afterVirtual[0] - virtualBefore[0], q.amountIn - fee);
    assert.equal(virtualBefore[1] - afterVirtual[1], q.amountOut);
    assert.equal(before[C.fwUsdc].allowance - (await token(C.fwUsdc).allowance(MAKER, C.aqua)), fee);
    const remaining = await token(C.fwUsdt).allowance(MAKER, C.aqua);
    assert.equal(before[C.fwUsdt].allowance - remaining, q.amountOut);
    const reverse = await quote(quoteRequest('USDT_USDC', true, 1_000000n));
    await sent(operator, new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(reverse.q.args));
    assert(
      (await token(C.fwUsdt).allowance(MAKER, C.aqua)) < remaining,
      'Incoming swap must not replenish gross allowance',
    );
    return { protocolFeeRaw: fee };
  });
  await test('missing KycNFT cannot quote or execute', async () => {
    const r = await preflight(rpc, config, { ...opts, request: { ...request, taker: USER } });
    assert(r.issues.includes('TAKER_CREDENTIAL_MISSING'));
    assert.equal(r.quote, null);
  });
  await test('wrong factory-to-wrapper binding fails before quoting', async () => {
    const altered = async (method, params) => {
      if (method === 'eth_call' && params[0].to === C.fewFactory)
        return erc20.encodeFunctionResult('getWrappedToken', [USER]);
      return rpc(method, params);
    };
    const r = await preflight(altered, config, { ...opts, request });
    assert.equal(r.status, 'read_failed');
    assert.equal(r.canonicalTokens, false);
    assert.equal(r.quote, null);
    assert(r.issues.includes('WRAPPER_BINDING_MISMATCH'));
  });
  await test('ordinary token input does not automatically use FewToken strategy', async () => {
    const q = buildQuote(config, request, opts);
    const tx = new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).quote({
      ...q.args,
      tokenIn: new sdk.Address(C.usdc),
      tokenOut: new sdk.Address(C.usdt),
    });
    await assert.rejects(() => provider.call({ ...tx, from: OPERATOR }));
  });
  await test('maker missing approval is detected even if mathematical quote succeeds', async () => {
    await (await token(C.fwUsdt, maker).approve(C.aqua, 0)).wait();
    const r = await preflight(rpc, config, { ...opts, request });
    assert.equal(r.status, 'insufficient');
    assert.equal(r.fillSimulation?.status, 'failed');
    assert(r.issues.includes('MAKER_OUTFLOW_INSUFFICIENT'));
  });
  await test('maker physical balance below virtual inventory blocks fill', async () => {
    await (await token(C.fwUsdt, maker).transfer(USER, await token(C.fwUsdt).balanceOf(MAKER))).wait();
    const r = await preflight(rpc, config, { ...opts, request });
    assert.equal(r.status, 'insufficient');
    assert.equal(r.fillSimulation?.status, 'failed');
  });
  await test('missing taker approval blocks fill simulation', async () => {
    await (await token(C.fwUsdc, operator).approve(C.swapVmRouter, 0)).wait();
    const r = await preflight(rpc, config, { ...opts, request });
    assert.equal(r.fillSimulation.status, 'failed');
  });
  await test('one-wei tighter min-out / max-in protection reverts settlement', async () => {
    for (const exactIn of [true, false]) {
      const req = quoteRequest('USDC_USDT', exactIn, 1_000000n, exactIn ? 1n : 2_000000n);
      const { amountIn, amountOut } = await quote(req);
      const b = buildQuote(
        config,
        { ...req, threshold: String(exactIn ? amountOut + 1n : amountIn - 1n) },
        opts,
      );
      const tx = new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(b.args);
      await assert.rejects(() => provider.call({ ...tx, from: OPERATOR }));
    }
  });
  await test('oversized output cannot consume unavailable virtual inventory', async () => {
    await assert.rejects(() => quote(quoteRequest('USDC_USDT', false, 34_000000n, 99_000000n)));
  });
  await test('maker program expiry is enforced onchain', async () => {
    await provider.send('evm_setNextBlockTimestamp', [Number(config.expiry) + 1]);
    await provider.send('evm_mine', []);
    const q = buildQuote(config, request, opts);
    await assert.rejects(() => provider.call(q.transaction));
  });
  await test('taker deadline independently enforced onchain', async () => {
    const b = buildQuote(config, { ...request, deadline: String(now + 500n) }, opts);
    await provider.send('evm_setNextBlockTimestamp', [Number(now) + 501]);
    await provider.send('evm_mine', []);
    const tx = new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(b.args);
    await assert.rejects(() => provider.call({ ...tx, from: OPERATOR }));
  });
  await test('dock and revoke fully disable strategy without moving maker funds', async () => {
    const before = await Promise.all(TOKENS.map((t) => token(t.address).balanceOf(MAKER)));
    for (const tx of built.bundle.close) await sent(maker, tx);
    const r = await preflight(rpc, config, { ...opts, request });
    assert(r.maker.every((x) => x.state === 'docked' && x.allowance === 0n));
    assert.equal(r.quote, null);
    assert.deepEqual(await Promise.all(TOKENS.map((t) => token(t.address).balanceOf(MAKER))), before);
  });
  await runOfficialCases({ provider, test, sent, token, maker, operator, config, request, now, rpc });
  await runMarketCases({
    provider,
    test,
    sent,
    token,
    impersonate,
    factory,
    maker,
    operator,
    recipeHarness,
    recipeExecutor,
    now,
    rpc,
  });
  delete report.currentCase;
  report.completed = true;
  report.completedAt = new Date().toISOString();
  save();
  writeFileSync(new URL('fork-results.json', evidence), json(report));
  console.log(`All ${report.tests.length} fork cases passed. No mainnet transaction sent.`);
}
main()
  .catch((e) => {
    // Remote/child errors must never serialize env vars or spawn arguments.
    report.completed = false;
    report.failure = String(e.shortMessage || e.message || 'FORK_FAILED')
      .replace(/https?:\/\/\S+/g, '[redacted-url]')
      .slice(0, 3000);
    save();
    console.error(report.failure);
    process.exitCode = 1;
  })
  .finally(() => {
    provider?.destroy();
    child?.kill('SIGTERM');
  });
