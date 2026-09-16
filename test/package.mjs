import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'ring-aqua-package-'));
function run(command, args, cwd = dir) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      timeout: 180000,
      // No NODE_PATH fallback to the source checkout's development dependencies.
      env: { ...process.env, NODE_PATH: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`${command} failed (status ${error.status ?? 'unknown'}); external output suppressed`);
  }
}

try {
  const [pack] = JSON.parse(
    run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dir], root),
  );
  const files = pack.files.map((file) => file.path);
  assert(!files.some((path) => /^(test|evidence|artifacts|node_modules|\.github)\//.test(path)));
  assert(!files.some((path) => /(^|\/)\.env|\.local\.|\.(sol|log|tgz)$/.test(path)));
  for (const path of [
    'index.mjs',
    'index.d.mts',
    'portable.mjs',
    'portable.d.mts',
    'config/assets.json',
    'config/deployment.json',
    'config/wrapper-sources.json',
    'examples/build-plans.mjs',
    'LICENSE',
    'LICENSE.md',
    'THIRD_PARTY_NOTICES.md',
    'LICENSES/LicenseRef-Degensoft-Aqua-Source-1.1.txt',
    'LICENSES/LicenseRef-Degensoft-SwapVM-1.1.txt',
  ])
    assert(files.includes(path), `missing package file: ${path}`);

  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'ring-aqua-consumer-test', private: true, type: 'module' }),
  );
  run('npm', [
    'install',
    '--ignore-scripts',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    join(dir, pack.filename),
  ]);
  const installed = join(dir, 'node_modules/@ring-protocol/aqua-swapvm-strategy');
  assert(
    realpathSync(installed).startsWith(realpathSync(dir) + '/'),
    'package must not be a checkout symlink',
  );
  for (const path of files) {
    // npm may normalize package.json metadata; check actual shipped sources and licenses.
    if (path !== 'package.json')
      assert.deepEqual(
        readFileSync(join(installed, path)),
        readFileSync(join(root, path)),
        `packed content changed: ${path}`,
      );
  }
  copyFileSync(join(installed, 'examples/build-plans.mjs'), join(dir, 'example.mjs'));
  writeFileSync(
    join(dir, 'consumer.mjs'),
    `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as kit from '@ring-protocol/aqua-swapvm-strategy';
import { createRingAquaIntegration } from '@ring-protocol/aqua-swapvm-strategy/portable';
import metadata from '@ring-protocol/aqua-swapvm-strategy/package.json' with { type: 'json' };
import { buildExamplePlans } from './example.mjs';
const require = createRequire(import.meta.url);
const portable = createRingAquaIntegration({ swapVmSdk: require('@1inch/swap-vm-sdk'), aquaSdk: require('@1inch/aqua-sdk') });
const plans = buildExamplePlans();
assert.equal(metadata.private, true);
assert.equal(kit.ASSETS.length, 9);
assert.deepEqual(plans.ship, portable.buildAquaShipPlan(plans.config));
assert.deepEqual(plans.dock, portable.buildAquaDockPlan(plans.identity));
assert.equal(plans.ship.transactions.length, 5);
assert.equal(plans.dock.transactions.length, 3);
assert.equal(plans.wrap.transactions.length, 4);
assert.equal(plans.unwrap.transactions.length, 1);
const nativeRequest = { chainId: 1, maker: plans.config.maker, amount: plans.nativeWrap.amount };
assert.deepEqual(plans.nativeWrap, portable.buildNativeWrapPlan(nativeRequest));
assert.deepEqual(plans.nativeUnwrap, portable.buildNativeUnwrapPlan(nativeRequest));
assert.deepEqual(plans.nativeWrap, kit.buildNativeWrapPlan(nativeRequest));
assert.deepEqual(plans.nativeUnwrap, kit.buildNativeUnwrapPlan(nativeRequest));
assert.equal(plans.nativeWrap.transactions[0].to, kit.getAsset('WETH').underlying);
assert.equal(plans.nativeWrap.transactions[0].data, '0xd0e30db0');
assert.equal(plans.nativeWrap.transactions[0].value, nativeRequest.amount);
assert.equal(plans.nativeUnwrap.transactions[0].value, '0');
assert.equal(plans.ship.safety.executionAllowed, false);
assert.equal(plans.route.adapterStatus, 'requires-resolver-runtime-adapter');
assert.equal(plans.route.atomicRequired, true);
assert.equal(plans.route.originIn, kit.getAsset('USDC').underlying);
assert.equal(plans.route.originOut, kit.getAsset('WETH').underlying);
assert.equal(typeof kit.preflight, 'function');
assert.equal(typeof kit.readonlyRpc, 'function');
JSON.stringify(plans);
console.log('installed package consumer passed');
`,
  );
  run(process.execPath, [join(dir, 'consumer.mjs')]);
  // Resolve declarations from the installed tarball, not the package's self-reference.
  copyFileSync(join(root, 'test/types.mts'), join(dir, 'types.mts'));
  run(process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--strict',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ES2022',
    '--skipLibCheck',
    'types.mts',
  ]);
  console.log(
    JSON.stringify({
      status: 'passed',
      files: files.length,
      unpackedBytes: pack.unpackedSize,
      integrity: pack.integrity,
      consumer: 'isolated-tarball-install',
      nodeAndPortable: true,
      types: true,
      published: false,
    }),
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
