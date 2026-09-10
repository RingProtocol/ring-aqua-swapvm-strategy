import { getAddress, Interface, keccak256 } from 'ethers';
import { ASSETS, getAsset } from './assets.mjs';

// Dependency injection keeps Node-only SDK loading out of the portable core.
export function createStrategyApi(sdk, AquaProtocolContract, deploymentConfig) {
  const { Address, AquaProgramBuilder, MakerTraits, Order, TakerTraits, SwapVMContract, instructions } = sdk;
  function freeze(x) {
    for (const v of Object.values(x)) if (v && typeof v === 'object') freeze(v);
    return Object.freeze(x);
  }
  const deployment = freeze(deploymentConfig);
  const C = freeze(Object.fromEntries(Object.entries(deployment.contracts).map(([k, v]) => [k, v.address])));
  const TOKENS = freeze([
    { symbol: 'fwUSDC', address: C.fwUsdc, underlying: C.usdc, decimals: 6 },
    { symbol: 'fwUSDT', address: C.fwUsdt, underlying: C.usdt, decimals: 6 },
  ]);
  const erc20 = new Interface([
    'function approve(address,uint256) returns(bool)',
    'function allowance(address,address) view returns(uint256)',
    'function balanceOf(address) view returns(uint256)',
    'function decimals() view returns(uint8)',
    'function token() view returns(address)',
    'function getWrappedToken(address) view returns(address)',
  ]);
  const aquaAbi = new Interface([
    'function rawBalances(address,address,bytes32,address) view returns(uint248,uint8)',
    'function safeBalances(address,address,bytes32,address,address) view returns(uint256,uint256)',
  ]);
  const routerAbi = new Interface(sdk.ABI.SWAP_VM_ABI);
  const json = (x) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? String(v) : v), 2) + '\n';
  function check(ok, code) {
    if (!ok) throw Object.assign(new Error(code), { code });
  }
  function address(x) {
    try {
      const a = getAddress(x).toLowerCase();
      check(BigInt(a) !== 0n, 'ZERO_ADDRESS');
      return a;
    } catch {
      throw new Error('INVALID_ADDRESS');
    }
  }
  function uint(x, bits = 256, allowZero = false) {
    check(typeof x === 'string' && /^(0|[1-9][0-9]*)$/.test(x), 'INTEGER_STRING_REQUIRED');
    const v = BigInt(x);
    check(v < 2n ** BigInt(bits) && (allowZero || v > 0n), 'INTEGER_RANGE');
    return v;
  }
  function decimal(x, places) {
    check(typeof x === 'string' && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(x), 'DECIMAL_STRING_REQUIRED');
    const [a, b = ''] = x.split('.');
    check(b.length <= places, 'DECIMAL_PRECISION');
    return BigInt(a + b.padEnd(places, '0'));
  }
  function normalize(config, now = BigInt(Math.floor(Date.now() / 1000))) {
    if (config && Object.hasOwn(config, 'legs')) return normalizeMarket(config, now);
    const keys = [
      'chainId',
      'maker',
      'fwUSDC',
      'fwUSDT',
      'amplification',
      'feeBps',
      'protocolFeeBps',
      'protocolFeeReceiver',
      'expiry',
      'salt',
    ];
    check(
      config && Object.keys(config).length === keys.length && keys.every((k) => Object.hasOwn(config, k)),
      'CONFIG_FIELDS',
    );
    check(config.chainId === 1, 'UNSUPPORTED_CHAIN');
    const maker = address(config.maker),
      receiver = address(config.protocolFeeReceiver);
    check(!Object.values(C).includes(maker) && receiver !== maker, 'INVALID_ACTOR');
    const amounts = [decimal(config.fwUSDC, 6), decimal(config.fwUSDT, 6)];
    // Deliberately bounded support range; do not silently accept values whose curve arithmetic was not tested.
    check(
      amounts.every((x) => x > 0n && x < 2n ** 96n),
      'RESERVE_RANGE',
    );
    const width = decimal(config.amplification, 27);
    check(width > 0n && width <= 5000n * 10n ** 27n, 'AMPLIFICATION_RANGE');
    const fee = decimal(config.feeBps, 5),
      protocolFee = decimal(config.protocolFeeBps, 5);
    check(fee < 10n ** 9n && protocolFee < 10n ** 9n && fee + protocolFee < 10n ** 9n, 'FEE_RANGE');
    const expiry = uint(config.expiry, 40),
      salt = uint(config.salt);
    check(typeof now === 'bigint' && now >= 0n && expiry > now, 'STRATEGY_EXPIRED');
    return { maker, receiver, amounts, width, fee, protocolFee, expiry, salt };
  }

  function normalizeMarket(config, now) {
    const required = ['chainId', 'maker', 'legs', 'shape', 'feeRateE9', 'expiry', 'salt'];
    const optional = ['concentrate', 'linearWidth', 'protocolFee'];
    check(
      required.every((k) => Object.hasOwn(config, k)) &&
        Object.keys(config).every((k) => [...required, ...optional].includes(k)),
      'CONFIG_FIELDS',
    );
    check(config.chainId === 1, 'UNSUPPORTED_CHAIN');
    const maker = address(config.maker);
    check(
      ![...Object.values(C), ...ASSETS.flatMap((t) => [t.address, t.underlying])].includes(maker),
      'INVALID_ACTOR',
    );
    check(Array.isArray(config.legs) && config.legs.length === 2, 'TWO_LEGS_REQUIRED');
    const tokens = config.legs.map((leg) => {
      check(
        leg && Object.keys(leg).length === 2 && Object.hasOwn(leg, 'token') && Object.hasOwn(leg, 'amount'),
        'LEG_FIELDS',
      );
      check(
        leg.token && Object.keys(leg.token).every((k) => ['address', 'decimals', 'symbol'].includes(k)),
        'TOKEN_FIELDS',
      );
      const t = getAsset(address(leg.token.address));
      check(leg.token.decimals === t.decimals, 'DECIMALS_MISMATCH');
      check(leg.token.symbol === undefined || leg.token.symbol === t.symbol, 'SYMBOL_MISMATCH');
      return t;
    });
    check(BigInt(tokens[0].address) < BigInt(tokens[1].address), 'AQUA_SHIP_LEGS_ORDER_INVALID');
    const amounts = config.legs.map((leg) => uint(rawInteger(leg.amount), 96, true));
    check(
      amounts.some((v) => v > 0n),
      'RESERVE_RANGE',
    );
    check(['straight_full_range', 'curved_pegged'].includes(config.shape), 'UNSUPPORTED_SHAPE');
    let concentrate, width;
    if (config.concentrate !== undefined) {
      check(config.shape === 'straight_full_range', 'AQUA_CONCENTRATE_SHAPE_INVALID');
      const p = config.concentrate;
      check(
        p &&
          Object.keys(p).length === 2 &&
          Object.hasOwn(p, 'rawPriceMin') &&
          Object.hasOwn(p, 'rawPriceMax'),
        'PRICE_FIELDS',
      );
      const min = uint(rawInteger(p.rawPriceMin), 128),
        max = uint(rawInteger(p.rawPriceMax), 128);
      check(min < max, 'PRICE_RANGE');
      concentrate = instructions.concentrate.ConcentrateGrowLiquidity2DArgs.fromRawPrices(min, max);
    } else
      check(
        amounts.every((v) => v > 0n),
        'TWO_SIDED_RESERVES_REQUIRED',
      );
    if (config.shape === 'curved_pegged') {
      width = uint(rawInteger(config.linearWidth));
      check(width <= 5000n * 10n ** 27n, 'AMPLIFICATION_RANGE');
    } else check(config.linearWidth === undefined, 'UNEXPECTED_LINEAR_WIDTH');
    const fee = uint(rawInteger(config.feeRateE9), 32, true);
    let protocolFee = 0n,
      receiver;
    if (config.protocolFee !== undefined) {
      const p = config.protocolFee;
      check(
        p && Object.keys(p).length === 2 && Object.hasOwn(p, 'feeRateE9') && Object.hasOwn(p, 'receiver'),
        'PROTOCOL_FEE_FIELDS',
      );
      protocolFee = uint(rawInteger(p.feeRateE9), 32, true);
      receiver = address(p.receiver);
      check(
        receiver !== maker &&
          ![...Object.values(C), ...ASSETS.flatMap((t) => [t.address, t.underlying])].includes(receiver),
        'INVALID_ACTOR',
      );
    }
    check(fee + protocolFee < 10n ** 9n, 'FEE_RANGE');
    const expiry = uint(rawInteger(config.expiry), 40),
      salt = uint(rawInteger(config.salt), 64);
    check(typeof now === 'bigint' && now >= 0n && expiry > now, 'STRATEGY_EXPIRED');
    return {
      maker,
      receiver,
      amounts,
      tokens,
      width,
      concentrate,
      fee,
      protocolFee,
      expiry,
      salt,
      shape: config.shape,
    };
  }
  function rawInteger(value) {
    check(typeof value === 'bigint' || typeof value === 'string', 'INTEGER_STRING_OR_BIGINT_REQUIRED');
    return String(value);
  }

  function buildStrategy(config, { now = BigInt(Math.floor(Date.now() / 1000)) } = {}) {
    const p = normalize(config, now);
    const marketTokens = p.tokens ?? TOKENS;
    // Same official pegged-AMM instructions, with mandatory expiry and exact integer fee encoding.
    const builder = new AquaProgramBuilder()
      .onlyTxOriginTokenBalanceNonZero({ token: new Address(C.resolverCredential) })
      .deadline({ deadline: p.expiry });
    if (p.protocolFee) builder.aquaProtocolFeeAmountInXD({ fee: p.protocolFee, to: new Address(p.receiver) });
    if (p.concentrate) builder.concentrateGrowLiquidity2D(p.concentrate);
    if (p.fee) builder.flatFeeAmountInXD({ fee: p.fee });
    if (!p.shape || p.shape === 'curved_pegged') {
      const [a, b] = marketTokens.map((t, i) => ({
        address: new Address(t.address),
        decimals: t.decimals,
        reserve: p.amounts[i],
      }));
      builder.peggedSwapGrowPriceRange2D(instructions.peggedSwap.PeggedSwapArgs.fromTokens(a, b, p.width));
    } else builder.xycSwapXD();
    const program = builder.salt({ salt: p.salt }).build();
    const order = Order.new({ maker: new Address(p.maker), traits: MakerTraits.default(), program });
    const strategy = order.encode(),
      strategyHash = AquaProtocolContract.calculateStrategyHash(strategy);
    check(keccak256(strategy.toString()) === strategyHash.toString(), 'STRATEGY_HASH_MISMATCH');
    const aqua = new AquaProtocolContract(new Address(C.aqua));
    const tx = (purpose, to, data) => ({
      purpose,
      chainId: 1,
      from: p.maker,
      to: address(String(to)),
      data: String(data),
      value: '0',
    });
    const approval = (token, amount, purpose) =>
      tx(purpose, token, erc20.encodeFunctionData('approve', [C.aqua, amount]));
    const tokens = marketTokens.map((t) => new Address(t.address));
    const ship = aqua.ship({
      app: new Address(C.swapVmRouter),
      strategy,
      amountsAndTokens: tokens.map((token, i) => ({ token, amount: p.amounts[i] })),
    });
    const dock = aqua.dock({ app: new Address(C.swapVmRouter), strategyHash, tokens });
    const bundle = {
      schema: 'ring.aqua-swapvm-unsigned.v1',
      chainId: 1,
      routerVersion: deployment.routerVersion,
      config: JSON.parse(
        json({ ...config, maker: p.maker, ...(!p.shape ? { protocolFeeReceiver: p.receiver } : {}) }),
      ),
      strategy: strategy.toString(),
      strategyHash: strategyHash.toString(),
      order: order.build(),
      tokenAmounts: marketTokens.map((t, i) => ({ ...t, amount: String(p.amounts[i]) })),
      open: [
        ...marketTokens.flatMap((t, i) => [
          approval(t.address, 0n, `Reset ${t.symbol} Aqua allowance`),
          approval(t.address, p.amounts[i], `Approve bounded ${t.symbol} Aqua allowance`),
        ]),
        tx('Ship official SwapVM strategy', ship.to, ship.data),
      ],
      close: [
        tx('Dock both tokens', dock.to, dock.data),
        ...marketTokens.map((t) => approval(t.address, 0n, `Revoke ${t.symbol} Aqua allowance`)),
      ],
      safety: {
        unsigned: true,
        executionAllowed: false,
        productionReady: false,
        officialFrontendTraffic: 'unverified',
      },
    };
    return { bundle, order, builder, parameters: p };
  }

  // Every taker payload is explicitly bounded. Quote is an eth_call; execution is not exposed by the CLI.
  function buildQuote(config, request, { now = BigInt(Math.floor(Date.now() / 1000)) } = {}) {
    const built = buildStrategy(config, { now });
    const addressed = Object.hasOwn(request, 'tokenIn') || Object.hasOwn(request, 'tokenOut');
    const requestKeys = [
      ...(addressed ? ['tokenIn', 'tokenOut'] : ['direction']),
      'exactIn',
      'amount',
      'threshold',
      'deadline',
      'taker',
      'receiver',
    ];
    check(
      requestKeys.every((k) => Object.hasOwn(request, k)) &&
        Object.keys(request).every((k) => requestKeys.includes(k)),
      'QUOTE_FIELDS',
    );
    check(!addressed || !Object.hasOwn(request, 'direction'), 'AMBIGUOUS_DIRECTION');
    if (!addressed) check(['USDC_USDT', 'USDT_USDC'].includes(request.direction), 'UNSUPPORTED_DIRECTION');
    check(typeof request.exactIn === 'boolean', 'EXACT_MODE_REQUIRED');
    const amount = uint(rawInteger(request.amount), 96),
      threshold = uint(rawInteger(request.threshold), 96);
    const deadline = uint(rawInteger(request.deadline), 40);
    check(deadline > now && deadline <= built.parameters.expiry, 'INVALID_TAKER_DEADLINE');
    const taker = address(request.taker),
      receiver = address(request.receiver);
    const [tokenIn, tokenOut] = addressed
      ? [address(request.tokenIn), address(request.tokenOut)]
      : request.direction === 'USDC_USDT'
        ? [C.fwUsdc, C.fwUsdt]
        : [C.fwUsdt, C.fwUsdc];
    check(
      tokenIn !== tokenOut &&
        [tokenIn, tokenOut].every((a) => built.bundle.tokenAmounts.some((t) => t.address === a)),
      'TOKEN_NOT_IN_STRATEGY',
    );
    const traits = TakerTraits.new({
      exactIn: request.exactIn,
      firstTransferFromTaker: true,
      useTransferFromAndAquaPush: true,
      threshold,
      customReceiver: new Address(receiver),
      deadline,
    });
    const args = {
      order: built.order,
      tokenIn: new Address(tokenIn),
      tokenOut: new Address(tokenOut),
      amount,
      takerTraits: traits,
    };
    const router = new SwapVMContract(new Address(C.swapVmRouter));
    const q = router.quote(args);
    return {
      ...built,
      tokenIn,
      tokenOut,
      traits,
      args,
      transaction: { from: taker, to: String(q.to), data: String(q.data) },
    };
  }

  return {
    C,
    ASSETS,
    TOKENS,
    deployment,
    sdk,
    AquaProtocolContract,
    erc20,
    aquaAbi,
    routerAbi,
    json,
    check,
    address,
    uint,
    decimal,
    normalize,
    buildStrategy,
    buildQuote,
  };
}
