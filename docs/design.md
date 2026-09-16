# Design decisions

## FewToken inventory in maker wallets

The scope is FewToken inventory offered through Aqua under maker-owned approvals and position allocations. The preferred creation and management surface is the official Aqua UI. Ring supplies integration code and can add a page if the official workflow needs it; an independent frontend is not a prerequisite.

## Existing instructions and independent package

Use official Aqua/SwapVM SDKs and the pinned deployed router. Existing constant-product, concentrated and pegged pricing cover the current scope, so no custom opcode, pricing contract or protocol fork is introduced. Keep the Node and portable public entry points stable. Reconsider this choice only if a required pricing or execution interface cannot be expressed safely with the intended official deployment.

## Authorization and atomic execution

Keep expiry, bounded approval/reset plans, caller-owned recipients and shutdown from stored position identity. The asset catalog is an SDK restriction, not a global on-chain permission system. Native maker conversion is explicitly ETH/WETH; FewToken conversion remains WETH/fwWETH. Ordinary-user wrapping, swap and unwrapping must be atomic inside the chosen resolver runtime with actual-output and refund checks.

## Source review and generated results

The public tree contains runtime code, config, examples, executable tests and stable regression inputs. Keep generated reports in ignored `artifacts/`, and internal planning/history outside the repository. Test reports include timestamps, source hashes and the fork block to identify what was tested; repeatedly committing those reports is not part of the SDK interface. Keep upstream notices and source/fixture provenance.

Local validation, official interface acceptance and a real frontend fill are separate results. Changes to the official deployment, selected runtime or supported asset behavior require a new compatibility review; they must not silently relax authorization or settlement checks.
