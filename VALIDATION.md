# Validation

## Documentation scope — 2026-09-16

Current materials focus on FewToken wallet market making, 1inch code review and whether Ring needs an Aqua frontend page. No runtime, configuration, type, test or dependency file changed. The [cleanup verification](evidence/scope-cleanup-2026-09-16.json) records the repeated offline and installed-package checks and matching historical fork source hashes. The mainnet fork was not rerun for this documentation change; all earlier evidence below retains its original date and package integrity.

## Current local 0.2.1 — packaged consumer review, 2026-09-11

The [repository follow-up](OFFICIAL_REVIEW.md) does not change strategy or settlement runtime code. It adds package boundaries, an executable example and consumer validation. The fresh [fork report](evidence/repository-review-2026-09-11/fork-results.json) completed at `2026-09-11T03:49:30.685Z`: **95 passed**, with all **34 source hashes** and the lockfile matching the reviewed files. The earlier reports below remain historical snapshots.

| Check | Result |
| --- | --- |
| Offline regression | [69 passed, none skipped](evidence/repository-review-2026-09-11/offline-tests.txt) |
| Installed tarball | [Passed on Node 22.18.0](evidence/repository-review-2026-09-11/package-node-22.18.txt) and [22.13.1](evidence/repository-review-2026-09-11/package-node-22.13.txt): isolated production-dependency install, actual public Node/portable exports, USDC/WETH example and external TypeScript consumer |
| Package contents | 33 files versus 82 before the allowlist; test contracts, historical evidence and local configuration excluded; source and license bytes compared with the installed files |
| Types, bundle and style | TypeScript and formatting passed; browser bundle built. Actual browser execution was not repeated because portable/runtime code is unchanged; the earlier browser evidence below is separate |
| Dependency audit | [Zero reported vulnerabilities](evidence/repository-review-2026-09-11/audit.json), not a security audit |
| Remote/publication | GitHub repository private, remote main at e94ae6a; current branch not pushed. CI configuration updated but not run remotely for this change |

The first draft example failed because a full catalog Asset includes fields rejected by the strict token schema. Both the executable example and compile-only type fixture now project address/decimals explicitly. No runtime validation was relaxed. No API key, wallet signature, mainnet write or contact was used. Production execution and official frontend traffic remain unverified.

## Earlier 0.2.1 — official source review, 2026-09-11, commit 97ef4ea

**All 69 offline tests and 95 mainnet fork cases passed**, including previous regressions. The final fork completed at `2026-09-11T03:26:22.842Z`. All 31 source hashes and the lockfile hash in the [new report](evidence/official-review-2026-09-11/fork-results.json) match the tested code. This is local validation, not publication or partner acceptance. See the [source review](OFFICIAL_REVIEW.md).

| Check | Current result |
| --- | --- |
| Offline tests | [69 passed, none skipped](evidence/official-review-2026-09-11/offline-tests.txt); adds deployed opcode mapping, combined protocol-fee ordering, official taker decoding and historical identity shutdown |
| Mainnet fork | [95 passed](evidence/official-review-2026-09-11/fork-results.json); adds seven official-event, immutable-identity, partial-dock, caller, shared-allowance and skipped-fee cases |
| Actual browser | [Passed](evidence/official-review-2026-09-11/browser.json); unsigned ship/dock/wrap construction, matching Node hash |
| Minimum Node version | [69 tests passed on 22.13.1](evidence/official-review-2026-09-11/node-22.13-tests.txt) |
| Fresh install and TypeScript | [Passed](evidence/official-review-2026-09-11/clean-install.json); locked install, offline tests, declarations and browser bundle |
| Formatting and dependencies | Formatting passed; `npm audit --audit-level=high` reported zero vulnerabilities, not a security audit |
| Latest-block read-only check | [Passed](evidence/official-review-2026-09-11/latest-deployment.json); three official deployments, router version and nine FewToken bindings/decimals |

