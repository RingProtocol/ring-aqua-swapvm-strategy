# Ring Aqua SwapVM strategy

[中文说明](README.zh.md) · [Validation](VALIDATION.md) · [License scope](LICENSE.md)

Build unsigned `fwUSDC/fwUSDT` strategies with the 1inch Aqua and SwapVM SDKs, inspect their on-chain state, and reproduce swaps on a local Ethereum mainnet fork.

The strategy uses existing SwapVM instructions. It does not require a new production contract or a custom opcode. A **test-only** executor explicitly composes `USDC → fwUSDC → Aqua swap → fwUSDT → USDT`, including the reverse route. Successful local execution does **not** establish 1inch discovery, automatic route selection, Resolver adoption, or frontend traffic.

Powered by SwapVM — © Degensoft Ltd 2025. Powered by Aqua — © Degensoft Ltd 2025. This is a Ring integration using the published SDKs, not a 1inch-endorsed product. Upstream terms apply; see [LICENSE.md](LICENSE.md).

## Scope

| Component | Supported scope |
| --- | --- |
| Chain and deployment | Ethereum mainnet, AquaSwapVMRouter v1.0.2; pinned addresses and code hashes |
| SDKs | `@1inch/swap-vm-sdk 0.4.2`, `@1inch/aqua-sdk 0.3.2` |
| Pricing | Official pegged AMM instructions; not Ring V2 Pair reserve pricing |
| Maker assets | Canonical fwUSDC and fwUSDT, both 6 decimals |
| Swap modes | Both directions, exact input and exact output, with deadlines and amount limits |
| Access | Preserves the deployed router's `tx.origin` KycNFT check |
| CLI | Unsigned transaction generation and read-only RPC; no private keys, signatures, or broadcasts |
| Production status | Unaudited; discovery and real 1inch frontend fills remain unverified |

`strategy.mjs` uses the official `PeggedSwapArgs.fromTokens` and `AquaProgramBuilder`. It adds a mandatory expiry instruction and encodes fees with integers. Offline tests compare the shared instruction bytes against the SDK's higher-level `AquaPeggedAmmStrategy`.

## Run locally

