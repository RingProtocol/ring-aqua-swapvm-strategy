# Contributing

Use Node.js 22.13.1 or newer and install the locked dependencies with `npm ci --ignore-scripts`.

Before proposing a change, run `npm test`, `npm run format:check`, and `npm audit --audit-level=high`. For changes to strategy encoding, settlement, deployment metadata, or fork behavior, also run `npm run test:fork` with an archive RPC endpoint and Anvil. Check that the completed report's source and lockfile hashes match the proposed files.

Explain the problem, resulting behavior, validation performed, and anything still unverified. Keep local execution evidence separate from claims of official discovery, automatic routing, or real frontend fills.

Never commit credentials, private keys, wallet exports, local RPC URLs, or internal business material. Never add automatic signing, funding, deployment, or mainnet broadcasting to CI. Do not use the test harness as a production executor.

Preserve upstream notices and the [license scope](LICENSE.md). Package `private: true` intentionally prevents accidental npm publication; it does not control GitHub visibility.
