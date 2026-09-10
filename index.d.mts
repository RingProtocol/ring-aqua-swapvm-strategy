import type { Address as SdkAddress, AquaProgramBuilder, Order, TakerTraits } from '@1inch/swap-vm-sdk';
import type { Interface } from 'ethers';

export type Address = `0x${string}`;
export type Integer = string | bigint;
export interface Asset {
  readonly chainId: 1;
  readonly asset: string;
  readonly symbol: string;
  readonly address: Address;
  readonly underlying: Address;
  readonly decimals: number;
}
export interface Token {
  address: Address;
  decimals: number;
  symbol?: string;
}
export interface Leg {
  token: Token;
  amount: Integer;
}
export interface MarketConfig {
  chainId: 1;
  maker: Address;
  /** Exactly two FewTokens, sorted by address, amounts in raw token units. */
  legs: [Leg, Leg];
  shape: 'straight_full_range' | 'curved_pegged';
  /** LP fee in parts per billion, not basis points. */
  feeRateE9: Integer;
  concentrate?: { rawPriceMin: Integer; rawPriceMax: Integer };
  /** Required for curved_pegged, 1e27 fixed point. */
  linearWidth?: Integer;
  protocolFee?: { feeRateE9: Integer; receiver: Address };
  expiry: Integer;
  salt: Integer;
}
export interface LegacyConfig {
  chainId: 1;
  maker: Address;
  fwUSDC: string;
  fwUSDT: string;
  amplification: string;
  feeBps: string;
  protocolFeeBps: string;
  protocolFeeReceiver: Address;
  expiry: string;
  salt: string;
}
export type Config = MarketConfig | LegacyConfig;
export interface BuildOptions {
  now?: bigint;
}
/** JSON-safe transaction call. Pass this object, not a whole plan, to a wallet. */
export interface TransactionCall {
  chainId: 1;
  from: Address;
  to: Address;
  data: Address;
  value: string;
  purpose?: string;
}
export interface Safety {
  unsigned: true;
  executionAllowed: false;
  productionReady: false;
  officialFrontendTraffic: 'unverified';
}
export interface LifecyclePlan {
  schema: 'ring.aqua-lifecycle.v1';
  kind: 'ship' | 'dock';
  chainId: 1;
  registryAddress: Address;
  appAddress: Address;
  maker: Address;
  strategyHash: Address;
  encodedOrder?: Address;
  to: Address;
  data: Address;
  value: string;
  transaction: TransactionCall;
  transactions: TransactionCall[];
  tokenAmounts?: (Token & { underlying: Address; amount: string; asset?: string; chainId?: 1 })[];
  tokens?: Address[];
  atomicRequired: false;
  safety: Safety;
}
export interface PositionIdentity {
  chainId: 1;
  maker: Address;
  strategyHash: Address;
  /** Use the original complete, sorted list from the Ship receipt. */
  tokens: [Address, Address];
}
type Pair =
  | { tokenIn: Address; tokenOut: Address; direction?: never }
  | { direction: 'USDC_USDT' | 'USDT_USDC'; tokenIn?: never; tokenOut?: never };
