import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from './fixtures.mjs';

test('CLI builds without any RPC or keys and refuses to overwrite a review artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ring-swapvm-cli-'));
  try {
    const input = join(dir, 'config.json'),
      output = join(dir, 'unsigned.json');
    writeFileSync(
      input,
      JSON.stringify({ ...config, expiry: String(Math.floor(Date.now() / 1000) + 86400) }),
    );
    const run = () =>
      spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../cli.mjs', import.meta.url)), 'build', input, output],
        { env: {}, encoding: 'utf8' },
      );
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const saved = readFileSync(output, 'utf8');
    const bundle = JSON.parse(saved);
    assert.equal(bundle.safety.unsigned, true);
    assert.equal(bundle.safety.executionAllowed, false);
    assert.equal(run().status, 1);
    assert.equal(readFileSync(output, 'utf8'), saved);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('CLI rejects invalid amounts without creating a transaction artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ring-swapvm-cli-'));
  try {
    const input = join(dir, 'config.json'),
      output = join(dir, 'unsigned.json');
    writeFileSync(
      input,
      JSON.stringify({ ...config, fwUSDC: '0', expiry: String(Math.floor(Date.now() / 1000) + 86400) }),
    );
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../cli.mjs', import.meta.url)), 'build', input, output],
      { env: {}, encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('partner CLI commands work without secrets and preserve explicit lifecycle semantics', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ring-aqua-partner-cli-'));
  try {
    const live = { ...config, expiry: String(Math.floor(Date.now() / 1000) + 86400) };
    const cases = [
      ['ship', live, 'ring.aqua-lifecycle.v1'],
      ['dock', { ...config, expiry: '100' }, 'ring.aqua-lifecycle.v1'],
      [
        'wrap',
        { chainId: 1, maker: config.maker, asset: 'USDT', amount: '1000000' },
        'ring.fewtoken-conversion.v1',
      ],
      [
        'unwrap',
        { chainId: 1, maker: config.maker, asset: 'USDC', amount: '1000000' },
        'ring.fewtoken-conversion.v1',
      ],
      [
        'route',
        {
          strategy: live,
          route: {
            chainId: 1,
            direction: 'USDC_USDT',
            exactIn: false,
            amount: '1000000',
            threshold: '1200000',
            deadline: String(Number(live.expiry) - 1),
            operator: '0x0000000000000000000000000000000020260920',
            executor: '0x0000000000000000000000000000000020260921',
            receiver: '0x0000000000000000000000000000000020260922',
          },
        },
        'ring.aqua-underlying-route.v1',
      ],
    ];
    for (const [command, inputData, schema] of cases) {
      const input = join(dir, command + '-input.json'),
        output = join(dir, command + '-output.json');
      writeFileSync(input, JSON.stringify(inputData));
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../cli.mjs', import.meta.url)), command, input, output],
        { env: {}, encoding: 'utf8' },
      );
      assert.equal(result.status, 0, result.stderr);
      const plan = JSON.parse(readFileSync(output, 'utf8'));
      assert.equal(plan.schema, schema);
      assert.equal(plan.safety.executionAllowed, false);
      if (command === 'route') {
        assert.equal(plan.atomicRequired, true);
        assert.equal(plan.adapterStatus, 'requires-resolver-runtime-adapter');
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
