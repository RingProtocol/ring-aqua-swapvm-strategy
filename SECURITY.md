# Security scope and reporting

This is an unaudited integration SDK. It generates unsigned plans and performs read-only checks; it is not a wallet, production executor, hosted trading service, or guarantee of official routing. Test harness contracts must never handle production funds. See [integration boundaries](docs/integration.md) for approval, expiry, refund and resolver boundaries.

Do not post exploitable vulnerability details, credentials, wallet exports or private RPC URLs in public issues. If GitHub shows **Report a vulnerability** in this repository's Security tab, use that private reporting workflow. If it is unavailable, request a private reporting channel from a known Ring maintainer through an existing private conversation; share only a non-sensitive summary until that channel is established. Do not send secrets or sign transactions to demonstrate a report.

Private vulnerability reporting was not verified as available during the local release review. Maintainers must establish and verify a monitored private channel before public release; adding this file does not enable GitHub's reporting feature. No bounty or response-time commitment is implied.

Include the affected version/commit, a local reproduction, expected versus actual behavior, and impact. Reproduce using mocks or a local fork, never another party's live funds. Upstream SDK or deployed-contract issues should also follow the respective upstream project's published reporting policy.
