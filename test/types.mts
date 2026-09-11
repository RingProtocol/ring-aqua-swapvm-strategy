import {
  buildAquaShipPlan,
  buildAquaDockPlan,
  buildAquaSwapCall,
  buildUnderlyingRoute,
  getAsset,
  type MarketConfig,
  type Address,
} from '@ring-protocol/aqua-swapvm-strategy';
import { createRingAquaIntegration } from '@ring-protocol/aqua-swapvm-strategy/portable';
import * as swapVmSdk from '@1inch/swap-vm-sdk';
import * as aquaSdk from '@1inch/aqua-sdk';
const maker: Address = '0x0000000000000000000000000000000020260909';
const usdc = getAsset('USDC'),
  weth = getAsset('WETH');
const config: MarketConfig = {
  chainId: 1,
  maker,
  legs: [
    { token: { address: usdc.address, decimals: usdc.decimals }, amount: 300000000n },
    { token: { address: weth.address, decimals: weth.decimals }, amount: 100000000000000000n },
  ],
  shape: 'straight_full_range',
  feeRateE9: '10000',
  expiry: '1900000000',
  salt: '1',
};
const plan = buildAquaShipPlan(config);
buildAquaDockPlan({
  chainId: 1,
  maker,
  strategyHash: plan.strategyHash,
  tokens: [usdc.address, weth.address],
});
const request = {
  tokenIn: usdc.address,
  tokenOut: weth.address,
  exactIn: true,
  amount: '1000000',
  threshold: '1',
  deadline: '1890000000',
  taker: maker,
  receiver: maker,
};
buildAquaSwapCall(config, request);
const { taker, ...route } = request;
buildUnderlyingRoute(config, {
  ...route,
  chainId: 1,
  operator: maker,
  executor: '0x0000000000000000000000000000000020260911',
});
createRingAquaIntegration({ swapVmSdk, aquaSdk }).buildAquaShipPlan(config);
// @ts-expect-error No floating-point token amount.
buildAquaShipPlan({ ...config, legs: [{ token: config.legs[0].token, amount: 1.5 }, config.legs[1]] });
buildAquaDockPlan({
  chainId: 1,
  maker,
  strategyHash: plan.strategyHash,
  tokens: [usdc.address, weth.address],
  // @ts-expect-error Do not silently accept target overrides.
  router: maker,
});
// @ts-expect-error The declared API has no native ETH market input.
buildAquaShipPlan({ ...config, shape: 'native_eth' });
