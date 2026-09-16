# Contributing

Use Node.js 22.13.1 or newer and install the locked dependencies with `npm ci --ignore-scripts`.

Before proposing a change, run `npm run check:repo`, `npm test`, `npm run format:check`, `npm run test:types`, `npm run build:browser-smoke`, `npm run test:package`, and `npm audit --audit-level=high`. The package test installs the actual tarball into an isolated consumer, checks both exports and declarations, and executes the unsigned example without RPC or a wallet. Browser bundling alone is not a browser execution test. For changes to strategy encoding, settlement, deployment metadata, or fork behavior, also run `npm run test:fork` with an archive RPC endpoint and Anvil. Check that the completed report's source and lockfile hashes match the proposed files.

Explain the problem, resulting behavior, validation performed, and anything still unverified. Keep local execution evidence separate from claims of official discovery, automatic routing, or real frontend fills.

Keep public documentation in English. Team translations and business material belong outside this repository.

Never commit credentials, private keys, wallet exports, local RPC URLs, or internal business material. Never add automatic signing, funding, deployment, or mainnet broadcasting to CI. Do not use the test harness as a production executor.

Preserve upstream notices and the [license scope](LICENSE.md). Package `private: true` intentionally prevents accidental npm publication; it does not control GitHub visibility.

The repository check uses tracked files; stage intended additions/deletions before running it locally. Keep runtime/config/example/documentation files explicit in the package allowlist. Keep executable tests and stable regression inputs in `test/`. Generated results belong in ignored `artifacts/`; do not commit dated run folders, terminal output or internal meeting records. Tests and generated output are excluded from the consumer package. Read [SECURITY.md](SECURITY.md) before reporting a vulnerability.
