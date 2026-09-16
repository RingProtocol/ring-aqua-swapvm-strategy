# Testing

[README](../README.md) · [中文](../README.zh.md#测试和源码检查) · [Compatibility](compatibility.md)

The suite checks the unsigned SDK and settlement on a disposable Ethereum mainnet fork. It does not submit mainnet transactions. Current coverage is 73 offline tests and 102 fork cases; rerun them for the exact commit under review.

## Commands

Requires Node.js 22.13.1 or newer.

```sh
npm ci --ignore-scripts
npm run check:repo
npm run format:check
npm test
npm run test:types
npm run build:browser-smoke
npm run test:package
npm audit --audit-level=high

# Also requires anvil on PATH and an archive RPC in ETH_RPC_URL (or RPC_URL).
npm run test:fork
```

Load credentials through a local secret manager. The CLI does not load .env files automatically. Never commit credentials or run logs containing private endpoints.

| Check | What it covers |
| --- | --- |
| Offline | Input validation, bounded approvals, expiry, shutdown, native conversion, public-entry equivalence, legacy bytes and comparison with official SDK builders |
| TypeScript | Public declarations and external consumer compilation |
| Browser bundle | Portable entry and required dependency shims; bundling alone does not prove browser wallet compatibility |
| Installed package | Isolated tarball installation, public exports, executable example, source/license contents and exclusion of test/output files |
| Fork | Direct FewToken and atomic underlying settlement, both directions and exact-input/output modes; actual balances, refunds, rollback and authorization |
| Dependency audit | Known registry advisories at run time; not a security audit |

CI rejects generated/dated run paths and broken local Markdown links, and runs formatting, offline/type/package checks, browser bundling and dependency audit on pull requests and main. It has no RPC credentials and does not run the fork suite. Consult the actual PR checks for their result.

## Fork coverage and isolation

The runner launches its own Anvil at `127.0.0.1:18569` and refuses an occupied port. The upstream RPC only supplies chain data. Impersonation, synthetic funding, approvals, test contract deployment and swaps stay on that local node; no real private key is required.

The fixed block is **25,926,940**, with its canonical hash in [deployment.json](../config/deployment.json). This gives reproducible contract behavior, not current mainnet inventory or prices.

Coverage includes:

- Nine canonical FewToken bindings and conversion roundtrips, with 6/8/18 decimal assets.
- Representative stable, volatile and concentrated markets in both directions and amount modes.
- Native ETH/WETH roundtrips, ETH/WETH/fwWETH composition, insufficient funding, and WETH, USDT and ordinary ERC-20 UNI conversion. ETH principal is checked separately from gas; USDT's nonzero allowance reset and no-return approval behavior are exercised.
- Expiry, immutable position identity, shared wallet allowances, caller ownership, registry token allocations and skipped protocol fees.
- Atomic ordinary-token routes, actual-output/refund accounting, preservation of preexisting tokens, and rollback on failed settlement or redemption.

The suite does not individually test every possible token pair. The test executor does not implement complete production user-order authorization.

## Reports and regression fixtures

Generated reports go to ignored `artifacts/fork/`. An optional relative directory can preserve another local run:

```sh
RING_FORK_EVIDENCE_DIR=artifacts/local-rerun npm run test:fork
```

A completed `fork-results.json` records the block, source and lockfile hashes, cases and timestamps. A failed attempt writes `fork-attempt.json` without replacing the previous completed report. Compare completion time and hashes before citing a report; companion files may have been written by a later failed attempt.

Stable legacy inputs live in [test/fixtures](../test/fixtures/README.md) and are independent of generated reports. Preserve them when cleaning local output. Share generated reports separately when a reviewer requests them; do not accumulate dated report folders in the source tree.

## What remains unverified

Local checks do not prove official token-picker support, hosted discovery, resolver adoption or ordinary-token orders filled from the 1inch frontend. The SDK has no production executor, automatic pricing, hedging or inventory replenishment. Real use also requires current redemption backing, costs, applicable licenses and security review.
