import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Interface } from 'ethers';
import * as kit from '../index.mjs';
import { createRingAquaIntegration } from '../portable.mjs';
import { sdk, C, erc20, json } from '../strategy.mjs';
import { config as legacy, NOW, MAKER, OPERATOR, USER } from './fixtures.mjs';
import { market, concentrated } from './market-fixtures.mjs';

const require = createRequire(import.meta.url);
const portable = createRingAquaIntegration({ swapVmSdk: sdk, aquaSdk: require('@1inch/aqua-sdk') });
const opts = { now: NOW };
const executor = '0x0000000000000000000000000000000020260911';
const abi = new Interface([
  'function ship(address,bytes,address[],uint256[])',
  'function dock(address,bytes32,address[])',
]);
const req = (c) => ({
  tokenIn: c.legs[0].token.address,
  tokenOut: c.legs[1].token.address,
  amount: '1000',
  threshold: '1',
  exactIn: true,
  deadline: String(NOW + 600n),
  taker: OPERATOR,
  receiver: USER,
});

test('legacy fixture retains published program bytes and hash', () => {
  const frozen = JSON.parse(
    readFileSync(new URL('../evidence/integration-2026-09-11/unsigned-fixture.json', import.meta.url)),
  );
  const current = kit.buildStrategy(frozen.config, { now: BigInt(frozen.config.expiry) - 1n }).bundle;
  assert.equal(current.strategy, frozen.strategy);
  assert.equal(current.strategyHash, frozen.strategyHash);
});

for (const asset of kit.ASSETS) {
  test(`${asset.asset} metadata drives bounded conversion and generic market encoding`, () => {
    assert(Object.isFrozen(asset));
    const input = { chainId: 1, maker: MAKER, asset: asset.asset, amount: '123456789' };
    for (const name of ['buildMakerWrapPlan', 'buildMakerUnwrapPlan']) {
      const p = kit[name](input);
      assert.deepEqual(p, portable[name](input));
      assert.equal(p.underlying, asset.underlying);
      assert.equal(p.fewToken, asset.address);
    }
    const c = market(
      asset.asset,
      asset.asset === 'USDC' ? 'USDT' : 'USDC',
      String(10n ** BigInt(asset.decimals)),
      '1000000',
    );
    const p = kit.buildAquaShipPlan(c, opts);
    assert.deepEqual(p, portable.buildAquaShipPlan(c, opts));
    const decoded = abi.decodeFunctionData('ship', p.data);
    assert.deepEqual(
      Array.from(decoded[2], (x) => x.toLowerCase()),
      c.legs.map((l) => l.token.address),
    );
    assert.deepEqual(
      Array.from(decoded[3]),
      c.legs.map((l) => BigInt(l.amount)),
    );
    assert.equal(p.transaction.data, p.data);
    assert.equal(p.transaction.to, C.aqua);
    assert.equal(p.encodedOrder, decoded[1]);
    assert.deepEqual(
      p.transactions.slice(0, 4).map((t) => erc20.decodeFunctionData('approve', t.data)[1]),
      [0n, BigInt(c.legs[0].amount), 0n, BigInt(c.legs[1].amount)],
    );
  });
}

for (const c of [
  market(),
  concentrated(market()),
  market('USDC', 'DAI', '30000000', '30000000000000000000', {
    shape: 'curved_pegged',
    linearWidth: String(300n * 10n ** 27n),
  }),
]) {
  test(`generic ${c.shape} ${c.concentrate ? 'concentrated' : ''} uses exact official program apart from expiry`, () => {
    const built = kit.buildStrategy(c, opts);
    const official =
      c.shape === 'curved_pegged'
        ? sdk.AquaPeggedAmmStrategy.new({
            tokenA: {
              address: new sdk.Address(c.legs[0].token.address),
              decimals: c.legs[0].token.decimals,
              reserve: BigInt(c.legs[0].amount),
            },
            tokenB: {
              address: new sdk.Address(c.legs[1].token.address),
              decimals: c.legs[1].token.decimals,
              reserve: BigInt(c.legs[1].amount),
            },
            linearWidth: BigInt(c.linearWidth),
          })
        : c.concentrate
          ? sdk.AquaXYCAmmStrategy.newConcentrate({
              rawPriceMin: BigInt(c.concentrate.rawPriceMin),
              rawPriceMax: BigInt(c.concentrate.rawPriceMax),
            })
          : sdk.AquaXYCAmmStrategy.new();
    official
      .withTxOriginAccessToken(new sdk.Address(C.resolverCredential))
      .withFeeTokenIn(0.1)
      .withSalt(BigInt(c.salt));
    const withoutExpiry = new sdk.AquaProgramBuilder();
    built.builder
      .getInstructions()
      .filter((_, i) => i !== 1)
      .forEach((i) => withoutExpiry.add(i));
    assert.equal(withoutExpiry.build().toString(), official.build().toString());
    const big = {
      ...c,
      legs: c.legs.map((l) => ({ ...l, amount: BigInt(l.amount) })),
      feeRateE9: BigInt(c.feeRateE9),
      expiry: BigInt(c.expiry),
      salt: BigInt(c.salt),
    };
    assert.equal(kit.buildStrategy(big, opts).bundle.strategy, built.bundle.strategy);
    assert.doesNotThrow(() => JSON.stringify(kit.buildAquaShipPlan(big, opts)));
  });
}

