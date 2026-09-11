# Official source review

2026-09-11 · version 0.2.1 · local only

The implementation follows the officially supported [Path B](https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp): compose existing SwapVM instructions and ship a strategy to the shared router. The current pricing scope needs no new opcode or pricing contract. Ring adds FewToken conversion, bounded transaction plans and an atomic underlying-route recipe; it does not implement hosted discovery or a production resolver.

## Findings and correction

- Pin the deployment, not upstream main. SDKs 0.4.2/0.3.2 match the v1.0.2 deployment. Current SwapVM main has different paths and opcode dispatch. The [reference fixture](test/official-reference.json) records 12 immutable upstream source files and the deployed runtime opcode table, including its zero-based indexing.
- Version 0.2.0 put concentration before the protocol fee when both were configured. Version 0.2.1 follows the [official high-level builder](https://github.com/1inch/sdks/blob/364e7155167957e6a24320c7beb90539e06c91eb/typescript/swap-vm/src/swap-vm/strategies/aqua-xyc-amm-strategy.ts): protocol fee first. Prior fork fills for that combination passed, but byte-level comparison had missed it. The before-fix result is retained.
- **That combination's encoded strategy hash changes.** Close older positions using stored maker/hash/token identity; do not reconstruct an old hash with the new encoder. Legacy USDC/USDT encoding is unchanged. No published on-chain strategy was modified.
- Protocol fees are best-effort in the [deployed Fee implementation](https://github.com/1inch/swap-vm/blob/32c687c2b73101fc26549e48fa1ff8a4d73afbac/src/instructions/Fee.sol). A swap can emit `ProtocolFeeSkipped` and settle without paying the recipient. Preflight retains its fee-buffer constraint. Production accounting needs receipts and actual balances; configured rates are not received revenue.

## Local evidence

[Validation](VALIDATION.md) records **69 offline tests and 95 fork cases**, plus TypeScript, actual browser construction, minimum Node and fresh-install checks. New fork cases decode official Shipped/Pushed/Swapped/Docked events, reconstruct the order, compare the on-chain hash, reject partial docking and identity reuse, test caller ownership, and reproduce shared-allowance failures and skipped fees. Latest-block reads verify official deployment bindings and all nine assets separately from historical fork funding.

Registry ownership and immutable lifecycle checks follow the [Aqua source](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/src/Aqua.sol). Maker allowances target Aqua; taker input allowances target the router. Finite approvals, nonzero thresholds, deadlines, actual-output settlement and refund behavior remain intact.

No API key is needed for this SDK/source review or local fork. Hosted API credentials do not replace resolver eligibility or prove order routing; see the [official access model](https://business.1inch.com/portal/documentation/aqua/liquidity-layer/access-resolvers-and-pathfinder). No push, publication, external contact, real signature, mainnet transaction or production deployment occurred. Upstream licensing and attribution remain unchanged. Publication, production review and an actual ordinary-token frontend fill remain separate gates.
