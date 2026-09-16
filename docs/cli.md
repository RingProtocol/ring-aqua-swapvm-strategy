# CLI and read-only checks

[Back to README](../README.md) · [Integration API](integration.md)

## Build an unsigned strategy (legacy stablecoin example)

1. Copy `config/example.json` to `config/maker.local.json`.
2. Set a dedicated maker wallet, a future expiry in Unix seconds, and a unique positive salt. Review the inventory, fees, and protocol fee recipient.
3. Build a new output file:

```sh
node cli.mjs build config/maker.local.json maker-unsigned.local.json
```

This command does not connect a wallet or send transactions. It refuses to overwrite existing files. The bundle contains the maker, chain ID, target, calldata, value, and strategy hash.

`open` contains five ordered transactions: reset the fwUSDC allowance to Aqua, approve the bounded fwUSDC amount, reset the fwUSDT allowance, approve its bounded amount, then `ship` both assets. The maker must hold the FewTokens before executing these steps. Separate `wrap` plans can prepare explicitly chosen amounts from the maker's underlying balance; nothing is funded or sent automatically.

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
