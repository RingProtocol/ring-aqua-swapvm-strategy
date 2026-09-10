import { keccak256 } from 'ethers';
import {
  C,
  TOKENS,
  deployment,
  sdk,
  check,
  address,
  buildStrategy,
  buildQuote,
  erc20,
  aquaAbi,
  routerAbi,
} from './strategy.mjs';

const READ_METHODS = new Set([
  'eth_chainId',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_call',
  'eth_getBalance',
]);
export function readonlyRpc(url, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const parsed = new URL(url);
  check(
    parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)),
    'UNSAFE_RPC_TRANSPORT',
  );
  let id = 0;
  return async (method, params = []) => {
    check(READ_METHODS.has(method), 'RPC_WRITE_FORBIDDEN');
    const requestId = ++id;
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      check(response.ok, 'RPC_HTTP_FAILED');
      const body = await response.json();
      check(
        body.jsonrpc === '2.0' && body.id === requestId && !body.error && Object.hasOwn(body, 'result'),
        'RPC_RESPONSE_INVALID',
      );
      return body.result;
    } catch {
      throw new Error('RPC_READ_FAILED');
    } // Never expose provider errors, URLs or credentials.
  };
}

export async function snapshot(
  rpc,
  { block = 'latest', now = BigInt(Math.floor(Date.now() / 1000)), maxAgeSeconds = 180 } = {},
) {
  const started = Date.now();
  check(block === 'latest' || /^0x[0-9a-f]+$/.test(block), 'INVALID_BLOCK');
  check(Number.isSafeInteger(maxAgeSeconds) && maxAgeSeconds >= 0, 'INVALID_MAX_AGE');
  check((await rpc('eth_chainId')) === '0x1', 'CHAIN_MISMATCH');
  const header = await rpc('eth_getBlockByNumber', [block, false]);
  validateHeader(header);
  check(block === 'latest' || BigInt(block) === BigInt(header.number), 'BLOCK_MISMATCH');
  const age = now - BigInt(header.timestamp);
  check(age >= -30n && age <= BigInt(maxAgeSeconds), 'STALE_BLOCK');
  const tag = { blockHash: header.hash, requireCanonical: true };
  const call = async (to, abi, name, args = [], from) => {
    const data = abi.encodeFunctionData(name, args);
    return abi.decodeFunctionResult(
      name,
      await rpc('eth_call', [{ to, data, ...(from ? { from } : {}) }, tag]),
    );
  };
  const finish = async () => {
    const end = await rpc('eth_getBlockByNumber', [header.number, false]);
    validateHeader(end);
    check(
      end.hash === header.hash && end.number === header.number && end.timestamp === header.timestamp,
      'BLOCK_CHANGED',
    );
    check((await rpc('eth_chainId')) === '0x1', 'CHAIN_MISMATCH');
    check(
      now + BigInt(Math.floor((Date.now() - started) / 1000)) - BigInt(header.timestamp) <=
        BigInt(maxAgeSeconds),
      'STALE_BLOCK',
    );
  };
  return { header, tag, call, finish };
}
function validateHeader(h) {
  check(
    h &&
      /^0x[0-9a-f]{64}$/.test(h.hash) &&
      /^0x[0-9a-f]+$/.test(h.number) &&
      /^0x[0-9a-f]+$/.test(h.timestamp),
    'INVALID_HEADER',
  );
}

