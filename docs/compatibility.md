# Compatibility with Aqua and SwapVM

[README](../README.md) · [API](integration.md) · [Tests](testing.md)

Ring implements the documented **Path B**: build a program from existing SwapVM instructions and register it through Aqua. Compatibility checks are performed by Ring; they are not an official review or certification.

## Version boundary

| Component | Pinned reference | Local check |
| --- | --- | --- |
| SwapVM SDK | `@1inch/swap-vm-sdk` 0.4.2 | Official high-level builder bytes, taker encoding and addresses |
| Aqua SDK | `@1inch/aqua-sdk` 0.3.2 | Ship/dock encoding and event reconstruction |
| Router | AquaSwapVMRouter v1.0.2 | Code hash, quote/swap execution and runtime opcode table |
| Solidity source | [`1inch/swap-vm` at 32c687c](https://github.com/1inch/swap-vm/tree/32c687c2b73101fc26549e48fa1ff8a4d73afbac) | Fixed source references in `test/official-reference.json` |
| FewToken | Canonical Ethereum FewFactory bindings | Underlying, decimals, conversion and settlement cases |

Addresses and the fork block are in [deployment.json](../config/deployment.json). The [source reference](../test/official-reference.json) records immutable commits and hashes. Upstream `main` is not the deployment specification: opcode numbers and ABI can change. Updating a dependency requires encoding and fork checks against its intended deployment, not just a successful npm installation.

Ring keeps the deployed `tx.origin` credential check, adds a mandatory expiry and bounded approvals, and compares the shared instruction sequence with the official high-level builders. These additions are intentional; Ring's complete program need not be byte-identical to an example that omits expiry.

Since 0.2.1, the protocol fee instruction precedes concentration, matching the official builder. This changes the hash for older configurations combining concentration and a nonzero protocol fee. Close such positions using their stored identity, never by rebuilding old parameters with a new encoder. The [legacy fixtures](../test/fixtures/README.md) retain this regression. A successful swap can emit `ProtocolFeeSkipped`; integrators must check actual fee receipts.

## Reference projects

- [Official AquaApp guide](https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp): documents the existing-opcode approach and the SDK/router version dependency.
- [Official SwapVM template](https://github.com/1inch/swap-vm-template): useful for executable tests, examples and license notices. It includes a contract/deployment workflow; copying its directory tree or current ABI is not required for this unsigned SDK.
- [Official SDK examples](https://github.com/1inch/sdks-examples): a reference for runnable consumer examples, not an Aqua-specific admission standard.
- [Barker Aqua page](https://app.barker.money/protocols/1inch-aqua/raid): a reference for the partner-facing user flow. Its public [ALM experiment](https://github.com/barkermoney/barker-alm-engine/tree/7e208c9f2a8c60c51459122d1c6582d0aba4e0be) is not the earlier campaign's private implementation. No Barker code is copied and private API compatibility is not claimed.

These sources do not establish approval of this repository. The integration schemas are Ring-defined wrappers around official contract calls. Official token selection, discovery and resolver adoption still require 1inch review and live verification. A competitive local quote does not prove that the official execution system knows how to compose the route.

## Review priorities

1. Check the pinned deployment, program encoding and maker lifecycle against the intended official environment.
2. Identify what the official Aqua UI needs to create/manage these FewToken positions and parameters.
3. Specify the missing discovery and resolver interfaces for ordinary-token wrapping, swap execution, actual-output unwrapping, refunds and outer-order authorization.

Test executors are not production adapters. This repository does not claim production security, official frontend traffic or unrestricted commercial permission; see [security](../SECURITY.md) and [licenses](../LICENSE.md).
