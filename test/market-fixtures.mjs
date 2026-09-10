import { getAsset } from '../assets.mjs';
import { MAKER, NOW } from './fixtures.mjs';

// Synthetic inventory for arithmetic and execution tests, never pricing advice.
export function market(
  a = 'USDC',
  b = 'WETH',
  amountA = '300000000',
  amountB = '100000000000000000',
  extra = {},
) {
  const legs = [
    [a, amountA],
    [b, amountB],
  ]
    .map(([asset, amount]) => {
      const { address, symbol, decimals } = getAsset(asset);
      return { token: { address, symbol, decimals }, amount };
    })
    .sort((x, y) => (BigInt(x.token.address) < BigInt(y.token.address) ? -1 : 1));
  return {
    chainId: 1,
    maker: MAKER,
    legs,
    shape: 'straight_full_range',
    feeRateE9: '10000',
    expiry: String(NOW + 86400n),
    salt: '2026091101',
    ...extra,
  };
}

export function concentrated(config) {
  const price = (BigInt(config.legs[1].amount) * 10n ** 18n) / BigInt(config.legs[0].amount);
  return { ...config, concentrate: { rawPriceMin: String(price / 2n), rawPriceMax: String(price * 2n) } };
}
