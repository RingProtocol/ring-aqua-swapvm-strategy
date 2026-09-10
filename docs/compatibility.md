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

## Official references and design choices

- [Build an AquaApp, Path B](https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp): use the least custom supported pricing path. Ring composes existing instructions and does not add an opcode or production contract.
- [Strategy Template](https://business.1inch.com/portal/documentation/aqua/getting-started/strategy-template): demonstrates a fork test plus SDK ship/quote/swap/dock. Use the intended deployment and installed SDK as the encoding reference, not unversioned example constants.
- [SwapVM SDK](https://github.com/1inch/sdks/tree/master/typescript/swap-vm): recommends `AquaProgramBuilder` for the deployed Aqua subset. [Aqua SDK](https://github.com/1inch/sdks/tree/master/typescript/aqua) owns ship/dock encoding; Ring does not maintain a separate dock encoder.

The scope is FewToken inventory in maker wallets, ideally created and managed in the official Aqua UI. Uniswap hook discovery and its quote diagnostic are outside this scope: FewToken conversion calls canonical wrappers directly. Preserve expiry, bounded approvals, caller-owned recipients, stored-identity shutdown and atomic ordinary-token settlement. Keep the Node/portable APIs and legacy encoding stable; local compatibility and production adoption remain separate.

[Barker's page](https://app.barker.money/protocols/1inch-aqua/raid) is a reference for the user flow, not a private API specification. Ring's schemas are not claimed as accepted 1inch/Barker interfaces. No Barker code is copied. Prefer the official lifecycle and SDK interfaces over copying partner-specific campaign logic.

Generated reports stay local in `artifacts/`; retain runnable tests and fixed regression inputs. The source-tree CI check fails CI when dated run paths or generated output are tracked. Revisit these choices when required pricing, assets, the intended deployment or the selected resolver interface changes; do not silently weaken the checks to match a new example.

## Review priorities

1. Check the pinned deployment, program encoding and maker lifecycle against the intended official environment.
2. Identify what the official Aqua UI needs to create/manage these FewToken positions and parameters.
3. Specify the missing discovery and resolver interfaces for ordinary-token wrapping, swap execution, actual-output unwrapping, refunds and outer-order authorization.

The test executor is not a production adapter. This repository does not claim production security, official frontend traffic or unrestricted commercial permission; see [security](../SECURITY.md) and [licenses](../LICENSE.md).
