# Integration decisions

## 2026-09-11: consumer readiness and work we can own

Keep the standalone SDK layout and deployed Path B implementation. Official `1inch/sdks-examples` supports using runnable consumer examples; `swap-vm-template` targets a different custom-contract workflow and is not a reason to copy a new ABI, deploy a router or migrate this package to a monorepo. Add a package allowlist, isolated tarball installation/export/type validation, an unsigned multi-asset example, and private vulnerability reporting guidance. Preserve full source evidence outside the consumer tarball. The initial example run exposed catalog metadata being passed to the strict token schema; project only allowed fields and make runnable examples part of acceptance instead of treating compile-only fixtures as runtime proof.

Barker's public [`barker-alm-engine`](https://github.com/barkermoney/barker-alm-engine/tree/7e208c9f2a8c60c51459122d1c6582d0aba4e0be) is a new yield-backed experiment, not the private source of its previous Aqua campaigns. Its quote/fill and deployment-version lessons are useful; do not copy its claim that Aqua custodies maker inventory, which contradicts official Aqua documentation and source. No Barker code is copied. Keep FewToken business logic and official allowance targets unchanged.

Ring can still build position/fee/inventory monitoring, full-route price and gas comparisons, wallet UI, and an execution adapter. Choose the actual resolver runtime and outer authorization interface before implementing a production adapter; do not promote local harnesses to production. A real maker position requires explicit wallet transactions but not prior maker KYC. Hosted discovery, qualified resolver execution and an ordinary-token frontend fill cannot be proved by offline packaging or fork tests. Classic Swap is not a substitute test for the documented resolver-gated Aqua route.

The GitHub repository was verified private during this review. Keep changes local; public visibility, push, npm publication, contact and funded trials are separate actions. The private vulnerability reporting endpoint returned 404, so a monitored private channel remains unverified and must be established before public release.

## 2026-09-11: verify against deployed source before publication

Keep the current work local until review and tests finish; do not push, publish or contact 1inch. Official Path B remains the selected architecture. Pin the v1.0.2 deployed Solidity tag separately from current upstream main, which has different paths and opcode dispatch. The reference fixture records immutable upstream commits and hashes.

Version 0.2.1 corrects the combined concentration/protocol-fee program order to match the official high-level SDK. Earlier fork fills passed; the missing comparison was byte-level conformance for this combination. The correction changes this combination's hash, so stored identity remains the upgrade-safe closing input. Legacy stablecoin bytes remain unchanged.

Add official-event reconstruction, immutable identity, caller ownership, shared allowance and best-effort fee cases. A successful swap does not prove protocol fee receipt: observe `ProtocolFeeSkipped` and actual balances. No production fee monitor or executor is added. API credentials are unnecessary for this SDK/contract review and local fork; hosted discovery and frontend acceptance remain separate work.

## 2026-09-11: official contracts, application-compatible interfaces

Use the [official Aqua/SwapVM SDKs](https://github.com/1inch/sdks/tree/master/typescript/swap-vm) and existing deployed opcodes. The [Barker Aqua application](https://app.barker.money/protocols/1inch-aqua/raid) is a reference for the cooperation model and generic maker interfaces, not a backend dependency or a template for Ring's fees, rewards or token restrictions. Commercial terms and private partner implementation are outside the public evidence.

Keep Ring's purpose: provide FewToken inventory and compose ordinary-token orders through wrapping, Aqua settlement and unwrapping. The partner application owns its wallet/UI workflow; Ring supplies this SDK and the FewToken-specific integration. Actual source discovery and resolver execution remain joint integration work.

The initial stablecoin-only interface is superseded by an address/decimals/amount `legs` input, explicit official curve selection, standard transaction calls and typed interfaces. Preserve legacy input and encoded strategy bytes. The asset catalog is separate from optional Uniswap wrapper-hook metadata; an Aqua asset does not require a Uniswap hook.

Keep expiry, bounded approvals, explicit protocol fees, actual-output/refund accounting and atomic settlement. Do not remove these controls for superficial API similarity. Closing from a recorded position identity must not require a new price, unexpired configuration or membership in the new-position asset catalog.

Use the official ABI as the stable boundary. Do not claim private Barker API compatibility, partner endorsement, production security or real 1inch frontend traffic from local tests. Reassess the thin application adapter when the partner provides its versioned interface and selected resolver runtime. No production frontend or executor contract is introduced by this change.

Acceptance: regression bytes remain unchanged; official-program comparison, TypeScript consumer checks, browser plan generation and pinned-mainnet fork settlement pass. Fresh state, production authorization and an ordinary-token frontend fill are additional gates. See [VALIDATION.md](VALIDATION.md).
