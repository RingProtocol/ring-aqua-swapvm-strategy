import * as swapVmSdk from '@1inch/swap-vm-sdk';
import * as aquaSdk from '@1inch/aqua-sdk';
import { createRingAquaIntegration } from '../portable.mjs';

// Browser smoke only. No wallet, RPC, signing or network call.
const kit = createRingAquaIntegration({ swapVmSdk, aquaSdk });
const usdc = kit.getAsset('USDC'),
  weth = kit.getAsset('WETH');
const maker = '0x0000000000000000000000000000000020260909';
const config = {
  chainId: 1,
  maker,
  legs: [
    { token: { address: usdc.address, decimals: 6 }, amount: 300000000n },
    { token: { address: weth.address, decimals: 18 }, amount: 100000000000000000n },
  ],
  shape: 'straight_full_range',
  feeRateE9: '10000',
  expiry: '1900000000',
  salt: '2026091101',
};
const plan = kit.buildAquaShipPlan(config, { now: 1800000000n });
const close = kit.buildAquaDockPlan({
  chainId: 1,
  maker,
  strategyHash: plan.strategyHash,
  tokens: [usdc.address, weth.address],
});
const wrap = kit.buildMakerWrapPlan({ chainId: 1, maker, asset: 'WETH', amount: '100000000000000000' });
if (plan.transactions.length !== 5 || close.transactions.length !== 3 || wrap.transactions.length !== 4)
  throw new Error('BROWSER_PLAN_MISMATCH');
document.body.textContent = JSON.stringify({
  status: 'passed',
  pair: 'fwUSDC/fwWETH',
  assets: kit.ASSETS.length,
  strategyHash: plan.strategyHash,
  shipCalls: plan.transactions.length,
  closeCalls: close.transactions.length,
  unsigned: true,
  walletConnected: false,
  rpcConfigured: false,
});