Requires Node.js 22.13.1 or newer. The fork suite also requires [Foundry's Anvil](https://getfoundry.sh/anvil/overview) on `PATH` and an Ethereum archive RPC endpoint available through `ETH_RPC_URL` (or `RPC_URL`). Load credentials through your local secret manager; do not put them in tracked files. The CLI does not load `.env` files automatically.

```sh
git clone https://github.com/RingProtocol/ring-aqua-swapvm-strategy.git
cd ring-aqua-swapvm-strategy
npm ci --ignore-scripts
npm run format:check
npm test
npm audit --audit-level=high

# Requires an archive RPC endpoint in ETH_RPC_URL and anvil on PATH.
npm run test:fork
```

The fork runner starts its own Anvil on `127.0.0.1:18569` and refuses to use an occupied port. It reads the pinned mainnet block from the upstream RPC. Account impersonation, funding, contract deployment, approvals, and swaps happen only on the local fork. No real wallet key is required.

Completed results go to [`evidence/fork-results.json`](evidence/fork-results.json). Failed attempts go to ignored `evidence/fork-attempt.json` without replacing the completed report. Treat the other evidence files as belonging to a run only after the full suite succeeds. GitHub CI runs offline tests, formatting, and a dependency audit; it does not hold RPC credentials or run funded operations.

## Build an unsigned strategy

1. Copy `config/example.json` to `config/maker.local.json`.
2. Set a dedicated maker wallet, a future expiry in Unix seconds, and a unique positive salt. Review the inventory, fees, and protocol fee recipient.
3. Build a new output file:

```sh
node cli.mjs build config/maker.local.json maker-unsigned.local.json
```

This command does not connect a wallet or send transactions. It refuses to overwrite existing files. The bundle contains the maker, chain ID, target, calldata, value, and strategy hash.

`open` contains five ordered transactions: reset the fwUSDC allowance to Aqua, approve the bounded fwUSDC amount, reset the fwUSDT allowance, approve its bounded amount, then `ship` both assets. The maker must already hold the FewTokens. The tool does not acquire or fund them.

`close` docks both assets and separately resets both allowances to zero. Closing does not transfer maker balances to another address. If an already-docked strategy makes `dock` revert, revoke the allowances separately. A docked hash cannot be shipped again; build a fresh strategy with a new salt. ERC-20 allowances are shared across strategies in the same wallet, so isolate a pilot in a dedicated wallet.

| Field | Example | Meaning |
| --- | --- | --- |
| `fwUSDC`, `fwUSDT` | `"30"`, `"33"` | Human-readable units, up to 6 decimals; raw amounts must be positive and below 2^96 |
| `amplification` | `"300"` | SDK curve parameter in `(0, 5000]`, encoded at 1e27 precision |
| `feeBps` | `"0.1"` | Maker fee: 0.1 bps = 0.001%; up to 5 decimal places |
| `protocolFeeBps` | `"0.025"` | Protocol fee: 0.025 bps = 0.00025%; confirm it and the recipient with the integration team |
| `expiry` | Future Unix seconds | Required future uint40 timestamp |
| `salt` | Unique positive integer | Distinct strategy identity; do not reuse a shipped or docked strategy |

The example is a **test fixture, not a funding recommendation**. Its 30/33 inventory ratio gives an initial price near 1.10 USDT per USDC. The maker supplies that price concession; the trader's extra output is not protocol profit. The entire authorized inventory is exposed to contract and pricing risk, not just the three-unit inventory difference. There is no external price oracle, automated hedge, or replenishment service.

## Read-only preflight

The input is `{ "strategy": <maker config>, "quote": <request> }`. A request has this shape; replace the placeholders before use:

```json
{
  "direction": "USDC_USDT",
  "exactIn": true,
  "amount": "1000000",
  "threshold": "990000",
  "taker": "REPLACE_WITH_ELIGIBLE_RESOLVER_ADDRESS",
  "receiver": "REPLACE_WITH_RECEIVER_ADDRESS",
  "deadline": "REPLACE_WITH_FUTURE_UNIX_SECONDS"
}
```

Amounts are raw FewToken units. Use `USDT_USDC` for the reverse direction. For exact input, `threshold` is the minimum output; for exact output it is the maximum input. The request deadline cannot exceed the strategy expiry. The example threshold is only a formatting illustration, not a recommended limit.

```sh
# Requires ETH_RPC_URL in the environment.
node cli.mjs preflight preflight-input.local.json preflight-result.local.json
```

The checker pins one canonical block hash, checks deployment code, FewFactory bindings, decimals, real wallet balances, allowances, Aqua virtual balances, and Resolver credentials, then simulates `quote` and `swap` with `eth_call`. It rechecks the chain and block before returning, with a maximum snapshot age of 180 seconds. RPCs that do not support block-hash queries fail closed.

| Status | Meaning |
| --- | --- |
| `available` | Requested checks passed at the recorded snapshot |
| `insufficient` | A known constraint failed, such as inactive inventory or insufficient allowance |
| `read_failed` | The checker could not obtain or verify a complete result |
| `stale` | The snapshot expired or its block changed |

`executionAllowed` is always `false`. A successful simulation does not authorize a trade or validate an entire Resolver user order. Recheck after changing the block, taker, receiver, or amount limits. Receiving tokens in a reverse swap does not replenish a spent ERC-20 allowance.

## Wrapper source material

`config/wrapper-sources.json` contains nine Uniswap v4 wrapper PoolKeys, pool IDs, tokens, decimals, and pinned public allowlist provenance. The ETH pool takes native ETH; the underlying token bound to fwWETH is WETH.

```sh
# Requires ETH_RPC_URL. The sources command reads the fixed catalog;
# its JSON input is required by the CLI but does not override that catalog.
node cli.mjs sources config/example.json wrapper-check.local.json
```

`sources.mjs` verifies canonical bindings, immediate redemption backing, and hook code hashes, then requests both directions in both amount modes from V4Quoter. Failed quotes retain `null` and their own status. A top-level `available` means the catalog and snapshot checks completed; inspect every `quotes[].status` separately.

This is Ring's source-data format, **not an accepted 1inch Pathfinder plugin interface**. Uniswap allowlisting does not establish 1inch integration. Resolver execution still needs settlement-order, returned-delta, redemption-availability, user-limit, and gas checks.

## Integration acceptance

The next integration work needs agreement with 1inch on the source/Assembler interface, contribution repository, review owner, and eligible Resolver pilot. Ring can supply this builder, wrapper catalog, reproducible quote vectors, and execution tests, then implement the agreed adapter.

Frontend acceptance requires a normal USDC/USDT order to select the full FewToken route when it offers the best executable result after costs, followed by a verifiable real frontend fill. Publishing an Aqua position, obtaining an API quote, or passing this fork suite does not establish that outcome.

`test/RouteHarness.sol` is only a local test executor. It lacks a production executor's complete route binding, user authorization, reentrancy, and residual-token protections. Do not deploy it to serve orders. Pinned code hashes are compatibility checks, not a security audit; proxy implementations and upstream changes require separate review.

## References

- [1inch: build an AquaApp using existing opcodes](https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp)
- [1inch: access, Resolvers, and Pathfinder](https://business.1inch.com/portal/documentation/aqua/liquidity-layer/access-resolvers-and-pathfinder)
- [SwapVM SDK source](https://github.com/1inch/sdks/tree/master/typescript/swap-vm)
- [Aqua SDK source](https://github.com/1inch/sdks/tree/master/typescript/aqua)
- [Uniswap hook allowlist](https://github.com/Uniswap/uniroute-public/blob/main/src/lib/poolCaching/util/hooksAddressesAllowlist.ts)
