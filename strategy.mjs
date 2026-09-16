import { createRequire } from 'node:module';
import deploymentConfig from './config/deployment.json' with { type: 'json' };
import { createStrategyApi } from './strategy-core.mjs';

// The pinned upstream ESM entry has extensionless transitive imports in Node.
const require = createRequire(import.meta.url);
export const sdk = require('@1inch/swap-vm-sdk');
export const { AquaProtocolContract } = require('@1inch/aqua-sdk');
export const {
  C,
  TOKENS,
  deployment,
  erc20,
  aquaAbi,
  routerAbi,
  json,
  check,
  address,
  uint,
  decimal,
  normalize,
  buildStrategy,
  buildQuote,
} = createStrategyApi(sdk, AquaProtocolContract, deploymentConfig);
