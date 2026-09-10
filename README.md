# Ring Aqua SwapVM strategy

[API](docs/integration.md) · [Compatibility](docs/compatibility.md) · [Testing](docs/testing.md)

An unsigned SDK for offering FewToken inventory held in a maker wallet through 1inch Aqua. It builds bounded approvals, position creation/closure and token conversion plans using the official Aqua and SwapVM SDKs. It also generates ordinary-token execution recipes for a resolver to integrate.

The implementation follows [1inch's Path B](https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp): compose existing SwapVM instructions and register a strategy on the deployed router. No custom opcode or new production contract is required for this pricing scope. This is an independent Ring integration, not a 1inch-endorsed product.

## Scope

| Component | Current support |
| --- | --- |
| Deployment | Ethereum; AquaSwapVMRouter v1.0.2, pinned SDK versions and code hashes |
| FewTokens | Underlyings: USDC, USDT, DAI, WETH, WBTC, cbBTC, weETH, UNI, wstETH |
| Maker operations | Bounded approvals, ship, dock/revoke, ERC-20/FewToken wrap and unwrap |
| Native ETH | Separate ETH/WETH maker conversion, then WETH/fwWETH if needed |
| Pricing | Official constant-product, concentrated and pegged instructions; explicit fees and expiry |
| Integrator tools | Node/portable exports, TypeScript declarations, read-only checks and atomic route recipes |
| Not included | Wallet UI, signing/broadcasting, production resolver, automated pricing or inventory management |

The nine-asset [catalog](config/assets.json) limits what this SDK builds; it is not an on-chain whitelist or an official 1inch token listing. Maker funds remain in the maker wallet under revocable allowances. Strategies can share those balances and allowances.

## Quick start

Requires Node.js 22.13.1 or newer. No API key, RPC or wallet is needed for the example and offline checks.

```sh
git clone https://github.com/RingProtocol/ring-aqua-swapvm-strategy.git
cd ring-aqua-swapvm-strategy
npm ci --ignore-scripts
npm run example:plans
npm run check:repo
npm test
npm run test:types
npm run test:package
```

[examples/build-plans.mjs](examples/build-plans.mjs) exercises the public exports with synthetic USDC/WETH inventory: wrap, ship, quote/swap calldata, a route recipe, dock and unwrap. The output is unsigned and must not be broadcast. The package test installs the actual tarball into an isolated consumer and checks exports, types and the example; it does not publish an npm package. `private: true` prevents accidental npm publication, not GitHub source review.

For local chain execution, install [Anvil](https://getfoundry.sh/anvil/overview), provide an archive RPC through `ETH_RPC_URL`, then run `npm run test:fork`. All writes occur on a dedicated loopback Anvil. Results go to ignored `artifacts/fork/`. See [test coverage and limitations](docs/testing.md), [the API](docs/integration.md) and [CLI instructions](docs/cli.md).

## What we want 1inch to review

Our goal is to create and manage FewToken positions in the official Aqua UI, and have ordinary-token orders use them when the complete executable route is competitive:

`USDC → fwUSDC → Aqua swap → fwUSDT → USDT`

The local fork validates this composition, including reverse settlement. It does not establish official discovery, automatic selection or a real 1inch frontend fill. Please review the SDK and identify remaining work for official token selection, position parameters and resolver-side wrapping/settlement. Reuse the official UI where possible; a separate Ring page is not assumed necessary. The partner does not have to adopt this entire SDK to meet that goal.

The route output is an execution recipe, not a finished production transaction. The Solidity contract under `test/` is a test-only executor and must not handle production orders. Fresh inventory, redemption backing, fees and gas must be checked before any real trial; configured fees or a successful swap do not guarantee profit.

## Repository map

- Root `.mjs` and `.d.mts`: SDK, CLI and public types.
- `config/`: pinned assets, deployment and example inputs.
- `examples/`: runnable unsigned consumer example.
- `test/`: executable unit/fork/consumer tests and stable regression fixtures.
- `docs/`: integration, CLI, compatibility, testing and design decisions.

## Security and licenses

Unaudited. Read [SECURITY.md](SECURITY.md) and [license scope](LICENSE.md) before use. Ring's independent code uses MIT; upstream SDKs and generated programs retain their applicable terms. See [third-party notices](THIRD_PARTY_NOTICES.md) and [contributing](CONTRIBUTING.md).

Powered by SwapVM — © Degensoft Ltd 2025. Powered by Aqua — © Degensoft Ltd 2025.