Before the fix, four new conformance tests passed and two failed on the same combined instruction-order difference. The [failure summary](evidence/official-review-2026-09-11/conformance-before-fix.json) retains its base commit. All seven new offline cases now pass. Prior fork settlements for this combination had passed; the byte-order mismatch is not evidence of an observed failed trade.

The `ProtocolFeeSkipped` case proves a swap may succeed without fee receipt. Preflight keeps its conservative fee-buffer issue; account for actual received funds. No 1inch API key, mainnet transaction, real signature, production deployment, push or external contact was used. The latest-state read does not test redemption backing. Fork execution still uses the historical block and synthetic funding described below. Hosted discovery, resolver acceptance and real frontend traffic remain unverified.

## Historical version 0.2.0 — 2026-09-11, commit d4ec1c8

**All 62 offline tests and 88 mainnet fork cases passed at that version.** The fork completed at `2026-09-10T17:28:56.922Z` (September 11 in Asia/Shanghai). Its [report](evidence/standard-interface-2026-09-11/fork-results.json) binds 27 source hashes and the lockfile for that version. The sections below preserve historical evidence, not current source hashes or test counts.

| Check | Result and scope |
| --- | --- |
| Offline tests | [62 passed, none skipped](evidence/standard-interface-2026-09-11/offline-tests.txt); legacy compatibility, official instruction encoding, asset parameters, authorization and shutdown plans |
| Mainnet fork | [88 passed](evidence/standard-interface-2026-09-11/fork-results.json); 38 prior cases plus 50 multiasset cases |
| TypeScript | Consumer imports, typed builder calls and rejected input types passed |
| Actual browser | [Passed](evidence/standard-interface-2026-09-11/browser.json); official SDK construction of USDC/WETH ship, dock and WETH wrapping plans, with the same strategy hash as Node |
| Minimum Node version | [62 offline tests passed on 22.13.1](evidence/standard-interface-2026-09-11/node-22.13-tests.txt) |
| Fresh installation | [Passed](evidence/standard-interface-2026-09-11/clean-install.json); locked install, offline tests, consumer declarations and browser bundle |

The multiasset suite checks all nine canonical FewToken bindings and decimals, and executes nine wrap/unwrap roundtrips. Representative markets cover USDC/WETH, WBTC/USDT, DAI/USDC, cbBTC/WBTC, weETH/WETH, UNI/WETH and wstETH/WETH, plus two concentrated configurations. Each market runs both directions and amount modes, testing direct FewToken settlement and atomic underlying settlement, actual balances, refunds, preservation of preexisting tokens, allowance cleanup and shutdown after expiry. Additional cases verify one-sided concentrated preflight and execution, and atomic rollback for slippage, failed redemption and revoked maker approval.

Tests use the historical base block documented below with **synthetic local inventory and freshly wrapped assets**. They establish code-path behavior, not present mainnet redemption capacity, every possible pair, or a fix for the older v4 wrapper quote failures below. Native ETH is excluded; WETH is supported as ERC-20.

Browser validation constructs unsigned plans without a wallet or RPC. CI is configured for offline tests, declarations, browser building, formatting and dependency checks; this local change has not been pushed or run in GitHub CI. Actual partner acceptance, a production executor, security review and ordinary-token fills from the 1inch frontend remain unverified.

## Historical integration extension — 2026-09-11, commit cbe4970

That extension passed **45 offline tests and 38 fork cases**, including all baseline cases below. Formatting passed and `npm audit --audit-level=high` reported zero vulnerabilities. New cases executed the SDK's maker wrap/unwrap plans, four atomic resolver recipes, excess-input refunds, preservation of preexisting tokens, rollback after failed settlement/redemption, and shutdown after expiry. [Historical fork report](evidence/integration-2026-09-11/fork-results.json) and [offline output](evidence/integration-2026-09-11/offline-tests.txt) bind the source files for that version.

## Baseline — 2026-09-10, commit e94ae6a

At the baseline commit, the standalone repository passed **34 offline tests and 27 Ethereum mainnet fork cases**. The older evidence below is preserved for that commit; its hashes do not describe later source edits. These tests establish local encoding and execution behavior, not 1inch frontend integration or production safety.

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