export type QuoteRequest = Pair & {
  exactIn: boolean;
  amount: Integer;
  threshold: Integer;
  deadline: Integer;
  taker: Address;
  receiver: Address;
};
export interface ConversionRequest {
  chainId: 1;
  maker: Address;
  asset: string;
  amount: string;
}
export interface ConversionPlan {
  schema: 'ring.fewtoken-conversion.v1';
  kind: 'wrap' | 'unwrap';
  chainId: 1;
  maker: Address;
  recipient: Address;
  asset: string;
  amount: string;
  underlying: Address;
  fewToken: Address;
  transactions: TransactionCall[];
  atomicRequired: false;
  safety: Safety;
}
export type RouteRequest = Pair & {
  chainId: 1;
  exactIn: boolean;
  amount: Integer;
  threshold: Integer;
  deadline: Integer;
  operator: Address;
  executor: Address;
  receiver: Address;
};
export interface RoutePlan {
  schema: 'ring.aqua-underlying-route.v1';
  chainId: 1;
  routerVersion: string;
  strategyHash: Address;
  maker: Address;
  operator: Address;
  executor: Address;
  receiver: Address;
  refundReceiver: Address;
  credential: Address;
  registryAddress: Address;
  appAddress: Address;
  tokenIn?: Address;
  tokenOut?: Address;
  direction?: 'USDC_USDT' | 'USDT_USDC';
  exactIn: boolean;
  amount: string;
  maxAmountIn: string;
  minAmountOut: string;
  deadline: string;
  originIn: Address;
  fewIn: Address;
  fewOut: Address;
  originOut: Address;
  quoteCall: TransactionCall;
  swapCall: { to: Address; data: Address; value: string; caller: Address };
  steps: Record<string, unknown>[];
  requirements: Record<string, true>;
  recipeHash: Address;
  atomicRequired: true;
  adapterStatus: 'requires-resolver-runtime-adapter';
  safety: Safety;
}
export interface BuiltStrategy {
  bundle: {
    schema: 'ring.aqua-swapvm-unsigned.v1';
    chainId: 1;
    routerVersion: string;
    config: Config;
    strategy: Address;
    strategyHash: Address;
    order: ReturnType<Order['build']>;
    tokenAmounts: (Token & { underlying: Address; amount: string })[];
    open: TransactionCall[];
    close: TransactionCall[];
    safety: Safety;
  };
  order: Order;
  builder: AquaProgramBuilder;
  parameters: {
    maker: Address;
    receiver?: Address;
    amounts: bigint[];
    width?: bigint;
    fee: bigint;
    protocolFee: bigint;
    expiry: bigint;
    salt: bigint;
  };
}
export const ASSETS: readonly Asset[];
export function getAsset(assetOrFewAddress: string): Asset;
export const fewAbi: Interface;
export function buildStrategy(config: Config, options?: BuildOptions): BuiltStrategy;
export function buildQuote(
  config: Config,
  request: QuoteRequest,
  options?: BuildOptions,
): BuiltStrategy & {
  tokenIn: Address;
  tokenOut: Address;
  traits: TakerTraits;
  args: { order: Order; tokenIn: SdkAddress; tokenOut: SdkAddress; amount: bigint; takerTraits: TakerTraits };
  transaction: { from: Address; to: Address; data: Address };
};
export function buildAquaShipPlan(config: Config, options?: BuildOptions): LifecyclePlan;
export function buildAquaDockPlan(config: Config | PositionIdentity): LifecyclePlan;
export function buildAquaQuoteCall(
  config: Config,
  request: QuoteRequest,
  options?: BuildOptions,
): TransactionCall;
export function buildAquaSwapCall(
  config: Config,
  request: QuoteRequest,
  options?: BuildOptions,
): TransactionCall;
export function buildMakerWrapPlan(input: ConversionRequest): ConversionPlan;
export function buildMakerUnwrapPlan(input: ConversionRequest): ConversionPlan;
export function buildUnderlyingRoute(
  config: Config,
  request: RouteRequest,
  options?: BuildOptions,
): RoutePlan;
export type ReadonlyRpc = (method: string, params?: unknown[]) => Promise<unknown>;
export function readonlyRpc(
  url: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): ReadonlyRpc;
export interface PreflightResult {
  schema: 'ring.aqua-preflight.v1';
  status: 'read_failed' | 'insufficient' | 'available' | 'stale';
  block: Record<string, unknown> | null;
  deploymentVerified: boolean;
  canonicalTokens: boolean;
  maker: Record<string, unknown>[] | null;
  quote: Record<string, unknown> | null;
  fillSimulation: { status: 'passed' | 'failed'; amountIn: bigint | null; amountOut: bigint | null } | null;
  issues: string[];
  executionAllowed: false;
  officialFrontendTraffic: 'unverified';
}
export function preflight(
  rpc: ReadonlyRpc,
  config: Config,
  options?: BuildOptions & {
    request?: QuoteRequest;
    block?: string;
    maxAgeSeconds?: number;
  },
): Promise<PreflightResult>;
