# Integration decisions

## 2026-09-11: official contracts, application-compatible interfaces

Use the [official Aqua/SwapVM SDKs](https://github.com/1inch/sdks/tree/master/typescript/swap-vm) and existing deployed opcodes. The [Barker Aqua application](https://app.barker.money/protocols/1inch-aqua/raid) is a reference for the cooperation model and generic maker interfaces, not a backend dependency or a template for Ring's fees, rewards or token restrictions. Commercial terms and private partner implementation are outside the public evidence.

Keep Ring's purpose: provide FewToken inventory and compose ordinary-token orders through wrapping, Aqua settlement and unwrapping. The partner application owns its wallet/UI workflow; Ring supplies this SDK and the FewToken-specific integration. Actual source discovery and resolver execution remain joint integration work.

The initial stablecoin-only interface is superseded by an address/decimals/amount `legs` input, explicit official curve selection, standard transaction calls and typed interfaces. Preserve legacy input and encoded strategy bytes. The asset catalog is separate from optional Uniswap wrapper-hook metadata; an Aqua asset does not require a Uniswap hook.

Keep expiry, bounded approvals, explicit protocol fees, actual-output/refund accounting and atomic settlement. Do not remove these controls for superficial API similarity. Closing from a recorded position identity must not require a new price, unexpired configuration or membership in the new-position asset catalog.

Use the official ABI as the stable boundary. Do not claim private Barker API compatibility, partner endorsement, production security or real 1inch frontend traffic from local tests. Reassess the thin application adapter when the partner provides its versioned interface and selected resolver runtime. No production frontend or executor contract is introduced by this change.

Acceptance: regression bytes remain unchanged; official-program comparison, TypeScript consumer checks, browser plan generation and pinned-mainnet fork settlement pass. Fresh state, production authorization and an ordinary-token frontend fill are additional gates. See [VALIDATION.md](VALIDATION.md).
