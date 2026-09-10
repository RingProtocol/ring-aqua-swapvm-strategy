import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, keccak256 } from 'ethers';
import { C, sdk, buildStrategy, buildQuote, decimal, json } from '../strategy.mjs';
import { catalog, poolId, wrapperQuote, v4Quoter } from '../sources.mjs';
import { config, request, NOW } from './fixtures.mjs';

test('deterministic SDK order encoding and hash survive JSON round trip', () => {
  const { bundle, order } = buildStrategy(config, { now: NOW });
  assert.equal(bundle.strategyHash, keccak256(bundle.strategy));
  assert.equal(order.hash().toString(), bundle.strategyHash);
  assert.equal(sdk.Order.decode(new sdk.HexString(bundle.strategy)).encode().toString(), bundle.strategy);
  assert.equal(buildStrategy(JSON.parse(json(config)), { now: NOW }).bundle.strategy, bundle.strategy);
  for (const patch of [
    { maker: request.taker },
    { salt: '2026090902' },
    { expiry: String(NOW + 90000n) },
    { feeBps: '0.11' },
    { fwUSDT: '32' },
  ])
    assert.notEqual(
      buildStrategy({ ...config, ...patch }, { now: NOW }).bundle.strategyHash,
      bundle.strategyHash,
    );
});
test('only deployed official opcode numbers, credentials, expiry and integer fees', () => {
  const { bundle } = buildStrategy(config, { now: NOW });
  const order = sdk.Order.decode(new sdk.HexString(bundle.strategy));
  const bytes = Buffer.from(order.program.toString().slice(2), 'hex');
  const opcodes = [];
  for (let i = 0; i < bytes.length;) {
    opcodes.push(bytes[i]);
    i += 2 + bytes[i + 1];
  }
  assert.deepEqual(opcodes, [33, 13, 28, 21, 31, 20]);
  assert.equal(order.traits.useAquaInsteadOfSignature, true);
  assert.equal(order.traits.allowZeroAmountIn, false);
  assert.equal(order.traits.preTransferInHook, undefined);
});
test('pegged program matches high-level official strategy apart from mandatory expiry', () => {
  const official = sdk.AquaPeggedAmmStrategy.new({
    tokenA: { address: new sdk.Address(C.fwUsdc), decimals: 6, reserve: 30000000n },
    tokenB: { address: new sdk.Address(C.fwUsdt), decimals: 6, reserve: 33000000n },
    linearWidth: 300n * 10n ** 27n,
  })
    .withTxOriginAccessToken(new sdk.Address(C.resolverCredential))
    .withProtocolFee(0.025, new sdk.Address(config.protocolFeeReceiver))
    .withFeeTokenIn(0.1)
    .withSalt(BigInt(config.salt))
    .build();
  const built = buildStrategy(config, { now: NOW });
  const instructions = built.builder.getInstructions();
  const withoutExpiry = new sdk.AquaProgramBuilder();
  instructions.filter((_, i) => i !== 1).forEach((i) => withoutExpiry.add(i));
  assert.equal(withoutExpiry.build().toString(), official.toString());
});
test('maker lifecycle has exact caps, zero resets, canonical tokens and full shutdown', () => {
  const { bundle } = buildStrategy(config, { now: NOW });
  const erc = new Interface(['function approve(address,uint256)']);
  assert.equal(bundle.open.length, 5);
  assert.equal(bundle.close.length, 3);
  assert.deepEqual(
    bundle.open.slice(0, 4).map((t) => erc.decodeFunctionData('approve', t.data)[1]),
    [0n, 30000000n, 0n, 33000000n],
  );
  for (const t of [...bundle.open, ...bundle.close]) {
    assert.equal(t.from, config.maker);
    assert.equal(t.chainId, 1);
    assert.equal(t.value, '0');
  }
  assert.equal(bundle.safety.executionAllowed, false);
});
for (const [name, patch] of Object.entries({
  wrongChain: { chainId: 8453 },
  zeroMaker: { maker: '0x' + '0'.repeat(40) },
  zeroReserve: { fwUSDC: '0' },
  excessPrecision: { fwUSDC: '1.0000001' },
  negativeReserve: { fwUSDT: '-1' },
  floatReserve: { fwUSDC: 30 },
  exponent: { fwUSDC: '1e6' },
  hugeReserve: { fwUSDC: '9'.repeat(40) },
  zeroWidth: { amplification: '0' },
  wide: { amplification: '5000.1' },
  badFee: { feeBps: '10000' },
  feePrecision: { feeBps: '0.000001' },
  zeroExpiry: { expiry: '0' },
  expired: { expiry: String(NOW) },
  zeroSalt: { salt: '0' },
  unknownField: { router: '0x' + '1'.repeat(40) },
})) {
  test(`rejects ${name} before producing calldata`, () =>
    assert.throws(() => buildStrategy({ ...config, ...patch }, { now: NOW })));
}
test('quote directions and modes use nonzero slippage and deadline protections', () => {
  for (const direction of ['USDC_USDT', 'USDT_USDC'])
    for (const exactIn of [true, false]) {
      const q = buildQuote(config, { ...request, direction, exactIn }, { now: NOW });
      const decoded = sdk.TakerTraits.decode(q.traits.encode());
      assert.equal(decoded.exactIn, exactIn);
      assert.equal(decoded.threshold, 1n);
      assert.equal(decoded.deadline, BigInt(request.deadline));
      assert.equal(q.tokenIn, direction === 'USDC_USDT' ? C.fwUsdc : C.fwUsdt);
    }
  for (const patch of [
    { threshold: '0' },
    { amount: '0' },
    { deadline: '0' },
    { deadline: config.expiry + '0' },
    { direction: 'USDC_USDC' },
    { exactIn: 'true' },
  ])
    assert.throws(() => buildQuote(config, { ...request, ...patch }, { now: NOW }));
});
test('decimal conversions are exact, including smallest fee unit', () => {
  assert.equal(decimal('0.00001', 5), 1n);
  assert.equal(decimal('1.000001', 6), 1000001n);
  assert.equal(decimal('300', 27), 300n * 10n ** 27n);
});
test('nine source PoolKeys, native ETH distinction and quote direction encoding', () => {
  assert.equal(catalog.sources.length, 9);
  for (const row of catalog.sources) {
    assert.equal(poolId(row.poolKey), row.poolId);
    for (const wrap of [true, false])
      for (const exactIn of [true, false]) {
        const q = wrapperQuote(row, { wrap, exactIn, amount: 100n });
        const [p] = v4Quoter.decodeFunctionData(q.method, q.data);
        assert.equal(p.exactAmount, 100n);
        assert.equal(p.hookData, '0x');
        assert.equal(
          p.zeroForOne,
          wrap ? row.poolKey.currency0 !== row.fewToken : row.poolKey.currency0 === row.fewToken,
        );
      }
  }
  const eth = catalog.sources.find((r) => r.asset === 'ETH');
  assert.notEqual(eth.underlying, eth.poolKey.currency0);
});
