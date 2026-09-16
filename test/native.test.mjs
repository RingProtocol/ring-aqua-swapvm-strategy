import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Interface } from 'ethers';
import * as kit from '../index.mjs';
import { createRingAquaIntegration } from '../portable.mjs';
import { C, sdk, erc20 } from '../strategy.mjs';
import { MAKER, USER } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const portable = createRingAquaIntegration({ swapVmSdk: sdk, aquaSdk: require('@1inch/aqua-sdk') });
const weth = kit.getAsset('WETH');
const wethAbi = new Interface(['function deposit() payable', 'function withdraw(uint256)']);
const input = { chainId: 1, maker: MAKER, amount: '1000000000000001' };

test('native ETH conversion uses WETH deposit with value and withdraw without value, no ERC20 approvals', () => {
  for (const [name, method, value] of [
    ['buildNativeWrapPlan', 'deposit', input.amount],
    ['buildNativeUnwrapPlan', 'withdraw', '0'],
  ]) {
    const p = kit[name](input);
    assert.deepEqual(p, portable[name](input));
    assert.equal(p.transactions.length, 1);
    const tx = p.transactions[0];
    assert.equal(tx.to, weth.underlying);
    assert.notEqual(tx.to, weth.address);
    assert.equal(tx.from, MAKER);
    assert.equal(tx.value, value);
    assert.equal(tx.chainId, 1);
    assert.equal(p.recipient, MAKER);
    assert.equal(p.safety.executionAllowed, false);
    const decoded = wethAbi.decodeFunctionData(method, tx.data);
    assert.deepEqual([...decoded], method === 'deposit' ? [] : [BigInt(input.amount)]);
    assert.doesNotThrow(() => JSON.stringify(p));
  }
});

for (const [asset, amount] of [
  ['WETH', input.amount],
  ['USDT', '1000001'],
  ['UNI', input.amount],
])
  test(`${asset} FewToken conversion is a separate ERC20 layer with bounded approvals and no native value`, () => {
    const t = kit.getAsset(asset),
      request = { ...input, asset, amount };
    const wrap = kit.buildMakerWrapPlan(request),
      unwrap = kit.buildMakerUnwrapPlan(request);
    assert.deepEqual(wrap, portable.buildMakerWrapPlan(request));
    assert.deepEqual(unwrap, portable.buildMakerUnwrapPlan(request));
    for (const p of [wrap, unwrap]) assert(p.transactions.every((tx) => tx.value === '0'));
    for (const [i, approved] of [
      [0, 0n],
      [1, BigInt(amount)],
      [3, 0n],
    ]) {
      const tx = wrap.transactions[i];
      assert.equal(tx.to, t.underlying);
      const [spender, limit] = erc20.decodeFunctionData('approve', tx.data);
      assert.equal(spender.toLowerCase(), t.address);
      assert.equal(limit, approved);
    }
    for (const [tx, method] of [
      [wrap.transactions[2], 'wrapTo'],
      [unwrap.transactions[0], 'unwrapTo'],
    ]) {
      assert.equal(tx.to, t.address);
      const [n, recipient] = kit.fewAbi.decodeFunctionData(method, tx.data);
      assert.equal(n, BigInt(amount));
      assert.equal(recipient.toLowerCase(), MAKER);
    }
  });

test('native conversion rejects wrong chains, target or recipient overrides and invalid wei amounts', () => {
  for (const patch of [
    { chainId: 56 },
    { maker: C.aqua },
    { maker: weth.underlying },
    { maker: weth.address },
    { receiver: USER },
    { to: USER },
    { asset: 'ETH' },
    { value: '1' },
    { amount: '0' },
    { amount: '-1' },
    { amount: '0.1' },
    { amount: 1 },
    { amount: 1n },
    { amount: '01' },
    { amount: String(2n ** 96n) },
  ])
    for (const build of [kit.buildNativeWrapPlan, kit.buildNativeUnwrapPlan])
      assert.throws(() => build({ ...input, ...patch }));
  // ETH is not an ERC20 or a tenth FewToken. Do not silently skip either layer.
  assert.throws(() => kit.getAsset('ETH'), /UNSUPPORTED_ASSET/);
  assert.throws(() => kit.buildMakerWrapPlan({ ...input, asset: 'ETH' }), /UNSUPPORTED_ASSET/);
});
