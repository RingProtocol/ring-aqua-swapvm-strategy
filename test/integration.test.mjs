import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Interface } from 'ethers';
import * as kit from '../index.mjs';
import { createRingAquaIntegration } from '../portable.mjs';
import { C, sdk, buildStrategy, erc20 } from '../strategy.mjs';
import { config, request, MAKER, OPERATOR, USER, NOW } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const portable = createRingAquaIntegration({ swapVmSdk: sdk, aquaSdk: require('@1inch/aqua-sdk') });
const opts = { now: NOW };
const executor = '0x0000000000000000000000000000000020260911';
const routeRequest = {
  chainId: 1,
  direction: request.direction,
  exactIn: true,
  amount: '1000000',
  threshold: '990000',
  deadline: request.deadline,
  operator: OPERATOR,
  executor,
  receiver: USER,
};

test('Node and portable interfaces produce identical official ship plans', () => {
  const a = kit.buildAquaShipPlan(config, opts);
  assert.deepEqual(a, portable.buildAquaShipPlan(config, opts));
  assert.deepEqual(a.transactions, buildStrategy(config, opts).bundle.open);
  const abi = new Interface(['function ship(address,bytes,address[],uint256[])']);
  const decoded = abi.decodeFunctionData('ship', a.transactions.at(-1).data);
  assert.equal(decoded[0].toLowerCase(), C.swapVmRouter);
  assert.equal(decoded[1], a.encodedOrder);
  assert.deepEqual(
    Array.from(decoded[2], (x) => x.toLowerCase()),
    [C.fwUsdc, C.fwUsdt],
  );
  assert.equal(a.safety.executionAllowed, false);
});

test('dock reconstructs the same strategy hash after expiry and includes both revocations', () => {
  const c = { ...config, expiry: '100' };
  const opened = kit.buildAquaShipPlan(c, { now: 99n });
  assert.throws(() => kit.buildAquaShipPlan(c, opts), /STRATEGY_EXPIRED/);
  const closed = kit.buildAquaDockPlan(c);
  assert.equal(closed.strategyHash, opened.strategyHash);
  assert.equal(closed.transactions.length, 3);
  const abi = new Interface(['function dock(address,bytes32,address[])']);
  assert.equal(abi.decodeFunctionData('dock', closed.transactions[0].data)[1], opened.strategyHash);
  for (const tx of closed.transactions.slice(1))
    assert.equal(erc20.decodeFunctionData('approve', tx.data)[1], 0n);
});

for (const asset of ['USDC', 'USDT']) {
  test(`${asset} conversions are exact, canonical, self-recipient and clear allowance`, () => {
    const input = { chainId: 1, maker: MAKER, asset, amount: '1000001' };
    const wrap = kit.buildMakerWrapPlan(input),
      unwrap = kit.buildMakerUnwrapPlan(input);
    assert.deepEqual(wrap, portable.buildMakerWrapPlan(input));
    assert.equal(wrap.transactions.length, 4);
    assert.equal(unwrap.transactions.length, 1);
    assert.equal(wrap.fewToken, asset === 'USDC' ? C.fwUsdc : C.fwUsdt);
    assert.equal(wrap.transactions[0].to, asset === 'USDC' ? C.usdc : C.usdt);
    assert.deepEqual(
      [0, 1, 3].map((i) => erc20.decodeFunctionData('approve', wrap.transactions[i].data)[1]),
      [0n, 1000001n, 0n],
    );
    for (const [plan, method, pos] of [
      [wrap, 'wrapTo', 2],
      [unwrap, 'unwrapTo', 0],
    ]) {
      const args = kit.fewAbi.decodeFunctionData(method, plan.transactions[pos].data);
      assert.equal(args[0], 1000001n);
      assert.equal(args[1].toLowerCase(), MAKER);
      assert(plan.transactions.every((t) => t.from === MAKER && t.chainId === 1 && t.value === '0'));
    }
  });
}
test('conversion rejects extra recipients, external assets, wrong chains and invalid amounts', () => {
  const input = { chainId: 1, maker: MAKER, asset: 'USDC', amount: '1000000' };
  for (const patch of [
    { receiver: USER },
    { asset: 'ETH' },
    { chainId: 56 },
    { maker: C.aqua },
    { amount: '0' },
    { amount: '1.5' },
    { amount: 1 },
    { amount: String(2n ** 96n) },
  ])
    for (const build of [kit.buildMakerWrapPlan, kit.buildMakerUnwrapPlan])
      assert.throws(() => build({ ...input, ...patch }));
});

for (const direction of ['USDC_USDT', 'USDT_USDC'])
  for (const exactIn of [true, false]) {
    test(`route ${direction} ${exactIn ? 'exact-in' : 'exact-out'} binds actor, limits and dynamic amounts`, () => {
      const r = { ...routeRequest, direction, exactIn, threshold: exactIn ? '990000' : '1200000' };
      const plan = kit.buildUnderlyingRoute(config, r, opts);
      assert.deepEqual(plan, portable.buildUnderlyingRoute(config, r, opts));
      assert.equal(plan.originIn, direction === 'USDC_USDT' ? C.usdc : C.usdt);
      assert.equal(plan.originOut, direction === 'USDC_USDT' ? C.usdt : C.usdc);
      assert.equal(plan.maxAmountIn, exactIn ? r.amount : r.threshold);
      assert.equal(plan.minAmountOut, exactIn ? r.threshold : r.amount);
      const swap = new Interface(sdk.ABI.SWAP_VM_ABI).decodeFunctionData('swap', plan.swapCall.data);
      const traits = sdk.TakerTraits.decode(new sdk.HexString(swap[4]));
      assert.equal(traits.exactIn, exactIn);
      assert.equal(traits.threshold, BigInt(r.threshold));
      assert.equal(traits.deadline, BigInt(r.deadline));
      assert.equal(plan.swapCall.caller, executor);
      assert.equal(plan.quoteCall.from, OPERATOR);
      assert(plan.swapCall.data.includes(executor.slice(2)));
      assert.equal(plan.steps.find((s) => s.kind === 'runtimeUnwrap').amountFrom, 'swap.amountOut');
      assert.equal(plan.steps.find((s) => s.kind === 'runtimeRefund').recipient, OPERATOR);
      assert.equal(plan.atomicRequired, true);
      assert.equal(plan.adapterStatus, 'requires-resolver-runtime-adapter');
      assert.equal(plan.safety.officialFrontendTraffic, 'unverified');
      assert.notEqual(
        plan.recipeHash,
        kit.buildUnderlyingRoute(config, { ...r, receiver: MAKER }, opts).recipeHash,
      );
    });
  }
test('invalid route identities and unsafe limits cannot produce an execution recipe', () => {
  for (const patch of [
    { executor: OPERATOR },
    { executor: USER },
    { executor: MAKER },
    { receiver: C.fwUsdc },
    { operator: C.swapVmRouter },
    { chainId: 56 },
    { direction: 'USDC_WETH' },
    { exactIn: 'true' },
    { amount: '0' },
    { threshold: '0' },
    { deadline: String(NOW) },
    { deadline: String(BigInt(config.expiry) + 1n) },
    { router: USER },
  ])
    assert.throws(() => kit.buildUnderlyingRoute(config, { ...routeRequest, ...patch }, opts));
});
