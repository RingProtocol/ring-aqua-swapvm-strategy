import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import * as kit from '../index.mjs';
import { C, erc20, routerAbi } from '../strategy.mjs';
import { MAKER, OPERATOR, USER, config as legacy } from './fixtures.mjs';
import { market, concentrated } from './market-fixtures.mjs';

// Invoked only by fork.mjs after it creates and verifies its own loopback Anvil.
export async function runMarketCases({
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
}) {
  const opts = { now };
  const WETH = kit.getAsset('WETH').underlying;
  const budgets = { USDC: 2000n, USDT: 2000n, DAI: 2000n, UNI: 100n };
  const funds = new Map();
  const factoryFew = new ethers.Contract(C.fewFactory, erc20, provider);
  for (const t of kit.ASSETS) {
    console.log(`Preparing fork inventory: ${t.asset}`);
    assert.equal((await factoryFew.getWrappedToken(t.underlying)).toLowerCase(), t.address);
    const few = new ethers.Contract(t.address, erc20, provider);
    assert.equal((await few.token()).toLowerCase(), t.underlying);
    for (const a of [t.address, t.underlying])
      assert.equal(Number(await new ethers.Contract(a, erc20, provider).decimals()), t.decimals);
    const budget = budgets[t.asset]
      ? budgets[t.asset] * 10n ** BigInt(t.decimals)
      : 10n ** BigInt(t.decimals) / (['WBTC', 'cbBTC'].includes(t.asset) ? 100n : 1n);
    funds.set(t.asset, budget);
    if (t.asset === 'WETH') {
      for (const signer of [maker, operator])
        await sent(signer, { to: WETH, data: '0xd0e30db0', value: budget * 3n });
    } else {
      let source;
      for (const other of [WETH, C.usdc, C.usdt]) {
        if (other === t.underlying) continue;
        for (const fee of [500, 3000, 100, 10000]) {
          const pool = await factory.getPool(t.underlying, other, fee);
          if (pool !== ethers.ZeroAddress && (await token(t.underlying).balanceOf(pool)) >= budget * 6n) {
            source = pool;
            break;
          }
        }
        if (source) break;
      }
      assert(source, `No bounded fork funding source for ${t.asset}`);
      const funder = await impersonate(source);
      for (const who of [MAKER, OPERATOR])
        await (await token(t.underlying, funder).transfer(who, budget * 3n)).wait();
      await provider.send('anvil_stopImpersonatingAccount', [source]);
    }
    for (const [signer, who] of [
      [maker, MAKER],
      [operator, OPERATOR],
    ]) {
      for (const tx of kit.buildMakerWrapPlan({
        chainId: 1,
        maker: who,
        asset: t.asset,
        amount: String(budget),
      }).transactions)
        await sent(signer, tx);
    }
    await (await token(t.address, operator).approve(C.swapVmRouter, 0n)).wait();
    await (await token(t.address, operator).approve(C.swapVmRouter, budget)).wait();
    await (await token(t.underlying, operator).approve(recipeExecutor, 0n)).wait();
    await (await token(t.underlying, operator).approve(recipeExecutor, budget)).wait();
    await test(`multiasset ${t.asset} canonical wrap/unwrap round-trip reconciles 1:1 and clears approval`, async () => {
      const amount = budget / 1000n,
        beforeOrigin = await token(t.underlying).balanceOf(MAKER),
        beforeFew = await token(t.address).balanceOf(MAKER);
      const input = { chainId: 1, maker: MAKER, asset: t.asset, amount: String(amount) };
      for (const tx of kit.buildMakerWrapPlan(input).transactions) await sent(maker, tx);
      assert.equal(await token(t.address).balanceOf(MAKER), beforeFew + amount);
      assert.equal(await token(t.underlying).balanceOf(MAKER), beforeOrigin - amount);
      for (const tx of kit.buildMakerUnwrapPlan(input).transactions) await sent(maker, tx);
      assert.equal(await token(t.address).balanceOf(MAKER), beforeFew);
      assert.equal(await token(t.underlying).balanceOf(MAKER), beforeOrigin);
      assert.equal(await token(t.underlying).allowance(MAKER, t.address), 0n);
      return { asset: t.asset, decimals: t.decimals, canonical: true, syntheticForkFunding: true };
    });
  }
  const extra = { expiry: String(now + 86400n) };
  const cases = [
    market('USDC', 'WETH', '300000000', '100000000000000000', {
      ...extra,
      protocolFee: { feeRateE9: '2500', receiver: legacy.protocolFeeReceiver },
    }),
    market('WBTC', 'USDT', '100000', '100000000', extra),
    market('DAI', 'USDC', '30000000000000000000', '30000000', {
      ...extra,
      shape: 'curved_pegged',
      linearWidth: String(300n * 10n ** 27n),
    }),
    market('cbBTC', 'WBTC', '100000', '100000', extra),
    market('weETH', 'WETH', '100000000000000000', '100000000000000000', extra),
    market('UNI', 'WETH', '10000000000000000000', '100000000000000000', extra),
    market('wstETH', 'WETH', '100000000000000000', '100000000000000000', extra),
  ];
  cases.push(concentrated(cases[0]), concentrated(cases[1]));
  const open = async (c) => {
    const plan = kit.buildAquaShipPlan(c, opts);
    for (const tx of plan.transactions) await sent(maker, tx);
    return plan;
  };
  const route = (c, input, output, exactIn, receiver = USER) => ({
    chainId: 1,
    tokenIn: input.token.address,
    tokenOut: output.token.address,
    exactIn,
    amount: String(BigInt((exactIn ? input : output).amount) / 100n),
    threshold: exactIn ? '1' : String(BigInt(input.amount) / 10n),
    deadline: String(now + 3600n),
    operator: OPERATOR,
    executor: recipeExecutor,
    receiver,
  });
  const args = (p) => [
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
  const state = async (p) =>
    Promise.all(
      [OPERATOR, USER, MAKER, recipeExecutor].flatMap((who) =>
        [p.originIn, p.originOut, p.fewIn, p.fewOut].map((a) => token(a).balanceOf(who)),
      ),
    );
  for (const c of cases)
    for (const reverse of [false, true])
      for (const exactIn of [true, false]) {
        const [input, output] = reverse ? c.legs.toReversed() : c.legs;
        await test(`multiasset ${input.token.symbol}->${output.token.symbol} ${c.shape}${c.concentrate ? '/concentrated' : ''} ${exactIn ? 'exact-in' : 'exact-out'} direct and atomic settlement`, async () => {
          const plan = await open(c);
          const r = route(c, input, output, exactIn),
            { operator: _, executor: __, chainId: ___, ...takerFields } = r;
          const direct = { ...takerFields, taker: OPERATOR, receiver: OPERATOR };
          const [qin, qout] = routerAbi.decodeFunctionResult(
            'quote',
            await provider.call(kit.buildAquaQuoteCall(c, direct, opts)),
          );
          const bounded = { ...direct, threshold: String(exactIn ? qout : qin) };
          const beforeFewIn = await token(r.tokenIn).balanceOf(OPERATOR),
            beforeFewOut = await token(r.tokenOut).balanceOf(OPERATOR);
          const directReceipt = await sent(operator, kit.buildAquaSwapCall(c, bounded, opts));
          assert.equal(beforeFewIn - (await token(r.tokenIn).balanceOf(OPERATOR)), qin);
          assert.equal((await token(r.tokenOut).balanceOf(OPERATOR)) - beforeFewOut, qout);
          let p = kit.buildUnderlyingRoute(c, r, opts);
          const [ain, aout] = routerAbi.decodeFunctionResult('quote', await provider.call(p.quoteCall));
          p = kit.buildUnderlyingRoute(
            c,
            { ...r, threshold: String(exactIn ? aout : ain + ain / 10n + 1n) },
            opts,
          );
          // Leave unrelated dust in all four tokens; the recipe must preserve it.
          for (const a of [p.originIn, p.originOut, p.fewIn, p.fewOut])
            await (await token(a, operator).transfer(recipeExecutor, 7n)).wait();
          const beforeIn = await token(p.originIn).balanceOf(OPERATOR),
            beforeOut = await token(p.originOut).balanceOf(USER);
          const simulated = await recipeHarness.execute.staticCall(...args(p));
          assert.equal(simulated[0], ain);
          assert.equal(simulated[1], aout);
          const receipt = await (await recipeHarness.execute(...args(p))).wait();
          assert.equal(beforeIn - (await token(p.originIn).balanceOf(OPERATOR)), ain);
          assert.equal((await token(p.originOut).balanceOf(USER)) - beforeOut, aout);
          for (const a of [p.originIn, p.originOut, p.fewIn, p.fewOut])
            assert.equal(await token(a).balanceOf(recipeExecutor), 7n);
          assert.equal(await token(p.originIn).allowance(recipeExecutor, p.fewIn), 0n);
          assert.equal(await token(p.fewIn).allowance(recipeExecutor, C.swapVmRouter), 0n);
          // Close using only the stored identity, after the strategy has expired.
          await provider.send('evm_setNextBlockTimestamp', [Number(c.expiry) + 1]);
          await provider.send('evm_mine', []);
          for (const tx of kit.buildAquaDockPlan({
            chainId: 1,
            maker: MAKER,
            strategyHash: plan.strategyHash,
            tokens: c.legs.map((l) => l.token.address),
          }).transactions)
            await sent(maker, tx);
          for (const leg of c.legs) assert.equal(await token(leg.token.address).allowance(MAKER, C.aqua), 0n);
          await assert.rejects(provider.call(kit.buildAquaSwapCall(c, bounded, opts)));
          return {
            pair: [input.token.symbol, output.token.symbol],
            decimals: [input.token.decimals, output.token.decimals],
            exactIn,
            direct: { amountIn: qin, amountOut: qout, gasUsed: directReceipt.gasUsed },
            atomic: { amountIn: ain, amountOut: aout, gasUsed: receipt.gasUsed },
            closeAfterExpiry: true,
            syntheticForkFunding: true,
          };
        });
      }
  await test('multiasset pinned preflight verifies 6/18 metadata and official quote/fill simulation', async () => {
    const c = cases[0];
    await open(c);
    const r = route(c, c.legs[0], c.legs[1], true),
      { operator: _, executor: __, chainId: ___, ...q } = r;
    const result = await kit.preflight(rpc, c, {
      ...opts,
      request: { ...q, taker: OPERATOR, receiver: OPERATOR },
    });
    assert.equal(result.status, 'available', JSON.stringify(result.issues));
    assert.equal(result.fillSimulation.status, 'passed');
    assert.equal(result.canonicalTokens, true);
    return { canonicalTokens: true, fillSimulation: result.fillSimulation };
  });
  const c = cases[0];
  for (const failure of ['slippage', 'redemption', 'revoked-maker'])
    await test(`multiasset ${failure} failure reverts wrapped input and entire settlement`, async () => {
      await open(c);
      const r = route(c, c.legs[0], c.legs[1], true);
      if (failure === 'slippage') r.threshold = String(BigInt(c.legs[1].amount) * 100n);
      const p = kit.buildUnderlyingRoute(c, r, opts);
      if (failure === 'redemption') {
        const wrapper = await impersonate(p.fewOut);
        await (
          await token(p.originOut, wrapper).transfer(USER, await token(p.originOut).balanceOf(p.fewOut))
        ).wait();
        await provider.send('anvil_stopImpersonatingAccount', [p.fewOut]);
      }
      if (failure === 'revoked-maker') await (await token(p.fewOut, maker).approve(C.aqua, 0n)).wait();
      const before = await state(p);
      await assert.rejects((await recipeHarness.execute(...args(p), { gasLimit: 1800000 })).wait());
      assert.deepEqual(await state(p), before);
      assert.equal(await token(p.originIn).allowance(recipeExecutor, p.fewIn), 0n);
    });
  await test('multiasset one-sided concentrated inventory fills from zero input reserve', async () => {
    const c = concentrated(market('USDC', 'WETH', '300000000', '100000000000000000', extra));
    const r = route(c, c.legs[0], c.legs[1], true);
    c.legs[0].amount = '0';
    await open(c);
    const { operator: _, executor: __, chainId: ___, ...q } = r;
    const preflight = await kit.preflight(rpc, c, {
      ...opts,
      request: { ...q, taker: OPERATOR, receiver: OPERATOR },
    });
    assert.equal(preflight.status, 'available', JSON.stringify(preflight.issues));
    assert.equal(preflight.fillSimulation.status, 'passed');
    const p = kit.buildUnderlyingRoute(c, r, opts);
    const before = await token(p.originOut).balanceOf(USER);
    const result = await recipeHarness.execute.staticCall(...args(p));
    await (await recipeHarness.execute(...args(p))).wait();
    assert(result[1] > 0n);
    assert.equal((await token(p.originOut).balanceOf(USER)) - before, result[1]);
    return { amountIn: result[0], amountOut: result[1], syntheticForkFunding: true };
  });
}
