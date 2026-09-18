import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import reference from './official-reference.json' with { type: 'json' };
import { sdk, C, buildStrategy, buildQuote, routerAbi } from '../strategy.mjs';
import { market, concentrated } from './market-fixtures.mjs';
import { NOW, config as legacy, request } from './fixtures.mjs';
import { buildAquaDockPlan } from '../index.mjs';
import beforeFix from './fixtures/legacy-position-identity.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const aqua = require('@1inch/aqua-sdk');
const opts = { now: NOW };
const protocolFee = { feeRateE9: '2500', receiver: legacy.protocolFeeReceiver };
const cases = [
  market('USDC', 'WETH', '300000000', '100000000000000000', { protocolFee }),
  concentrated(market('USDC', 'WETH', '300000000', '100000000000000000', { protocolFee })),
  market('USDC', 'DAI', '30000000', '30000000000000000000', {
    protocolFee,
    shape: 'curved_pegged',
    linearWidth: String(300n * 10n ** 27n),
  }),
];

test('pinned SDK versions, official Ethereum addresses and redistributed license texts match', () => {
  assert.equal(require('@1inch/swap-vm-sdk/package.json').version, reference.swapVmSdk);
  assert.equal(require('@1inch/aqua-sdk/package.json').version, reference.aquaSdk);
  assert.equal(String(aqua.AQUA_CONTRACT_ADDRESSES[1]).toLowerCase(), C.aqua);
  assert.equal(String(sdk.AQUA_SWAP_VM_CONTRACT_ADDRESSES[1]).toLowerCase(), C.swapVmRouter);
  for (const [name, license] of [
    ['swap-vm-sdk', 'LicenseRef-Degensoft-SwapVM-1.1.txt'],
    ['aqua-sdk', 'LicenseRef-Degensoft-Aqua-Source-1.1.txt'],
  ]) {
    const installed = new URL(`../node_modules/@1inch/${name}/LICENSE`, import.meta.url);
    const retained = new URL(`../LICENSES/${license}`, import.meta.url);
    assert.equal(readFileSync(installed, 'utf8'), readFileSync(retained, 'utf8'));
  }
});

for (const config of cases) {
  test(`official protocol-fee instruction order matches ${config.shape}${config.concentrate ? '/concentrated' : ''}`, () => {
    const official = config.concentrate
      ? sdk.AquaXYCAmmStrategy.newConcentrate({
          rawPriceMin: BigInt(config.concentrate.rawPriceMin),
          rawPriceMax: BigInt(config.concentrate.rawPriceMax),
        })
      : config.shape === 'curved_pegged'
        ? sdk.AquaPeggedAmmStrategy.new({
            tokenA: {
              address: new sdk.Address(config.legs[0].token.address),
              decimals: config.legs[0].token.decimals,
              reserve: BigInt(config.legs[0].amount),
            },
            tokenB: {
              address: new sdk.Address(config.legs[1].token.address),
              decimals: config.legs[1].token.decimals,
              reserve: BigInt(config.legs[1].amount),
            },
            linearWidth: BigInt(config.linearWidth),
          })
        : sdk.AquaXYCAmmStrategy.new();
    official
      .withTxOriginAccessToken(new sdk.Address(C.resolverCredential))
      .withProtocolFee(0.025, new sdk.Address(protocolFee.receiver))
      .withFeeTokenIn(0.1)
      .withSalt(BigInt(config.salt));
    const built = buildStrategy(config, opts);
    const withoutExpiry = new sdk.AquaProgramBuilder();
    built.builder
      .getInstructions()
      .filter((_, i) => i !== 1)
      .forEach((i) => withoutExpiry.add(i));
    assert.equal(withoutExpiry.build().toString(), official.build().toString());
  });
}

test('encoded opcodes match the deployed Solidity tag rather than current main or SDK ordinal comments', () => {
  const program = buildStrategy(cases[1], opts).builder.build().toString().slice(2);
  const names = [];
  for (let pc = 0; pc < program.length;) {
    const opcode = Number.parseInt(program.slice(pc, pc + 2), 16);
    const length = Number.parseInt(program.slice(pc + 2, pc + 4), 16);
    assert(opcode < reference.runtimeOpcodeTable.length);
    names.push(reference.runtimeOpcodeTable[opcode].solidityFunction);
    pc += 4 + length * 2;
    assert(pc <= program.length);
  }
  assert.deepEqual(names, [
    'Controls._onlyTxOriginTokenBalanceNonZero',
    'Controls._deadline',
    'Fee._aquaProtocolFeeAmountInXD',
    'XYCConcentrate._xycConcentrateGrowLiquidity2D',
    'Fee._flatFeeAmountInXD',
    'XYCSwap._xycSwapXD',
    'Controls._salt',
  ]);
});

test('official taker decoding preserves limits and excludes native unwrap, signatures and hooks', () => {
  for (const exactIn of [true, false]) {
    const q = buildQuote(legacy, { ...request, exactIn }, opts);
    const decoded = routerAbi.decodeFunctionData('quote', q.transaction.data);
    assert.equal(decoded.length, 5);
    const packed = decoded[4];
    // Deployed TakerTraits uses a 20-byte offsets header followed by uint16 flags.
    assert.equal(Number.parseInt(packed.slice(42, 46), 16), exactIn ? 0x61 : 0x60);
    const traits = sdk.TakerTraits.decode(new sdk.HexString(packed));
    assert.equal(traits.threshold, BigInt(request.threshold));
    assert.equal(traits.deadline, BigInt(request.deadline));
    assert.equal(String(traits.customReceiver).toLowerCase(), request.receiver);
    assert.equal(traits.shouldUnwrap, false);
    assert.equal(traits.strictThreshold, false);
    assert.equal(traits.useTransferFromAndAquaPush, true);
    assert.equal(traits.firstTransferFromTaker, true);
    assert.equal(String(traits.signature), '0x');
    assert.equal(traits.preTransferInCallbackEnabled, false);
    assert.equal(traits.preTransferOutCallbackEnabled, false);
  }
});

test('a v0.2.0 concentrated fee position closes by stored identity after the encoding correction', () => {
  assert.notEqual(
    buildStrategy(cases[1], opts).bundle.strategyHash,
    beforeFix.historicalIdentity.strategyHash,
  );
  const close = buildAquaDockPlan(beforeFix.historicalIdentity);
  assert.equal(close.strategyHash, beforeFix.historicalIdentity.strategyHash);
  const data = aqua.AquaProtocolContract.encodeDockCallData({
    app: new aqua.Address(C.swapVmRouter),
    strategyHash: new aqua.HexString(beforeFix.historicalIdentity.strategyHash),
    tokens: beforeFix.historicalIdentity.tokens.map((a) => new aqua.Address(a)),
  });
  assert.equal(close.data, String(data));
});
