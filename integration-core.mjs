import { Interface, keccak256 } from 'ethers';
import { ASSETS, getAsset } from './assets.mjs';

// Ring's integration interface, not a private 1inch/Barker API. No signer or RPC writes.
export function createIntegrationApi(api) {
  const { C, deployment, sdk, check, address, uint, buildStrategy, buildQuote, erc20 } = api;
  const dockAbi = new Interface(['function dock(address,bytes32,address[])']);
  const fewAbi = new Interface([
    'function wrapTo(uint256,address) returns(uint256)',
    'function unwrapTo(uint256,address) returns(uint256)',
  ]);
  const safety = () => ({
    unsigned: true,
    executionAllowed: false,
    productionReady: false,
    officialFrontendTraffic: 'unverified',
  });
  function fields(input, keys) {
    check(
      input &&
        typeof input === 'object' &&
        !Array.isArray(input) &&
        Object.keys(input).length === keys.length &&
        keys.every((k) => Object.hasOwn(input, k)),
      'PLAN_FIELDS',
    );
  }
  function actor(value) {
    const a = address(value);
    check(
      ![...Object.values(C), ...ASSETS.flatMap((t) => [t.address, t.underlying])].includes(a),
      'INVALID_ACTOR',
    );
    return a;
  }
  const transaction = (from, to, data, purpose) => ({
    chainId: 1,
    from,
    to: address(to),
    data,
    value: '0',
    purpose,
  });
  const approve = (from, token, spender, amount) =>
    transaction(from, token, erc20.encodeFunctionData('approve', [spender, amount]), 'Set bounded allowance');
  function lifecycle(bundle, kind) {
    const call = kind === 'ship' ? bundle.open.at(-1) : bundle.close[0];
    return {
      schema: 'ring.aqua-lifecycle.v1',
      kind,
      chainId: 1,
      registryAddress: C.aqua,
      appAddress: C.swapVmRouter,
      maker: bundle.config.maker,
      strategyHash: bundle.strategyHash,
      encodedOrder: bundle.strategy,
      to: call.to,
      data: call.data,
      value: call.value,
      transaction: call,
      tokenAmounts: bundle.tokenAmounts,
      transactions: kind === 'ship' ? bundle.open : bundle.close,
      atomicRequired: false,
      safety: safety(),
    };
  }
  function buildAquaShipPlan(config, options) {
    return lifecycle(buildStrategy(config, options).bundle, 'ship');
  }
  function buildAquaDockPlan(config) {
    if (config && Object.hasOwn(config, 'strategyHash')) {
      fields(config, ['chainId', 'maker', 'strategyHash', 'tokens']);
      check(config.chainId === 1, 'UNSUPPORTED_CHAIN');
      const maker = actor(config.maker);
      check(
        /^0x[0-9a-fA-F]{64}$/.test(config.strategyHash) && BigInt(config.strategyHash) !== 0n,
        'INVALID_STRATEGY_HASH',
      );
      check(Array.isArray(config.tokens) && config.tokens.length === 2, 'TWO_LEGS_REQUIRED');
      // Historical receipt identity is sufficient for closing, even if an asset is
      // later removed from the new-position catalog. Never accept target overrides.
      const tokens = config.tokens.map((t) => address(t));
      check(BigInt(tokens[0]) < BigInt(tokens[1]), 'AQUA_SHIP_LEGS_ORDER_INVALID');
      const call = transaction(
        maker,
        C.aqua,
        dockAbi.encodeFunctionData('dock', [C.swapVmRouter, config.strategyHash, tokens]),
        'Dock both tokens',
      );
      return {
        schema: 'ring.aqua-lifecycle.v1',
        kind: 'dock',
        chainId: 1,
        registryAddress: C.aqua,
        appAddress: C.swapVmRouter,
        maker,
        strategyHash: config.strategyHash.toLowerCase(),
        tokens,
        to: call.to,
        data: call.data,
        value: call.value,
        transaction: call,
        transactions: [call, ...tokens.map((t) => approve(maker, t, C.aqua, 0n))],
        atomicRequired: false,
        safety: safety(),
      };
    }
    // Closing must remain possible after expiry. Reconstruct historical bytes, never
    // alter the order's actual deadline and never expose a new ship transaction here.
    const expiry = uint(typeof config?.expiry === 'bigint' ? String(config.expiry) : config?.expiry, 40);
    return lifecycle(buildStrategy(config, { now: expiry - 1n }).bundle, 'dock');
  }
  function conversion(input, wrap) {
    fields(input, ['chainId', 'maker', 'asset', 'amount']);
    check(input.chainId === 1, 'UNSUPPORTED_CHAIN');
    const t = getAsset(input.asset);
    const maker = actor(input.maker),
      amount = uint(input.amount, 96);
    const call = transaction(
      maker,
      t.address,
      fewAbi.encodeFunctionData(wrap ? 'wrapTo' : 'unwrapTo', [amount, maker]),
      wrap ? 'Wrap underlying into maker FewToken' : 'Unwrap FewToken to maker underlying',
    );
    return {
      schema: 'ring.fewtoken-conversion.v1',
      kind: wrap ? 'wrap' : 'unwrap',
      chainId: 1,
      maker,
      recipient: maker,
      asset: t.asset,
      amount: String(amount),
      underlying: t.underlying,
      fewToken: t.address,
      atomicRequired: false,
      transactions: wrap
        ? [
            approve(maker, t.underlying, t.address, 0n),
            approve(maker, t.underlying, t.address, amount),
            call,
            approve(maker, t.underlying, t.address, 0n),
          ]
        : [call],
      safety: safety(),
    };
  }
  const buildMakerWrapPlan = (input) => conversion(input, true);
  const buildMakerUnwrapPlan = (input) => conversion(input, false);

  function takerCall(config, request, options, swap) {
    const q = buildQuote(config, request, options);
    const call = swap ? new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(q.args) : q.transaction;
    return {
      chainId: 1,
      from: address(request.taker),
      to: address(String(call.to)),
      data: String(call.data),
      value: '0',
    };
  }
  const buildAquaQuoteCall = (config, request, options) => takerCall(config, request, options, false);
  const buildAquaSwapCall = (config, request, options) => takerCall(config, request, options, true);

  function buildUnderlyingRoute(config, request, options) {
    const addressed = Object.hasOwn(request, 'tokenIn') || Object.hasOwn(request, 'tokenOut');
    const pair = addressed
      ? { tokenIn: request.tokenIn, tokenOut: request.tokenOut }
      : { direction: request.direction };
    fields(request, [
      'chainId',
      ...Object.keys(pair),
      'exactIn',
      'amount',
      'threshold',
      'operator',
      'executor',
      'receiver',
      'deadline',
    ]);
    check(request.chainId === 1, 'UNSUPPORTED_CHAIN');
    const operator = actor(request.operator),
      executor = actor(request.executor),
      receiver = actor(request.receiver);
    check(
      executor !== operator && executor !== receiver && executor !== address(config.maker),
      'INVALID_EXECUTOR',
    );
    const q = buildQuote(
      config,
      {
        ...pair,
        exactIn: request.exactIn,
        amount: request.amount,
        threshold: request.threshold,
        taker: operator,
        receiver: executor,
        deadline: request.deadline,
      },
      options,
    );
    const [input, output] = [q.tokenIn, q.tokenOut].map((a) =>
      q.bundle.tokenAmounts.find((t) => t.address === a),
    );
    const maxAmountIn = String(request.exactIn ? request.amount : request.threshold);
    const minAmountOut = String(request.exactIn ? request.threshold : request.amount);
    const swap = new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(q.args);
    const rawSwap = { to: address(String(swap.to)), data: String(swap.data), value: '0' };
    const recipe = {
      schema: 'ring.aqua-underlying-route.v1',
      chainId: 1,
      routerVersion: deployment.routerVersion,
      strategyHash: q.bundle.strategyHash,
      maker: q.bundle.config.maker,
      operator,
      executor,
      receiver,
      refundReceiver: operator,
      credential: C.resolverCredential,
      registryAddress: C.aqua,
      appAddress: C.swapVmRouter,
      ...(addressed ? { tokenIn: q.tokenIn, tokenOut: q.tokenOut } : pair),
      exactIn: request.exactIn,
      amount: String(request.amount),
      maxAmountIn,
      minAmountOut,
      deadline: String(request.deadline),
      originIn: input.underlying,
      fewIn: input.address,
      fewOut: output.address,
      originOut: output.underlying,
      quoteCall: { ...q.transaction, chainId: 1, value: '0' },
      swapCall: { ...rawSwap, caller: executor },
      // Output/refund calls MUST be materialized from actual swap return values in
      // the same EVM transaction. A stale quote is never an unwrap amount.
      steps: [
        { kind: 'fund', token: input.underlying, from: operator, to: executor, amount: maxAmountIn },
        { kind: 'call', ...approve(executor, input.underlying, input.address, 0n) },
        { kind: 'call', ...approve(executor, input.underlying, input.address, BigInt(maxAmountIn)) },
        {
          kind: 'call',
          ...transaction(
            executor,
            input.address,
            fewAbi.encodeFunctionData('wrapTo', [maxAmountIn, executor]),
            'Wrap input budget',
          ),
        },
        { kind: 'call', ...approve(executor, input.address, C.swapVmRouter, 0n) },
        { kind: 'call', ...approve(executor, input.address, C.swapVmRouter, BigInt(maxAmountIn)) },
        { kind: 'swap', caller: executor, ...rawSwap, returns: ['amountIn', 'amountOut'] },
        {
          kind: 'runtimeUnwrap',
          caller: executor,
          to: output.address,
          method: 'unwrapTo',
          amountFrom: 'swap.amountOut',
          recipient: receiver,
        },
        {
          kind: 'runtimeRefund',
          caller: executor,
          to: input.address,
          method: 'unwrapTo',
          amountFrom: 'maxAmountIn - swap.amountIn',
          recipient: operator,
          skipWhenZero: true,
        },
        { kind: 'call', ...approve(executor, input.underlying, input.address, 0n) },
        { kind: 'call', ...approve(executor, input.address, C.swapVmRouter, 0n) },
      ],
      requirements: {
        atomic: true,
        eligibleOperatorAtTxOrigin: true,
        operatorAuthorizesExecutor: true,
        enforceDeadlineAndBounds: true,
        enforceCanonicalTokenBindings: true,
        reconcileActualTokenDeltas: true,
        preservePreexistingBalances: true,
        clearTemporaryAllowances: true,
        settleOuterUserOrder: true,
      },
    };
    return {
      ...recipe,
      recipeHash: keccak256(new TextEncoder().encode(JSON.stringify(recipe))),
      atomicRequired: true,
      adapterStatus: 'requires-resolver-runtime-adapter',
      safety: safety(),
    };
  }
  return {
    buildAquaShipPlan,
    buildAquaDockPlan,
    buildAquaQuoteCall,
    buildAquaSwapCall,
    buildMakerWrapPlan,
    buildMakerUnwrapPlan,
    buildUnderlyingRoute,
    fewAbi,
  };
}
