# Third-party notices

## Aqua and SwapVM

SwapVM — © Degensoft Ltd 2025.

Aqua — © Degensoft Ltd 2025.

| Dependency | Pinned version | Source | License |
| --- | --- | --- | --- |
| `@1inch/swap-vm-sdk` | 0.4.2 | [1inch/sdks, typescript/swap-vm](https://github.com/1inch/sdks/tree/master/typescript/swap-vm) | [SwapVM-1.1](LICENSES/LicenseRef-Degensoft-SwapVM-1.1.txt) |
| `@1inch/aqua-sdk` | 0.3.2 | [1inch/sdks, typescript/aqua](https://github.com/1inch/sdks/tree/master/typescript/aqua) | [Aqua-Source-1.1](LICENSES/LicenseRef-Degensoft-Aqua-Source-1.1.txt) |

The SDK packages are installed unmodified through npm. This repository does not vendor their implementation or the Aqua/SwapVM Solidity contracts. It does distribute generated calldata, instruction programs, and regression fixtures; these retain the applicable upstream notices and terms. The builder and reproduction instructions are included in this repository.

Ring additions, 2026-09-10: a bounded FewToken strategy builder using existing instructions, mandatory strategy expiry, integer fee encoding, read-only preflight checks, unsigned CLI output, offline tests, and a local fork execution harness. No custom opcode or production contract is added. Updated 2026-09-16: multiasset and native conversion plans, official SDK docking, a shared test executor and source-tree checks; the optional Uniswap diagnostic is removed.

## Other dependencies

The direct dependencies `ethers` 6.17.0, `prettier` 3.9.6, and `solc` 0.8.30 declare MIT licenses. Their copyright and license notices remain in the npm packages installed by `npm ci`. Transitive packages retain their own terms; this notice does not relicense them. `node_modules` and compiled dependency bundles are not distributed in this repository.

References to 1inch, Aqua and SwapVM identify compatibility and source material. They do not claim endorsement, certification, or production routing support.
