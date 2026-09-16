# Integration decisions

## 2026-09-16: distinguish native wrapping, FewToken conversion and on-chain permission

Michael requested explicit ETH, WETH, USDT and ordinary ERC-20 coverage. The previous SDK had WETH/FewToken conversion but no native ETH/WETH plan. Add independent `buildNativeWrapPlan` and `buildNativeUnwrapPlan` using canonical WETH deposit/withdraw, fixed caller recipient and explicit wei amounts. Preserve existing FewToken and strategy bytes; do not silently accept ETH as a market leg or reinterpret WETH as ETH. UNI is the standard ERC-20 regression; USDT must also pass with a preexisting nonzero allowance and its no-return approve behavior.

The nine-asset JSON catalog is an off-chain SDK restriction, not a global Aqua token policy. Verify on the fork that the registry accepts other ERC-20 allocations, while a token allowance alone cannot debit an unallocated token from a given maker/app/strategy. Keep maker-owned authorization and shutdown. No global whitelist administrator or new production contract is introduced.

Maker ETH/WETH preparation may be sequential; ordinary-user swaps must remain atomic within the resolver. Native funding/withdrawal/refund support for that production executor remains unimplemented. New native helpers must pass Node/portable, installed-package/type and real WETH fork balance/gas checks before handoff.

Michael authorized pushing the reviewed repository. Commit 2cff867 was pushed to `feat/aqua-integration-sdk`; this supersedes the earlier local-only push hold. Continue this correction on that branch. Main, public visibility, deployments, mainnet transactions and external contact remain unchanged.

## 2026-09-16: focus on FewToken wallet market making and code review

The selected scope is FewToken inventory held in a maker wallet, approved to Aqua and offered through a strategy. The goal is to make that liquidity usable by 1inch orders when the complete route is competitive, including ordinary-token orders that wrap and unwrap inside execution. This supersedes the earlier broader exploration; remove the alternative proposal and multi-option questionnaire from current repository and business materials.

The current cooperation request is to introduce the SDK and its local evidence, ask 1inch to review the implementation and identify the remaining development, and ask whether Ring should add an Aqua position page to its own frontend similar to the Barker example. Do not assume a page is required or already built. Defer new product work until that review clarifies the needed interfaces and cooperation model.

Keep the independent repository, official SDKs and existing-opcode Path B implementation. Preserve bounded approvals, local test evidence, license notices and the distinction between local validation and production routing. This cleanup changes documentation only; it neither publishes code nor enables funded execution.

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
