import { readFileSync } from 'node:fs';
import { AbiCoder, Interface, keccak256 } from 'ethers';
import { C, address, check, erc20 } from './strategy.mjs';
import { snapshot } from './readonly.mjs';

export const catalog = JSON.parse(readFileSync(new URL('./config/wrapper-sources.json', import.meta.url)));
export const v4Quoter = new Interface([
  'function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256 amountOut,uint256 gasEstimate)',
  'function quoteExactOutputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256 amountIn,uint256 gasEstimate)',
]);
export function poolId(key) {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint24', 'int24', 'address'],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}
export function wrapperQuote(row, { wrap, exactIn, amount }) {
  check(
    typeof wrap === 'boolean' &&
      typeof exactIn === 'boolean' &&
      typeof amount === 'bigint' &&
      amount > 0n &&
      amount < 2n ** 128n,
    'WRAPPER_QUOTE_INPUT',
  );
  const input = wrap
    ? row.asset === 'ETH'
      ? '0x0000000000000000000000000000000000000000'
      : row.underlying
    : row.fewToken;
  const method = exactIn ? 'quoteExactInputSingle' : 'quoteExactOutputSingle';
  return {
    method,
    to: catalog.quoter,
    data: v4Quoter.encodeFunctionData(method, [
      {
        poolKey: row.poolKey,
        zeroForOne: input === row.poolKey.currency0,
        exactAmount: amount,
        hookData: '0x',
      },
    ]),
  };
}

// Portable source data for an integration review, not a claimed Pathfinder plugin interface.
export async function inspectSources(rpc, options = {}) {
  const output = {
    schema: 'ring.wrapper-source-check.v1',
    status: 'read_failed',
    block: null,
    sources: [],
    officialFrontendTraffic: 'unverified',
    executionAllowed: false,
  };
  try {
    const s = await snapshot(rpc, options);
    output.block = s.header;
    for (const row of catalog.sources) {
      check(poolId(row.poolKey) === row.poolId, 'POOL_ID_MISMATCH');
      const few = address((await s.call(C.fewFactory, erc20, 'getWrappedToken', [row.underlying]))[0]);
      check(
        few === row.fewToken && address((await s.call(few, erc20, 'token'))[0]) === row.underlying,
        'SOURCE_BINDING_MISMATCH',
      );
      for (const token of [few, row.underlying])
        check(
          Number((await s.call(token, erc20, 'decimals'))[0]) === row.decimals,
          'SOURCE_DECIMALS_MISMATCH',
        );
      const [immediateRedemptionBalance] = await s.call(row.underlying, erc20, 'balanceOf', [few]);
      const code = await rpc('eth_getCode', [row.poolKey.hooks, s.tag]);
      check(code !== '0x', 'HOOK_MISSING');
      const item = {
        ...row,
        hookCodeHash: keccak256(code),
        canonicalWrapperVerified: true,
        immediateRedemptionBalance,
        quotes: [],
      };
      for (const wrap of [true, false])
        for (const exactIn of [true, false]) {
          // Diagnostic size only, not an execution recommendation or hardcoded 1:1 quote.
          const amount = row.decimals === 6 ? 10n ** 6n : 10n ** BigInt(row.decimals - 4);
          const q = wrapperQuote(row, { wrap, exactIn, amount });
          try {
            const raw = await rpc('eth_call', [{ to: q.to, data: q.data }, s.tag]);
            const [resultAmount, gasEstimate] = v4Quoter.decodeFunctionResult(q.method, raw);
            item.quotes.push({
              wrap,
              exactIn,
              amount,
              status: 'available',
              resultAmount,
              gasEstimate,
              calldata: q.data,
              raw,
            });
          } catch {
            item.quotes.push({
              wrap,
              exactIn,
              amount,
              status: 'read_failed',
              resultAmount: null,
              gasEstimate: null,
            });
          }
        }
      output.sources.push(item);
    }
    await s.finish();
    output.status = 'available';
  } catch {
    output.status = 'read_failed';
    output.sources = [];
  }
  return output;
}