test('generic protocol fee is explicit, preserved and changes the program', () => {
  const c = market(),
    withFee = { ...c, protocolFee: { feeRateE9: '2500', receiver: legacy.protocolFeeReceiver } };
  const built = kit.buildStrategy(withFee, opts);
  assert.equal(built.parameters.protocolFee, 2500n);
  assert.notEqual(built.bundle.strategyHash, kit.buildStrategy(c, opts).bundle.strategyHash);
  assert.equal(built.parameters.receiver, legacy.protocolFeeReceiver);
  const official = sdk.AquaXYCAmmStrategy.new()
    .withTxOriginAccessToken(new sdk.Address(C.resolverCredential))
    .withProtocolFee(0.025, new sdk.Address(legacy.protocolFeeReceiver))
    .withFeeTokenIn(0.1)
    .withSalt(BigInt(c.salt))
    .build();
  const withoutExpiry = new sdk.AquaProgramBuilder();
  built.builder
    .getInstructions()
    .filter((_, i) => i !== 1)
    .forEach((i) => withoutExpiry.add(i));
  assert.equal(withoutExpiry.build().toString(), official.toString());
});

test('address-based quote, swap and atomic recipe bind the same pair in both directions/modes', () => {
  const c = market('WBTC', 'USDT', '100000', '100000000');
  for (const reverse of [false, true])
    for (const exactIn of [true, false]) {
      const r = {
        ...req(c),
        exactIn,
        ...(reverse ? { tokenIn: c.legs[1].token.address, tokenOut: c.legs[0].token.address } : {}),
      };
      for (const name of ['buildAquaQuoteCall', 'buildAquaSwapCall']) {
        const call = kit[name](c, r, opts);
        assert.deepEqual(call, portable[name](c, r, opts));
        assert.deepEqual(Object.keys(call).sort(), ['chainId', 'from', 'to', 'data', 'value'].sort());
        assert.equal(call.to, C.swapVmRouter);
      }
      const { taker, ...route } = r;
      const p = kit.buildUnderlyingRoute(c, { ...route, chainId: 1, operator: OPERATOR, executor }, opts);
      assert.equal(p.originIn, kit.getAsset(r.tokenIn).underlying);
      assert.equal(p.fewOut, r.tokenOut);
      assert.equal(p.receiver, USER);
      assert.equal(p.refundReceiver, OPERATOR);
      assert.equal(p.requirements.atomic, true);
      assert.deepEqual(
        p,
        portable.buildUnderlyingRoute(c, { ...route, chainId: 1, operator: OPERATOR, executor }, opts),
      );
      assert.equal(p.steps.find((s) => s.kind === 'runtimeUnwrap').amountFrom, 'swap.amountOut');
    }
});

test('close from stored identity needs no initial parameters or unexpired configuration', () => {
  const c = market(),
    opened = kit.buildAquaShipPlan(c, opts);
  const identity = {
    chainId: 1,
    maker: MAKER,
    strategyHash: opened.strategyHash,
    tokens: c.legs.map((l) => l.token.address),
  };
  const closed = kit.buildAquaDockPlan(identity);
  assert.deepEqual(closed, portable.buildAquaDockPlan(identity));
  assert.equal(closed.data, kit.buildAquaDockPlan(c).data);
  assert.equal(closed.transactions.length, 3);
  assert.doesNotThrow(() =>
    kit.buildAquaDockPlan({
      ...identity,
      tokens: ['0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002'],
    }),
  );
  for (const patch of [
    { chainId: 56 },
    { strategyHash: '0x' },
    { tokens: identity.tokens.toReversed() },
    { to: USER },
  ])
    assert.throws(() => kit.buildAquaDockPlan({ ...identity, ...patch }));
});

test('generic configuration fails closed on invalid identities, precision, ranges and hidden overrides', () => {
  const c = market();
  const copy = () => JSON.parse(json(c));
  const changes = [
    (x) => {
      x.chainId = 56;
    },
    (x) => {
      x.legs.reverse();
    },
    (x) => {
      x.legs[0] = x.legs[1];
    },
    (x) => {
      x.legs[0].token.decimals = 8;
    },
    (x) => {
      x.legs[0].token.address = C.usdc;
    },
    (x) => {
      x.legs[0].token.symbol = 'WETH';
    },
    (x) => {
      x.legs[0].amount = 100;
    },
    (x) => {
      x.legs[0].amount = String(2n ** 96n);
    },
    (x) => {
      x.legs[0].amount = '0';
    },
    (x) => {
      x.legs[0].amount = '-1';
    },
    (x) => {
      x.feeRateE9 = '1000000000';
    },
    (x) => {
      x.feeRateE9 = 10000;
    },
    (x) => {
      x.expiry = String(NOW);
    },
    (x) => {
      x.salt = String(2n ** 64n);
    },
    (x) => {
      x.shape = 'straight_concentrated';
    },
    (x) => {
      x.linearWidth = '100';
    },
    (x) => {
      x.shape = 'curved_pegged';
    },
    (x) => {
      x.concentrate = { rawPriceMin: '2', rawPriceMax: '1' };
    },
    (x) => {
      x.router = USER;
    },
    (x) => {
      x.maker = kit.getAsset('WETH').address;
    },
  ];
  for (const change of changes) {
    const x = copy();
    change(x);
    assert.throws(() => kit.buildAquaShipPlan(x, opts));
  }
  const r = req(c);
  for (const patch of [{ tokenOut: r.tokenIn }, { tokenIn: C.usdc }, { direction: 'USDC_USDT' }])
    assert.throws(() => kit.buildAquaQuoteCall(c, { ...r, ...patch }, opts));
  const one = concentrated(c);
  one.legs[0].amount = '0';
  assert.doesNotThrow(() => kit.buildAquaShipPlan(one, opts));
  one.legs[1].amount = '0';
  assert.throws(() => kit.buildAquaShipPlan(one, opts));
  assert.throws(() => kit.getAsset('ETH'), /UNSUPPORTED_ASSET/);
});
