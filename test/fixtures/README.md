# Stable regression inputs

- `legacy-strategy.json` keeps the config, program bytes and hash produced by `cbe4970` before the generic market API. It verifies that legacy encoding remains unchanged. Synthetic actors and timestamps are fixed test inputs, not live orders or funding instructions.
- `legacy-position-identity.json` preserves a position hash from `d4ec1c8`, before the concentrated/protocol-fee instruction ordering correction. It verifies that callers can still close a stored position without rebuilding its old program with the new encoder.

Do not regenerate these expected values from the current implementation. Generated execution reports belong in `artifacts/`, not here. The upstream notices in [LICENSE.md](../../LICENSE.md) also apply to SDK-generated programs.
