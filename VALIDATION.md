# Validation

2026-09-10. The standalone repository passed **34 offline tests and 27 Ethereum mainnet fork cases**. These tests establish local encoding and execution behavior, not 1inch frontend integration or production safety.

Powered by SwapVM — © Degensoft Ltd 2025. Powered by Aqua — © Degensoft Ltd 2025. [License scope](LICENSE.md).

## Reproduce and inspect

- Node.js 22.18.0; SwapVM SDK 0.4.2; Aqua SDK 0.3.2; test harness compiler solc 0.8.30.
- Pinned mainnet block: 25,926,940, hash `0x4eef63526f5f907c0d0e0ca8e7c133cde7fcbc89f272e161e467b4fc9737715a`.
- The fork reproduces historical state. Funding, authorization, deployments, and trades take place in subsequent **local** blocks, not on mainnet.
- Completed at `2026-09-10T03:18:15.426Z`. [Full report](evidence/fork-results.json) includes source SHA-256 hashes, lockfile SHA-256, the base block, and individual results. The hashes were checked against the exported files after this run.
- Companion artifacts: [unsigned fixture](evidence/unsigned-fixture.json), [preflight](evidence/preflight.json), and [wrapper quote vectors](evidence/wrapper-source-vectors.json). Fixture accounts, salts, and historical expiry values are not production parameters.

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Installed locked dependencies |
| `npm run format:check` | Passed |
| `npm test` | 34 passed, none skipped |
| `npm run test:fork` | 27 passed, no mainnet transactions |
| `npm audit --audit-level=high` | 0 reported vulnerabilities at validation time |

See [README.md](README.md#run-locally) for prerequisites. A clean fork run requires an archive RPC and Anvil; offline CI does not run this network-dependent suite. Local tests are not an external security audit, and an npm audit is not a contract audit.

## Coverage

| Area | Observed behavior |
| --- | --- |
| SDK encoding | Shared instruction bytes match the official high-level builder; mandatory expiry is added |
| Deployment compatibility | Pinned deployed AquaSwapVMRouter v1.0.2 quotes and settles the generated program |
| Swap modes | FewToken swaps and explicit wrap/swap/unwrap routes pass in both directions and both amount modes |
| Amounts | 1, 5, and 25-unit cases reconcile actual input/output balances |
| Maker accounting | Physical balances, virtual balances, protocol fee receipts, and cumulative allowances reconcile |
| Negative cases | Missing credential, wrong wrapper binding, insufficient physical inventory or allowance, excess output, expired orders, and one-wei tighter amount limits are rejected or detected |
| Shutdown | Docking and revocation disable the strategy without moving maker balances |
| RPC and CLI | Write RPC methods, malformed responses, changed/stale snapshots, and output-file overwrites are refused |

## Local output and gas

Fixture: 30 fwUSDC / 33 fwUSDT, amplification 300, maker fee 0.1 bps, protocol fee 0.025 bps. Each case restores the same local position snapshot. Input and output values below use token units, not raw integers.

| Full exact-input route | Input | Output | Local gas used |
| --- | --- | --- | --- |
| USDC → USDT | 1 | 1.099956 | 350,044 |
| USDT → USDC | 1 | 0.909057 | 348,179 |
| USDC → USDT | 5 | 5.499162 | 350,044 |
| USDC → USDT | 25 | 27.473611 | 350,083 |
| USDT → USDC | 5 | 4.544821 | 348,179 |
| USDT → USDC | 25 | 22.708861 | 348,217 |

These are the test executor's gas values, not total gas for an actual 1inch user order. The maker funds the favorable price through its inventory value change; the extra output is not protocol revenue. This run does not compare contemporaneous 1inch production quotes or establish a sustainable price advantage.

## Wrapper vectors

All nine canonical wrapper records passed binding, decimal, and PoolKey checks. 30 of 36 direction/mode vectors produced successful quotes at the fixed snapshot. Both USDC and USDT passed both directions and amount modes.

weETH, UNI, and wstETH unwrap vectors returned `read_failed` with null outputs. The report does not turn these into zero prices or attribute every failure to insufficient backing. These directions are outside the USDC/USDT route acceptance tested here and need separate redemption and execution checks.

## Still unverified

There is no external audit, funded mainnet position, production executor deployment, or real frontend fill in this evidence. Official source discovery, wrapper composition, Resolver adoption, and order selection remain separate integration requirements. Success means an ordinary-token order through the 1inch frontend selects the competitive complete route and actually settles; creating a position or obtaining a FewToken quote alone is insufficient.
