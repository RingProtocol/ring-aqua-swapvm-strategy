# Integration API

This SDK supplies unsigned maker transactions and resolver execution recipes for nine canonical Ethereum FewTokens (USDC, USDT, DAI, WETH, WBTC, cbBTC, weETH, UNI and wstETH underlyings). It uses the official Aqua/SwapVM deployment. It does not add a production contract or submit transactions.

The API and schemas below are Ring-defined wrappers around official contract calls; see [compatibility](compatibility.md).

Powered by SwapVM — © Degensoft Ltd 2025. Powered by Aqua — © Degensoft Ltd 2025. [License scope](../LICENSE.md).

## Entry points

Native conversion and on-chain permission details follow the entry-point table.

```js
import {
  buildAquaShipPlan, buildAquaDockPlan, buildAquaQuoteCall, buildAquaSwapCall, getAsset,
  buildMakerWrapPlan, buildMakerUnwrapPlan, buildUnderlyingRoute,
  buildNativeWrapPlan, buildNativeUnwrapPlan,
} from '@ring-protocol/aqua-swapvm-strategy';
```

| Function | Input | Result |
| --- | --- | --- |
| `getAsset(nameOrFewAddress)` / `ASSETS` | Catalog key or FewToken address | Immutable address, underlying, symbol and decimals |
| `buildAquaShipPlan(config, {now}?)` | Generic market config below, or legacy USDC/USDT config | `strategyHash`, `encodedOrder`, `to/data/value`, `transaction` and five ordered approval/ship calls |
| `buildAquaDockPlan(identityOrConfig)` | Stored `{chainId, maker, strategyHash, tokens}` or original config | Dock call plus two allowance revocations; closing needs no new price or future expiry |
| `buildAquaQuoteCall` / `buildAquaSwapCall` | Config and bounded address-based quote request | Plain `{chainId, from, to, data, value}` for the official router |
| `buildMakerWrapPlan` / `buildMakerUnwrapPlan` | `{chainId: 1, maker, asset, amount}` | Exact conversion calls; wrap resets, limits and clears approval; recipient is always maker |
| `buildNativeWrapPlan` / `buildNativeUnwrapPlan` | `{chainId: 1, maker, amount}` | ETH/WETH only: canonical WETH `deposit()` with exact wei value, or `withdraw(amount)` with zero value; no ERC-20 approval |
| `buildUnderlyingRoute` | Config and bounded resolver request | Atomic execution recipe, actual-output/refund bindings and required runtime checks |

## Native conversion and token permissions

