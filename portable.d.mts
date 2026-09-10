import type * as kit from './index.mjs';
export function createRingAquaIntegration(dependencies: {
  swapVmSdk: typeof import('@1inch/swap-vm-sdk');
  aquaSdk: typeof import('@1inch/aqua-sdk');
}): Pick<
  typeof kit,
  | 'ASSETS'
  | 'getAsset'
  | 'fewAbi'
  | 'buildStrategy'
  | 'buildQuote'
  | 'buildAquaShipPlan'
  | 'buildAquaDockPlan'
  | 'buildAquaQuoteCall'
  | 'buildAquaSwapCall'
  | 'buildMakerWrapPlan'
  | 'buildMakerUnwrapPlan'
  | 'buildUnderlyingRoute'
>;
