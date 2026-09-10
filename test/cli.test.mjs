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
