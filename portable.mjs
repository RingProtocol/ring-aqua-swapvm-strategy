import deployment from './config/deployment.json' with { type: 'json' };
import { createStrategyApi } from './strategy-core.mjs';
import { createIntegrationApi } from './integration-core.mjs';

// Host bundlers supply the pinned official SDKs; no fs, process, require or wallet.
// This entry is not a browser app and does not solve upstream SDK bundler setup.
export function createRingAquaIntegration({ swapVmSdk, aquaSdk }) {
  const api = createStrategyApi(swapVmSdk, aquaSdk.AquaProtocolContract, deployment);
  return { ...createIntegrationApi(api), buildStrategy: api.buildStrategy, buildQuote: api.buildQuote };
}
