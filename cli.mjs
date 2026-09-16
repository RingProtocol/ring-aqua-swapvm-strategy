import { readFileSync, writeFileSync } from 'node:fs';
import { buildStrategy, json, check } from './strategy.mjs';
import { preflight, readonlyRpc } from './readonly.mjs';
import {
  buildAquaShipPlan,
  buildAquaDockPlan,
  buildMakerWrapPlan,
  buildMakerUnwrapPlan,
  buildUnderlyingRoute,
} from './index.mjs';

try {
  const [command, input, output] = process.argv.slice(2);
  check(
    ['build', 'ship', 'dock', 'wrap', 'unwrap', 'route', 'preflight'].includes(command) &&
      input &&
      output &&
      process.argv.length === 5,
    'USAGE',
  );
  const config = JSON.parse(readFileSync(input, 'utf8'));
  let result;
  if (command === 'build') result = buildStrategy(config).bundle;
  else if (command === 'ship') result = buildAquaShipPlan(config);
  else if (command === 'dock') result = buildAquaDockPlan(config);
  else if (command === 'wrap') result = buildMakerWrapPlan(config);
  else if (command === 'unwrap') result = buildMakerUnwrapPlan(config);
  else if (command === 'route') result = buildUnderlyingRoute(config.strategy, config.route);
  else {
    check(process.env.ETH_RPC_URL || process.env.RPC_URL, 'MISSING_RPC');
    const rpc = readonlyRpc(process.env.ETH_RPC_URL || process.env.RPC_URL);
    result = await preflight(rpc, config.strategy, { request: config.quote });
  }
  // Refuse to overwrite an existing review artifact or a config file.
  writeFileSync(output, json(result), { flag: 'wx', mode: 0o600 });
  console.log(json({ status: result.status ?? 'unsigned', executionAllowed: false }));
  if (result.status && result.status !== 'available') process.exitCode = 2;
} catch {
  console.error(
    'Command failed. Usage: node cli.mjs build|ship|dock|wrap|unwrap|route|preflight INPUT.json NEW_OUTPUT.json. Check config, expiry, RPC and output path. No transaction sent.',
  );
  process.exitCode = 1;
}