Wrapping has two distinct layers: `ETH <-> WETH <-> fwWETH`. `buildNativeWrapPlan({chainId: 1, maker, amount})` calls canonical WETH `deposit()` with `value=amount`; `buildNativeUnwrapPlan` calls `withdraw(amount)` with zero value. Amount is a positive integer string in wei, below 2^96. Both return one unsigned transaction with the caller as recipient, fixed WETH target and no approval. WETH9 returns ETH to its caller; contract wallets must verify their receiving behavior. See [WETH9](https://github.com/gnosis/canonical-weth/blob/master/contracts/WETH9.sol).

The existing `buildMakerWrapPlan({chainId: 1, maker, asset: 'WETH', amount})` and its unwrap counterpart handle **WETH/fwWETH only**. USDT uses its canonical FewToken with zero-reset, bounded approval and final allowance cleanup; standard ERC-20 coverage includes UNI. Native ETH remains invalid as a FewToken catalog key or market leg.

Maker preparation can run native-wrap, FewToken-wrap and ship sequentially after confirmed receipts. Exit uses dock/revoke, a fresh FewToken balance and redemption check, FewToken-unwrap, then optional native-unwrap. Leave ETH for gas. A failed step does not undo earlier confirmed transactions; inspect and revoke remaining approvals. These are maker wallet operations, not atomic user swaps. `buildUnderlyingRoute` still accepts ERC-20 boundaries; a resolver must separately integrate native funding, dynamic WETH withdrawal/refunds and native-dust protection in its atomic executor. No production native-order executor is provided.

There is **no Ring on-chain global token allowlist or addToken/removeToken administrator**. `config/assets.json` is an SDK support catalog maintained through repository review and releases; it is not read by Aqua and cannot revoke live positions. Other developers can fork it or call Aqua directly for their own wallets. New entries require binding, decimals and behavior checks, not merely a symbol edit.

On-chain control belongs to the maker: bounded token approvals plus `ship` allocations scoped to `(maker, app, strategyHash, token)`. An ERC-20 allowance alone cannot authorize a debit from an unallocated token in that strategy. Closing uses the original position identity even after catalog removal; a catalog edit does not close or change a live position. Official discovery and route adoption are another layer. Enforcing a global policy for a future Ring app would require an explicitly reviewed on-chain design; this SDK does not claim that policy exists. See [Aqua.sol](https://github.com/1inch/aqua/blob/main/src/Aqua.sol) and [strategy lifecycle](https://business.1inch.com/portal/documentation/aqua/liquidity-layer/strategy-lifecycle).

## Market configuration

Declarations ship in `index.d.mts` and `portable.d.mts`. The generic input follows the public Barker builder's `legs`, `shape`, `feeRateE9` and raw price fields. The contract ABI and byte encoding use the official SDKs. Ring keeps its mandatory expiry, optional protocol fee and bounded approval orchestration. JSON outputs use string `value` and amounts; Barker's in-browser value may be bigint. This is interface alignment, not a claim of identical private API contracts or byte-identical programs after adding expiry.

```js
const usdc = getAsset('USDC'), weth = getAsset('WETH');
const now = BigInt(Math.floor(Date.now() / 1000));
const config = {
  chainId: 1,
  maker: makerAddress,
  legs: [
    { token: { address: usdc.address, decimals: usdc.decimals }, amount: '300000000' },
    { token: { address: weth.address, decimals: weth.decimals }, amount: '100000000000000000' },
  ],
  shape: 'straight_full_range',
  feeRateE9: '10000', // 0.1 bps, explicit test fee, not a recommendation
  expiry: String(now + 3600n),
  salt: uniqueNonzeroUint64,
};
const plan = buildAquaShipPlan(config);
// Review/send plan.transactions in order through the host wallet workflow.
// plan.transaction is only the final ship call; it does not perform approvals.
```

This is synthetic test inventory, not market pricing or a capital recommendation. Sort two distinct FewToken `legs` by ascending address, moving amounts with their tokens. Unknown addresses, mismatched decimals/symbols, native ETH market legs, target overrides, floats and ambiguous directions are rejected. All catalog entries are ERC-20 underlyings; use the separate native conversion API for ETH/WETH.

| Parameter | Meaning and bounds |
| --- | --- |
| `legs[].amount` | Raw integer string or bigint, below 2^96; no human-unit conversion |
| `shape: straight_full_range` | Official constant product; both reserves positive |
| `concentrate: {rawPriceMin, rawPriceMax}` | Optional with straight shape; 0 < min < max < 2^128; uses official concentrated-liquidity encoding; at least one reserve positive |
| `shape: curved_pegged`, `linearWidth` | Official pegged curve with explicit 1e27 width, positive and at most 5000 × 1e27; both reserves positive |
| `feeRateE9` | LP fee as raw integer parts per billion; fee plus protocol fee < 1e9 |
| `protocolFee: {feeRateE9, receiver}` | Optional Ring protocol fee; never copied from another project's business config |
| `expiry`, `salt` | Future uint40 Unix timestamp; nonzero uint64 salt for generic configs |

`rawPriceMin/Max` encode **raw tokenGt units / raw tokenLt units × 1e18**, including decimals. Never substitute a human USD price without conversion. A partner market enum `straight_concentrated` must be mapped to `straight_full_range` plus explicit `concentrate`; it is not a builder enum. The SDK does not infer pricing from token symbols or assert a stable peg.

Quote/route `amount`, `threshold`, `deadline` accept raw integer strings or bigint. Conversion `amount` remains a positive raw integer string below 2^96. Outputs are JSON serializable. The legacy config and `USDC_USDT`/`USDT_USDC` directions remain supported with their old units and uint256 salt, and a frozen program/hash regression test. Do not mix legacy human-unit config fields with generic raw units.

Plans retain `executionAllowed=false` and `productionReady=false`. Plain quote/swap calls contain no authorization; creating calldata neither signs nor sends it. Assets in the local catalog are not a 1inch listing or proof of live redemption backing. Market enablement, fresh read-only preflight and actual resolver execution are separate checks; this package does not call Barker's campaign APIs.

Version 0.2.1 places the protocol fee before concentration, matching the official high-level builder. **Only configurations combining concentration and a nonzero protocol fee change encoded strategy bytes/hash relative to 0.2.0.** Close existing positions from their stored `{chainId, maker, strategyHash, tokens}` identity; do not rebuild an older identity with the changed encoder. Legacy USDC/USDT encoding is unchanged.

The deployed v1.0.2 Aqua protocol fee is best-effort: an unpaid fee can emit `ProtocolFeeSkipped` while the swap succeeds, leaving that fee with the maker. Preflight retains the conservative `PROTOCOL_FEE_BUFFER_INSUFFICIENT` issue. Integrators must reconcile actual receipts and this event rather than count configured fees as received revenue. This package has no continuous revenue monitor. See the [official Fee implementation](https://github.com/1inch/swap-vm/blob/32c687c2b73101fc26549e48fa1ff8a4d73afbac/src/instructions/Fee.sol) and the [local reference review](compatibility.md).

## Maker lifecycle

1. Read the maker's actual balances. Decide explicitly how much underlying to convert; the SDK does not silently wrap the entire wallet or assume existing inventory is zero.
2. Generate and review wrap plans if needed, then confirm the FewToken balances.
3. Generate the ship plan, recheck deployment/state and execute through the application's existing wallet workflow.
4. To stop, generate the dock plan from the stored identity (or unchanged original configuration) and clear both Aqua allowances. If docking has already happened, execute only the revocations after checking current state.
5. Read fresh FewToken balances and immediate redemption availability, then generate explicit unwrap amounts. Original deposit amounts need not equal current balances after trading.

These wallet operations may use separate transactions. Wrap failure after a successful approval can leave that approval outstanding: show recovery and offer the final revocation separately. Unwrap cannot be assumed executable just because it encodes successfully. A dedicated maker wallet avoids disrupting allowances shared by other strategies. Retain the original configuration; changing its salt, fees, inventory or expiry changes the strategy identity.

## Portable core without a frontend

The `portable` entry has no Node filesystem, process, wallet or signer dependency of its own. The host supplies its official SDK instances, preserving SDK class identity:

```js
import { createRingAquaIntegration } from '@ring-protocol/aqua-swapvm-strategy/portable';

const kit = createRingAquaIntegration({ swapVmSdk, aquaSdk });
const plan = kit.buildAquaShipPlan(config);
```

Use SwapVM SDK **0.4.2** and Aqua SDK **0.3.2** with the pinned router v1.0.2. The browser smoke builds the actual official SDKs with esbuild, an `assert` polyfill and a `process/browser.js` shim; see `test/browser-build.mjs`. Node/portable equivalence and real browser generation of ship/dock/wrap plans are tested. Host applications still need equivalent bundler configuration and their own wallet/transaction UI tests; no production frontend is included. The default Node entry retains the CJS-loading workaround for upstream extensionless ESM imports.

## Resolver route request

```js
const recipe = buildUnderlyingRoute(config, {
  chainId: 1,
  tokenIn: usdc.address,
  tokenOut: weth.address, // FewToken addresses; underlying is resolved from the catalog
  exactIn: true,
  amount: amountInRaw,
  threshold: minimumOutputRaw,
  operator: eligibleResolverEOA,
  executor: resolverExecutionContract,
  receiver: settlementReceiver,
  deadline: deadlineUnixSeconds,
});
```

For exact output, `amount` is the desired output and `threshold` is the maximum input. The deadline must be in the future and no later than the maker strategy expiry. Receiver selection and the user's authorization belong to the resolver's outer order settlement; this SDK does not authorize pulling funds from an arbitrary user.

The output is an **execution recipe, not a directly broadcastable transaction**. `quoteCall` can be used for a read-only quote from the eligible operator. `swapCall` is the inner call from the executor, with its FewToken output bound to that executor. Quoting does not prove execution or backing availability.

The resolver's runtime must perform these operations within **one atomic EVM transaction**:

1. Obtain the bounded input budget from resolver-authorized inventory and record preexisting balances.
2. Wrap the input budget into the canonical FewToken and grant the exact temporary router allowance.
3. Call the official SwapVM router; enforce deadline, direction, input/output limits and token deltas.
4. Unwrap the **actual returned output**, delivering underlying to the bound receiver.
5. For exact output, unwrap the unspent input budget and return it to the operator. Existing dust must not be swept as part of the refund.
6. Clear temporary allowances and reconcile all final balances with the outer order's requirements.

The output/refund `steps` intentionally contain runtime references to `swap.amountOut` and `maxAmountIn - swap.amountIn`. Do not substitute old quote amounts, treat these as static calldata, or ask a user to sign the three stages separately. If the existing resolver cannot bind return values and enforce these checks, an adapter to that runtime is still required. `adapterStatus` explicitly reports this requirement.

`recipeHash` identifies the exact generated recipe; it is not a signature, admission decision or on-chain authorization. The runtime must bind the recipe to its own approved deployment and order. `test/RecipeHarness.sol` demonstrates interpretation only on a disposable local fork. It does not contain the complete production authorization, route validation or deployment controls and must not serve user orders.

## Local commands and checks

```sh
node cli.mjs ship maker-config.local.json new-ship.local.json
node cli.mjs dock original-maker-config.local.json new-dock.local.json
node cli.mjs wrap conversion-input.local.json new-wrap.local.json
node cli.mjs unwrap conversion-input.local.json new-unwrap.local.json
# Route input is {"strategy": <maker config>, "route": <request above>}
node cli.mjs route route-input.local.json new-route.local.json
```

These commands require neither a key nor an RPC and refuse to overwrite files. They fail on unsupported assets/chains, extra fields, zero amounts, bad addresses or unsafe limits. `preflight` remains available for read-only strategy checks. Do not interpret its direct FewToken swap simulation as a full underlying-token order simulation.

For the extended mainnet fork suite, load the archive RPC through a local secret manager and run:

```sh
RING_FORK_EVIDENCE_DIR=artifacts/local-rerun npm run test:fork
```

Fork deployments, impersonation, funding and transactions stay on the runner's loopback Anvil. Reports are local build output and are not committed. The suite executes nine asset conversions and representative stable, volatile, 6/8/18-decimal and concentrated markets in both directions/modes, alongside the legacy regression cases. It checks actual refunds, preexisting token preservation and complete rollback after failed settlement or redemption. It does not assert every possible catalog pair has been individually tested.
