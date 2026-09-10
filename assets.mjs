import catalog from './config/assets.json' with { type: 'json' };

// Deployment metadata, not a Pathfinder allowlist or a guarantee of redemption.
// Independent from the optional Uniswap hook source catalog.
export const ASSETS = Object.freeze(
  catalog.assets.map((row) => {
    return Object.freeze({
      chainId: catalog.chainId,
      asset: row.asset,
      symbol: row.symbol,
      address: row.address,
      underlying: row.underlying,
      decimals: row.decimals,
    });
  }),
);

export function getAsset(value) {
  const found = ASSETS.find((t) => t.asset === value || t.address === String(value).toLowerCase());
  if (!found) throw new Error('UNSUPPORTED_ASSET');
  return found;
}
