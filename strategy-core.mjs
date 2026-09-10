import { getAddress, Interface, keccak256 } from 'ethers';

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
    if (!ok) throw new Error(code);
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

  function buildStrategy(config, { now = BigInt(Math.floor(Date.now() / 1000)) } = {}) {
    const p = normalize(config, now);
    const curve = instructions.peggedSwap.PeggedSwapArgs.fromTokens(
      { address: new Address(C.fwUsdc), decimals: 6, reserve: p.amounts[0] },
      { address: new Address(C.fwUsdt), decimals: 6, reserve: p.amounts[1] },
      p.width,
    );
    // Same official pegged-AMM instructions, with mandatory expiry and exact integer fee encoding.
    const builder = new AquaProgramBuilder()
      .onlyTxOriginTokenBalanceNonZero({ token: new Address(C.resolverCredential) })
      .deadline({ deadline: p.expiry });
    if (p.protocolFee) builder.aquaProtocolFeeAmountInXD({ fee: p.protocolFee, to: new Address(p.receiver) });
    if (p.fee) builder.flatFeeAmountInXD({ fee: p.fee });
    const program = builder.peggedSwapGrowPriceRange2D(curve).salt({ salt: p.salt }).build();
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
    const tokens = TOKENS.map((t) => new Address(t.address));
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
      config: { ...config, maker: p.maker, protocolFeeReceiver: p.receiver },
      strategy: strategy.toString(),
      strategyHash: strategyHash.toString(),
      order: order.build(),
      tokenAmounts: TOKENS.map((t, i) => ({ ...t, amount: String(p.amounts[i]) })),
      open: [
        ...TOKENS.flatMap((t) => [
          approval(t.address, 0n, `Reset ${t.symbol} Aqua allowance`),
          approval(t.address, p.amounts[TOKENS.indexOf(t)], `Approve bounded ${t.symbol} Aqua allowance`),
        ]),
        tx('Ship official SwapVM strategy', ship.to, ship.data),
      ],
      close: [
        tx('Dock both tokens', dock.to, dock.data),
        ...TOKENS.map((t) => approval(t.address, 0n, `Revoke ${t.symbol} Aqua allowance`)),
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
    check(['USDC_USDT', 'USDT_USDC'].includes(request.direction), 'UNSUPPORTED_DIRECTION');
    check(typeof request.exactIn === 'boolean', 'EXACT_MODE_REQUIRED');
    const amount = uint(request.amount, 96),
      threshold = uint(request.threshold, 96);
    const deadline = uint(request.deadline, 40);
    check(deadline > now && deadline <= built.parameters.expiry, 'INVALID_TAKER_DEADLINE');
    const taker = address(request.taker),
      receiver = address(request.receiver);
    const [tokenIn, tokenOut] =
      request.direction === 'USDC_USDT' ? [C.fwUsdc, C.fwUsdt] : [C.fwUsdt, C.fwUsdc];
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
    TOKENS,
    deployment,
    sdk,
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
