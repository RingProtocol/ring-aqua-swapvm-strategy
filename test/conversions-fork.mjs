import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import * as kit from '../index.mjs';
import { C, erc20 } from '../strategy.mjs';
import { MAKER, USER } from './fixtures.mjs';
import { market } from './market-fixtures.mjs';

// Real deployed contracts on the dedicated local fork. No mainnet writes.
export async function runConversionCases({ provider, test, sent, token, maker, now }) {
  const weth = kit.getAsset('WETH');
  const input = { chainId: 1, maker: MAKER, amount: '1000000000000001' };
  const run = async (plan) => {
    let gas = 0n;
    for (const tx of plan.transactions) {
      const receipt = await sent(maker, tx);
      gas += receipt.gasUsed * receipt.gasPrice;
    }
    return gas;
  };
  await test('native ETH deposit/withdraw reconciles ETH, WETH and gas without touching fwWETH', async () => {
    const beforeEth = await provider.getBalance(MAKER),
      beforeWeth = await token(weth.underlying).balanceOf(MAKER),
      beforeFew = await token(weth.address).balanceOf(MAKER),
      amount = BigInt(input.amount);
    const depositGas = await run(kit.buildNativeWrapPlan(input));
    assert.equal(await provider.getBalance(MAKER), beforeEth - amount - depositGas);
    assert.equal(await token(weth.underlying).balanceOf(MAKER), beforeWeth + amount);
    assert.equal(await token(weth.address).balanceOf(MAKER), beforeFew);
    const withdrawGas = await run(kit.buildNativeUnwrapPlan(input));
    assert.equal(await provider.getBalance(MAKER), beforeEth - depositGas - withdrawGas);
    assert.equal(await token(weth.underlying).balanceOf(MAKER), beforeWeth);
    assert.equal(await token(weth.address).balanceOf(MAKER), beforeFew);
    return { category: 'ETH', amount, depositGas, withdrawGas, target: weth.underlying };
  });
  await test('ETH to WETH to fwWETH and reverse preserves principal and clears wrapper allowance', async () => {
    const beforeEth = await provider.getBalance(MAKER),
      beforeWeth = await token(weth.underlying).balanceOf(MAKER),
      beforeFew = await token(weth.address).balanceOf(MAKER),
      amount = BigInt(input.amount);
    let gas = await run(kit.buildNativeWrapPlan(input));
    gas += await run(kit.buildMakerWrapPlan({ ...input, asset: 'WETH' }));
    assert.equal(await token(weth.underlying).balanceOf(MAKER), beforeWeth);
    assert.equal(await token(weth.address).balanceOf(MAKER), beforeFew + amount);
    gas += await run(kit.buildMakerUnwrapPlan({ ...input, asset: 'WETH' }));
    gas += await run(kit.buildNativeUnwrapPlan(input));
    assert.equal(await provider.getBalance(MAKER), beforeEth - gas);
    assert.equal(await token(weth.underlying).balanceOf(MAKER), beforeWeth);
    assert.equal(await token(weth.address).balanceOf(MAKER), beforeFew);
    assert.equal(await token(weth.underlying).allowance(MAKER, weth.address), 0n);
    return { category: 'ETH/WETH', amount, gas, sequentialMakerTransactions: true };
  });
  await test('native conversion fails on insufficient ETH or WETH and does not move balances', async () => {
    const before = [await provider.getBalance(MAKER), await token(weth.underlying).balanceOf(MAKER)];
    await assert.rejects(
      provider.call(kit.buildNativeWrapPlan({ ...input, amount: String(before[0] + 1n) }).transactions[0]),
    );
    await assert.rejects(
      provider.call(kit.buildNativeUnwrapPlan({ ...input, amount: String(before[1] + 1n) }).transactions[0]),
    );
    assert.deepEqual(
      [await provider.getBalance(MAKER), await token(weth.underlying).balanceOf(MAKER)],
      before,
    );
  });
  for (const [asset, category, amount] of [
    ['WETH', 'WETH', 1000000000000001n],
    ['USDT', 'USDT-no-return-reset-approval', 1000001n],
    ['UNI', 'ordinary-ERC20', 1000000000000001n],
  ])
    await test(`${category} real conversion reconciles deltas with an existing nonzero allowance`, async () => {
      const t = kit.getAsset(asset),
        request = { ...input, asset, amount: String(amount) };
      await (await token(t.underlying, maker).approve(t.address, 0n)).wait();
      await (await token(t.underlying, maker).approve(t.address, 7n)).wait();
      const approve = {
        from: MAKER,
        to: t.underlying,
        data: erc20.encodeFunctionData('approve', [t.address, amount]),
      };
      if (asset === 'USDT') {
        await assert.rejects(provider.call(approve));
        assert.equal(
          await provider.call({ ...approve, data: erc20.encodeFunctionData('approve', [t.address, 0n]) }),
          '0x',
        );
      } else assert.equal(erc20.decodeFunctionResult('approve', await provider.call(approve))[0], true);
      const before = [await token(t.underlying).balanceOf(MAKER), await token(t.address).balanceOf(MAKER)];
      await run(kit.buildMakerWrapPlan(request));
      assert.equal(await token(t.underlying).balanceOf(MAKER), before[0] - amount);
      assert.equal(await token(t.address).balanceOf(MAKER), before[1] + amount);
      assert.equal(await token(t.underlying).allowance(MAKER, t.address), 0n);
      await run(kit.buildMakerUnwrapPlan(request));
      assert.deepEqual(
        [await token(t.underlying).balanceOf(MAKER), await token(t.address).balanceOf(MAKER)],
        before,
      );
      return { category, asset, amount, decimals: t.decimals, initialAllowance: '7', finalAllowance: '0' };
    });

  const registryAbi = new ethers.Interface([
    'function ship(address,bytes,address[],uint256[]) returns(bytes32)',
    'function rawBalances(address,address,bytes32,address) view returns(uint248,uint8)',
    'function pull(address,bytes32,address,uint256,address)',
  ]);
  const registry = new ethers.Contract(C.aqua, registryAbi, provider);
  await test('Aqua registry accepts ERC20 tokens outside Ring SDK catalog without a global token allowlist', async () => {
    const config = market('USDC', 'WETH', '1000000', input.amount, {
      expiry: String(now + 86400n),
      salt: '2026091601',
    });
    const plan = kit.buildAquaShipPlan(config, { now });
    const tokens = [weth.underlying, C.usdt].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    for (const a of tokens) assert.throws(() => kit.getAsset(a), /UNSUPPORTED_ASSET/);
    const before = await Promise.all(tokens.map((a) => token(a).balanceOf(MAKER)));
    await sent(maker, {
      to: C.aqua,
      data: registryAbi.encodeFunctionData('ship', [C.swapVmRouter, plan.encodedOrder, tokens, [10n, 20n]]),
    });
    for (const [i, a] of tokens.entries()) {
      const [balance, count] = await registry.rawBalances(MAKER, C.swapVmRouter, plan.strategyHash, a);
      assert.equal(balance, i === 0 ? 10n : 20n);
      assert.equal(count, 2n);
    }
    assert.deepEqual(await Promise.all(tokens.map((a) => token(a).balanceOf(MAKER))), before);
    return { registryOnly: true, officialDiscovery: 'unverified', sdkCatalogIsOnchainPolicy: false };
  });
  await test('ERC20 allowance alone cannot pull a token absent from the maker strategy allocation', async () => {
    const config = market('USDC', 'WETH', '1000000', input.amount, {
      expiry: String(now + 86400n),
      salt: '2026091602',
    });
    const plan = kit.buildAquaShipPlan(config, { now });
    for (const tx of plan.transactions) await sent(maker, tx);
    await (await token(weth.underlying, maker).approve(C.aqua, 123n)).wait();
    const before = await token(weth.underlying).balanceOf(MAKER);
    await assert.rejects(
      provider.call({
        from: C.swapVmRouter,
        to: C.aqua,
        data: registryAbi.encodeFunctionData('pull', [MAKER, plan.strategyHash, weth.underlying, 1n, USER]),
      }),
    );
    assert.equal(await token(weth.underlying).balanceOf(MAKER), before);
  });
}
