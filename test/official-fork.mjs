import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Contract, Interface } from 'ethers';
import { C, TOKENS, sdk, routerAbi, aquaAbi, buildQuote } from '../strategy.mjs';
import { buildAquaShipPlan, buildAquaDockPlan, preflight } from '../index.mjs';
import { MAKER, OPERATOR, USER } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const aquaSdk = require('@1inch/aqua-sdk');
const registryAbi = new Interface([
  'function ship(address,bytes,address[],uint256[])',
  'function dock(address,bytes32,address[])',
]);

// Called only after fork.mjs starts and verifies its own loopback Anvil.
// These cases use official event decoders and deployed registry/router behavior.
export async function runOfficialCases({
  provider,
  test,
  sent,
  token,
  maker,
  operator,
  config,
  request,
  now,
  rpc,
}) {
  const opts = { now };
  const router = new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter));
  const original = buildAquaShipPlan(config, opts);
  const different = (n) => ({ ...config, salt: String(BigInt(config.salt) + BigInt(n)) });
  const events = (receipt, address, Type) =>
    receipt.logs
      .filter((log) => log.address.toLowerCase() === address && log.topics[0] === String(Type.TOPIC))
      .map((log) => Type.fromLog(log));
  async function open(c) {
    const plan = buildAquaShipPlan(c, opts);
    let receipt;
    for (const tx of plan.transactions) receipt = await sent(maker, tx);
    return { plan, receipt };
  }
  const balances = () => Promise.all(TOKENS.map((t) => token(t.address).balanceOf(MAKER)));
  const close = (plan) =>
    buildAquaDockPlan({
      chainId: 1,
      maker: MAKER,
      strategyHash: plan.strategyHash,
      tokens: plan.tokenAmounts.map((t) => t.address),
    });

  await test('official SDK decodes ship and fill events, reconstructs the order, and decodes shutdown', async () => {
    const c = different(101);
    const before = await balances();
    const { plan, receipt } = await open(c);
    assert.deepEqual(await balances(), before, 'Ship must not transfer maker inventory');
    const shipped = events(receipt, C.aqua, aquaSdk.ShippedEvent);
    assert.equal(shipped.length, 1);
    assert.equal(String(shipped[0].maker).toLowerCase(), MAKER);
    assert.equal(String(shipped[0].app).toLowerCase(), C.swapVmRouter);
    assert.equal(String(shipped[0].strategyHash), plan.strategyHash);
    assert.equal(String(shipped[0].strategy), plan.encodedOrder);
    const pushed = events(receipt, C.aqua, aquaSdk.PushedEvent);
    assert.deepEqual(
      pushed.map((p) => [String(p.token).toLowerCase(), String(p.amount)]),
      plan.tokenAmounts.map((t) => [t.address, t.amount]),
    );
    const reconstructed = sdk.Order.decode(new sdk.HexString(String(shipped[0].strategy)));
    const hashCall = router.hashOrder(reconstructed);
    const [hash] = routerAbi.decodeFunctionResult('hash', await provider.call(hashCall));
    assert.equal(hash, plan.strategyHash);
    const q = buildQuote(c, { ...request, receiver: USER }, opts);
    const args = { ...q.args, order: reconstructed };
    const quoted = routerAbi.decodeFunctionResult(
      'quote',
      await provider.call({ ...router.quote(args), from: OPERATOR }),
    );
    const beforeOut = await token(C.fwUsdt).balanceOf(USER);
    const filled = await sent(operator, router.swap(args));
    const swaps = events(filled, C.swapVmRouter, sdk.SwappedEvent);
    assert.equal(swaps.length, 1);
    assert.equal(String(swaps[0].orderHash), plan.strategyHash);
    assert.equal(String(swaps[0].maker).toLowerCase(), MAKER);
    assert.equal(String(swaps[0].taker).toLowerCase(), OPERATOR);
    assert.equal(String(swaps[0].tokenIn).toLowerCase(), C.fwUsdc);
    assert.equal(String(swaps[0].tokenOut).toLowerCase(), C.fwUsdt);
    assert.equal(swaps[0].amountIn, quoted[0]);
    assert.equal(swaps[0].amountOut, quoted[1]);
    assert.equal((await token(C.fwUsdt).balanceOf(USER)) - beforeOut, quoted[1]);
    const shutdown = close(plan);
    const dockReceipt = await sent(maker, shutdown.transaction);
    const docked = events(dockReceipt, C.aqua, aquaSdk.DockedEvent);
    assert.equal(docked.length, 1);
    assert.equal(String(docked[0].strategyHash), plan.strategyHash);
    for (const tx of shutdown.transactions.slice(1)) await sent(maker, tx);
    await assert.rejects(provider.call({ ...router.quote(args), from: OPERATOR }));
    return {
      source: 'official Shipped/Pushed/Swapped/Docked decoders',
      strategyHash: hash,
      amountIn: quoted[0],
      amountOut: quoted[1],
    };
  });

  await test('official registry rejects partial-token docking without changing either token state', async () => {
    const before = await preflight(rpc, config, { ...opts, request });
    const data = registryAbi.encodeFunctionData('dock', [C.swapVmRouter, original.strategyHash, [C.fwUsdc]]);
    await assert.rejects(provider.call({ to: C.aqua, from: MAKER, data }));
    const after = await preflight(rpc, config, { ...opts, request });
    assert.equal(after.status, 'available');
    assert.deepEqual(after.maker, before.maker);
  });

  await test('official registry rejects re-shipping an active or previously docked strategy identity', async () => {
    await assert.rejects(provider.call(original.transaction));
    await sent(maker, close(original).transaction);
    await assert.rejects(provider.call(original.transaction));
    const c = different(102);
    const { plan } = await open(c);
    assert.notEqual(plan.strategyHash, original.strategyHash);
    assert.equal((await preflight(rpc, c, { ...opts, request })).status, 'available');
  });

  await test('official dock caller identity prevents another wallet from closing the maker position', async () => {
    await assert.rejects(provider.call({ ...close(original).transaction, from: USER }));
    assert.equal((await preflight(rpc, config, { ...opts, request })).status, 'available');
  });

  await test('shared Aqua allowance can block a sibling position even when its quote remains unchanged', async () => {
    const c = different(103);
    await open(c);
    const req = { ...request, exactIn: false, amount: '32000000', threshold: '99000000' };
    const before = await preflight(rpc, c, { ...opts, request: req });
    assert.equal(before.status, 'available', JSON.stringify(before.issues));
    await sent(operator, router.swap(buildQuote(config, request, opts).args));
    const after = await preflight(rpc, c, { ...opts, request: req });
    assert.deepEqual(after.quote, before.quote, 'Sibling virtual quote must be unchanged');
    assert(after.issues.includes('MAKER_OUTFLOW_INSUFFICIENT'));
    assert.equal(after.fillSimulation.status, 'failed');
    assert.equal(after.maker[1].virtualBalance, before.maker[1].virtualBalance);
    assert(after.maker[1].allowance < before.maker[1].allowance);
    return { before: before.status, after: after.status, unchangedQuoteOut: after.quote.amountOut };
  });

  await test('closing one strategy and revoking shared allowance leaves a sibling active but unfillable', async () => {
    const c = different(104);
    await open(c);
    for (const tx of close(original).transactions) await sent(maker, tx);
    const sibling = await preflight(rpc, c, { ...opts, request });
    assert(sibling.maker.every((t) => t.state === 'active' && t.allowance === 0n));
    assert.equal(sibling.status, 'insufficient');
    assert.equal(sibling.fillSimulation.status, 'failed');
    assert(sibling.issues.includes('MAKER_OUTFLOW_INSUFFICIENT'));
  });

  await test('v1.0.2 can skip an unpaid protocol fee while settling; preflight preserves the fee buffer warning', async () => {
    await (await token(C.fwUsdc, maker).approve(C.aqua, 0n)).wait();
    const checked = await preflight(rpc, config, { ...opts, request });
    assert(checked.issues.includes('PROTOCOL_FEE_BUFFER_INSUFFICIENT'));
    assert.equal(checked.status, 'insufficient');
    assert.equal(checked.fillSimulation.status, 'passed');
    const receiverBefore = await token(C.fwUsdc).balanceOf(config.protocolFeeReceiver);
    const makerBefore = await token(C.fwUsdc).balanceOf(MAKER);
    const receipt = await sent(operator, router.swap(buildQuote(config, request, opts).args));
    const skippedAbi = new Interface([
      'event ProtocolFeeSkipped(bytes32 orderHash,address token,address to,uint256 amount)',
    ]);
    const skipped = receipt.logs
      .filter(
        (l) =>
          l.address.toLowerCase() === C.swapVmRouter &&
          l.topics[0] === skippedAbi.getEvent('ProtocolFeeSkipped').topicHash,
      )
      .map((l) => skippedAbi.parseLog(l).args);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].orderHash, original.strategyHash);
    assert.equal(skipped[0].token.toLowerCase(), C.fwUsdc);
    assert.equal(skipped[0].to.toLowerCase(), config.protocolFeeReceiver);
    assert(skipped[0].amount > 0n);
    assert.equal(await token(C.fwUsdc).balanceOf(config.protocolFeeReceiver), receiverBefore);
    assert.equal((await token(C.fwUsdc).balanceOf(MAKER)) - makerBefore, BigInt(request.amount));
    const aqua = new Contract(C.aqua, aquaAbi, provider);
    assert(
      (await aqua.safeBalances(MAKER, C.swapVmRouter, original.strategyHash, C.fwUsdc, C.fwUsdt))[0] > 0n,
    );
    return {
      skippedProtocolFee: skipped[0].amount,
      feeReceived: 0n,
      swapSucceeded: true,
      preflightStatus: checked.status,
    };
  });
}