export async function preflight(rpc, config, { request, ...options } = {}) {
  const result = {
    schema: 'ring.aqua-preflight.v1',
    status: 'read_failed',
    block: null,
    deploymentVerified: false,
    canonicalTokens: false,
    maker: null,
    quote: null,
    fillSimulation: null,
    issues: [],
    executionAllowed: false,
    officialFrontendTraffic: 'unverified',
  };
  try {
    const { bundle, parameters } = buildStrategy(config, options);
    const s = await snapshot(rpc, options);
    result.block = s.header;
    for (const { address: to, codeHash } of Object.values(deployment.contracts)) {
      check(keccak256(await rpc('eth_getCode', [to, s.tag])) === codeHash, 'DEPLOYMENT_MISMATCH');
    }
    result.deploymentVerified = true;
    for (const t of TOKENS) {
      check(
        address((await s.call(C.fewFactory, erc20, 'getWrappedToken', [t.underlying]))[0]) === t.address,
        'WRAPPER_BINDING_MISMATCH',
      );
      check(address((await s.call(t.address, erc20, 'token'))[0]) === t.underlying, 'UNDERLYING_MISMATCH');
      for (const a of [t.address, t.underlying])
        check(Number((await s.call(a, erc20, 'decimals'))[0]) === t.decimals, 'DECIMALS_MISMATCH');
    }
    result.canonicalTokens = true;
    const rows = [];
    for (const [i, t] of TOKENS.entries()) {
      const [balance] = await s.call(t.address, erc20, 'balanceOf', [parameters.maker]);
      const [allowance] = await s.call(t.address, erc20, 'allowance', [parameters.maker, C.aqua]);
      const [virtualBalance, tokensCount] = await s.call(C.aqua, aquaAbi, 'rawBalances', [
        parameters.maker,
        C.swapVmRouter,
        bundle.strategyHash,
        t.address,
      ]);
      const state =
        tokensCount === 0n
          ? 'unshipped'
          : tokensCount === 255n
            ? 'docked'
            : tokensCount === 2n
              ? 'active'
              : 'unexpected_token_count';
      const available =
        state === 'active' ? [balance, allowance, virtualBalance].reduce((a, b) => (a < b ? a : b)) : 0n;
      rows.push({
        symbol: t.symbol,
        balance,
        allowance,
        virtualBalance,
        tokensCount,
        state,
        availableOutflow: available,
        initialAmount: parameters.amounts[i],
      });
    }
    result.maker = rows;
    if (rows.some((r) => r.state !== 'active')) result.issues.push('STRATEGY_NOT_ACTIVE');
    if (rows.some((r) => r.availableOutflow === 0n)) result.issues.push('NO_AVAILABLE_OUTFLOW');
    if (rows.some((r) => r.allowance > r.initialAmount))
      result.issues.push('ALLOWANCE_EXCEEDS_CONFIGURED_CAP');
    if (request) {
      const q = buildQuote(config, request, options);
      const [credential] = await s.call(C.resolverCredential, erc20, 'balanceOf', [request.taker]);
      if (!credential) result.issues.push('TAKER_CREDENTIAL_MISSING');
      try {
        const raw = await rpc('eth_call', [q.transaction, s.tag]);
        const [amountIn, amountOut] = routerAbi.decodeFunctionResult('quote', raw);
        result.quote = { amountIn, amountOut, tokenIn: q.tokenIn, tokenOut: q.tokenOut, raw };
        const out = rows.find((r) => TOKENS.find((t) => t.symbol === r.symbol).address === q.tokenOut);
        if (amountOut > out.availableOutflow) result.issues.push('MAKER_OUTFLOW_INSUFFICIENT');
        const input = rows.find((r) => TOKENS.find((t) => t.symbol === r.symbol).address === q.tokenIn);
        // Conservative fee buffer: allowance does not replenish when incoming tokens arrive.
        const protocolFeeBuffer = (amountIn * parameters.protocolFee + 10n ** 9n - 1n) / 10n ** 9n;
        if (input.availableOutflow < protocolFeeBuffer)
          result.issues.push('PROTOCOL_FEE_BUFFER_INSUFFICIENT');
        const tx = new sdk.SwapVMContract(new sdk.Address(C.swapVmRouter)).swap(q.args);
        try {
          const fillRaw = await rpc('eth_call', [
            { to: String(tx.to), data: String(tx.data), from: request.taker },
            s.tag,
          ]);
          const [fillIn, fillOut] = routerAbi.decodeFunctionResult('swap', fillRaw);
          check(fillIn === amountIn && fillOut === amountOut, 'QUOTE_FILL_MISMATCH');
          result.fillSimulation = { status: 'passed', amountIn: fillIn, amountOut: fillOut };
        } catch {
          result.fillSimulation = { status: 'failed', amountIn: null, amountOut: null };
          result.issues.push('FILL_SIMULATION_FAILED');
        }
      } catch {
        result.issues.push('QUOTE_UNAVAILABLE');
      }
    }
    await s.finish();
    const unclassifiedFailure =
      result.issues.includes('QUOTE_UNAVAILABLE') || result.issues.includes('FILL_SIMULATION_FAILED');
    const confirmedConstraint = result.issues.some(
      (x) => !['QUOTE_UNAVAILABLE', 'FILL_SIMULATION_FAILED'].includes(x),
    );
    result.status = confirmedConstraint ? 'insufficient' : unclassifiedFailure ? 'read_failed' : 'available';
  } catch (e) {
    const known = new Set([
      'STALE_BLOCK',
      'BLOCK_CHANGED',
      'CHAIN_MISMATCH',
      'DEPLOYMENT_MISMATCH',
      'WRAPPER_BINDING_MISMATCH',
      'UNDERLYING_MISMATCH',
      'DECIMALS_MISMATCH',
    ]);
    result.issues.push(known.has(e.message) ? e.message : 'PREFLIGHT_FAILED');
    result.status = e.message === 'STALE_BLOCK' || e.message === 'BLOCK_CHANGED' ? 'stale' : 'read_failed';
    // Incomplete/mixed evidence must not expose a usable quote.
    result.quote = null;
    result.fillSimulation = null;
  }
  return result;
}
