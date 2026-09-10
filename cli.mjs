import { readFileSync, writeFileSync } from 'node:fs';
import { buildStrategy, json, check } from './strategy.mjs';
import { preflight, readonlyRpc } from './readonly.mjs';
import { inspectSources } from './sources.mjs';

try {
  const [command, input, output] = process.argv.slice(2);
  check(
    ['build', 'preflight', 'sources'].includes(command) && input && output && process.argv.length === 5,
    'USAGE',
  );
  const config = JSON.parse(readFileSync(input, 'utf8'));
  let result;
  if (command === 'build') result = buildStrategy(config).bundle;
  else {
    check(process.env.ETH_RPC_URL || process.env.RPC_URL, 'MISSING_RPC');
    const rpc = readonlyRpc(process.env.ETH_RPC_URL || process.env.RPC_URL);
    result =
      command === 'sources'
        ? await inspectSources(rpc)
        : await preflight(rpc, config.strategy, { request: config.quote });
  }
  // Refuse to overwrite an existing review artifact or a config file.
  writeFileSync(output, json(result), { flag: 'wx', mode: 0o600 });
  console.log(json({ status: result.status ?? 'unsigned', executionAllowed: false }));
  if (result.status && result.status !== 'available') process.exitCode = 2;
} catch {
  console.error(
    'Command failed. Usage: node cli.mjs build|preflight|sources INPUT.json NEW_OUTPUT.json. Check config, expiry, RPC and output path. No transaction sent.',
  );
  process.exitCode = 1;
}
