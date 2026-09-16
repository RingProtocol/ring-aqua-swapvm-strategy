import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  buildAquaShipPlan,
  buildAquaDockPlan,
  buildAquaQuoteCall,
  buildAquaSwapCall,
  buildMakerWrapPlan,
  buildMakerUnwrapPlan,
  buildNativeWrapPlan,
  buildNativeUnwrapPlan,
  buildUnderlyingRoute,
  getAsset,
} from '@ring-protocol/aqua-swapvm-strategy';

// Offline example only: placeholder actors, synthetic inventory and limits.
// No RPC, wallet, signature or live quote. Never broadcast these sample calls.
export function buildExamplePlans() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const maker = '0x0000000000000000000000000000000000000101';
  const operator = '0x0000000000000000000000000000000000000102';
  const executor = '0x0000000000000000000000000000000000000103';
  const receiver = '0x0000000000000000000000000000000000000104';
  const usdc = getAsset('USDC');
  const weth = getAsset('WETH');
  const config = {
    chainId: 1,
    maker,
    legs: [
      { token: { address: usdc.address, decimals: usdc.decimals }, amount: '300000000' },
      { token: { address: weth.address, decimals: weth.decimals }, amount: '100000000000000000' },
    ].sort((a, b) => (BigInt(a.token.address) < BigInt(b.token.address) ? -1 : 1)),
    shape: 'straight_full_range',
    feeRateE9: '10000',
    expiry: String(now + 3600n),
    salt: String(BigInt('0x' + randomBytes(8).toString('hex')) || 1n),
  };
  const request = {
    tokenIn: usdc.address,
    tokenOut: weth.address,
    exactIn: true,
    amount: '1000000',
    threshold: '300000000000000',
    deadline: String(now + 600n),
  };
  const ship = buildAquaShipPlan(config, { now });
  // Persist this complete identity after confirming the actual Ship receipt.
  const identity = {
    chainId: 1,
    maker,
    strategyHash: ship.strategyHash,
    tokens: config.legs.map((leg) => leg.token.address),
  };
  const conversion = {
    chainId: 1,
    maker,
    asset: 'WETH',
    amount: config.legs.find((leg) => leg.token.address === weth.address).amount,
  };
  return {
    config,
    identity,
    // Optional outer layer when starting/ending with native ETH, not already-held WETH.
    nativeWrap: buildNativeWrapPlan({ chainId: 1, maker, amount: conversion.amount }),
    wrap: buildMakerWrapPlan(conversion),
    ship,
    quote: buildAquaQuoteCall(config, { ...request, taker: operator, receiver }, { now }),
    swap: buildAquaSwapCall(config, { ...request, taker: operator, receiver }, { now }),
    route: buildUnderlyingRoute(config, { ...request, chainId: 1, operator, executor, receiver }, { now }),
    dock: buildAquaDockPlan(identity),
    // Only a format example; live unwrapping must use fresh balances/redemption checks.
    unwrap: buildMakerUnwrapPlan(conversion),
    nativeUnwrap: buildNativeUnwrapPlan({ chainId: 1, maker, amount: conversion.amount }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plans = buildExamplePlans();
  console.log(
    JSON.stringify(
      {
        mode: 'offline-example-do-not-broadcast',
        pair: 'USDC/WETH',
        strategyHash: plans.identity.strategyHash,
        wrapCalls: plans.wrap.transactions.length,
        nativeWrapCalls: plans.nativeWrap.transactions.length,
        shipCalls: plans.ship.transactions.length,
        dockCalls: plans.dock.transactions.length,
        unwrapCalls: plans.unwrap.transactions.length,
        nativeUnwrapCalls: plans.nativeUnwrap.transactions.length,
        routeAdapter: plans.route.adapterStatus,
        safety: plans.ship.safety,
      },
      null,
      2,
    ),
  );
}
