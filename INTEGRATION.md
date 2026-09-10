# Integration API

This SDK supplies unsigned maker transactions and a resolver execution recipe for canonical Ethereum fwUSDC/fwUSDT. It uses the official Aqua/SwapVM deployment. It does not add a production contract or submit transactions.

The public [Barker frontend](https://app.barker.money/protocols/1inch-aqua/raid) provides a reference for constructing `ship`/`dock` plans around official contracts. The API and schemas below are Ring-defined. They are not a claim that Barker or 1inch has accepted the interface or enabled FewToken routing.

Powered by SwapVM — © Degensoft Ltd 2025. Powered by Aqua — © Degensoft Ltd 2025. [License scope](LICENSE.md).

## Entry points

```js
import {
  buildAquaShipPlan, buildAquaDockPlan,
  buildMakerWrapPlan, buildMakerUnwrapPlan, buildUnderlyingRoute,
} from '@ring-protocol/aqua-swapvm-strategy';
```

| Function | Input | Result |
| --- | --- | --- |
| `buildAquaShipPlan(config, {now}?)` | Existing maker configuration from the README | Strategy identity and five ordered approval/ship transactions |
| `buildAquaDockPlan(config)` | The original, unchanged configuration | Original identity and three dock/revoke transactions; works after strategy expiry |
| `buildMakerWrapPlan(input)` | `{chainId: 1, maker, asset: 'USDC' \| 'USDT', amount}` | Reset allowance, approve exact amount, `wrapTo(amount, maker)`, clear temporary allowance |
| `buildMakerUnwrapPlan(input)` | Same shape, amount in FewToken raw units | `unwrapTo(amount, maker)`; no extra approval is needed to burn the caller's FewTokens |
| `buildUnderlyingRoute(config, request, {now}?)` | Maker config plus the resolver request below | Official quote and swap calldata, atomic execution steps, amount bindings and required runtime checks |

`now` is a bigint Unix timestamp for reproducible tests; it defaults to current time. All amounts in conversion/route requests are positive **raw integer strings**, with six decimals and values below 2^96. This differs from the maker configuration's human-readable `fwUSDC` / `fwUSDT` amounts. For example, conversion amount `"1250001"` means 1.250001 USDC. Do not pass JavaScript floating-point numbers.

Transaction fields are `chainId`, `from`, `to`, `data`, `value: "0"` and `purpose`. Results are JSON serializable. `safety.executionAllowed` and `safety.productionReady` remain false; the SDK never provides authorization to sign or broadcast.

## Maker lifecycle

1. Read the maker's actual balances. Decide explicitly how much underlying to convert; the SDK does not silently wrap the entire wallet or assume existing inventory is zero.
2. Generate and review wrap plans if needed, then confirm the FewToken balances.
3. Generate the ship plan, recheck deployment/state and execute through the application's existing wallet workflow.
4. To stop, generate the dock plan from the original configuration and clear both Aqua allowances. If docking has already happened, execute only the revocations after checking current state.
5. Read fresh FewToken balances and immediate redemption availability, then generate explicit unwrap amounts. Original deposit amounts need not equal current balances after trading.

These wallet operations may use separate transactions. Wrap failure after a successful approval can leave that approval outstanding: show recovery and offer the final revocation separately. Unwrap cannot be assumed executable just because it encodes successfully. A dedicated maker wallet avoids disrupting allowances shared by other strategies. Retain the original configuration; changing its salt, fees, inventory or expiry changes the strategy identity.

## Portable core without a frontend

The `portable` entry has no Node filesystem, process, wallet or signer dependency of its own. The host supplies its official SDK instances, preserving SDK class identity:

```js
import { createRingAquaIntegration } from '@ring-protocol/aqua-swapvm-strategy/portable';

const kit = createRingAquaIntegration({ swapVmSdk, aquaSdk });
const plan = kit.buildAquaShipPlan(config);
```

Use SwapVM SDK **0.4.2** and Aqua SDK **0.3.2** with the pinned router v1.0.2. Host bundler integration of the upstream SDKs is still required. Node/portable output equivalence is tested; this change does not supply or validate a production browser application. The default Node entry retains the CJS-loading workaround for upstream extensionless ESM imports.

## Resolver route request

```js
const recipe = buildUnderlyingRoute(config, {
  chainId: 1,
  direction: 'USDC_USDT', // or USDT_USDC
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
RING_FORK_EVIDENCE_DIR=evidence/integration-2026-09-11 npm run test:fork
```

Fork deployments, impersonation, funding and transactions stay on the runner's loopback Anvil. The new output directory preserves the original evidence. The suite executes SDK maker plans and all four direction/amount-mode recipes, including excess-input refunds, preexisting token preservation and complete rollback after a failed swap or redemption.

## Remaining joint integration work

Ring can implement an adapter for the partner's exposed runtime once the interface is provided. The partner handoff needs concrete answers to:

- Which component consumes the strategy and wrapper metadata: a frontend, source discovery service or resolver? What is its schema and code-review entry point?
- Which eligible resolver will interpret the atomic recipe, enforce the outer order and sign the transaction? Does its runtime support actual-output and refund bindings?
- Which 1inch user-facing swap mode is the pilot using, and how will we observe an ordinary USDC/USDT order selecting and settling the competitive full route?

An official reference to a cooperation model is not evidence that the technical integration has already been accepted. Local success, a live strategy, source listing, resolver adoption and a real frontend fill remain separate results.
