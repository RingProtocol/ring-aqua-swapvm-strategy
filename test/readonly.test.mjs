import test from 'node:test';
import assert from 'node:assert/strict';
import { readonlyRpc, snapshot, preflight } from '../readonly.mjs';
import { config, NOW } from './fixtures.mjs';

const header = { number: '0x100', hash: '0x' + 'a'.repeat(64), timestamp: '0x' + NOW.toString(16) };
test('RPC interface forbids all writes and never includes secret-bearing errors', async () => {
  let calls = 0;
  const rpc = readonlyRpc('https://example.invalid/private-key', {
    fetchImpl: async () => {
      calls++;
      throw Error('https://example.invalid/private-key');
    },
  });
  for (const method of [
    'eth_sendTransaction',
    'eth_sendRawTransaction',
    'personal_sign',
    'anvil_setBalance',
    'eth_signTypedData_v4',
  ])
    await assert.rejects(() => rpc(method), /RPC_WRITE_FORBIDDEN/);
  assert.equal(calls, 0);
  await assert.rejects(
    () => rpc('eth_chainId'),
    (e) => e.message === 'RPC_READ_FAILED',
  );
});
for (const name of ['wrong id', 'missing result', 'provider error', 'wrong version', 'bad HTTP'])
  test(`rejects ${name}`, async () => {
    const rpc = readonlyRpc('https://example.invalid', {
      fetchImpl: async (_, o) => {
        const q = JSON.parse(o.body);
        const body = { jsonrpc: '2.0', id: q.id, result: '0x1' };
        if (name === 'wrong id') body.id++;
        if (name === 'missing result') delete body.result;
        if (name === 'provider error') body.error = { message: 'secret' };
        if (name === 'wrong version') body.jsonrpc = '1.0';
        return { ok: name !== 'bad HTTP', json: async () => body };
      },
    });
    await assert.rejects(() => rpc('eth_chainId'), /RPC_READ_FAILED/);
  });
test('same canonical block hash is used in state calls and rechecked at end', async () => {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    return method === 'eth_chainId' ? '0x1' : header;
  };
  const s = await snapshot(rpc, { now: NOW });
  assert.deepEqual(s.tag, { blockHash: header.hash, requireCanonical: true });
  await s.finish();
  assert.equal(calls.at(-2).params[0], header.number);
});
test('stale, wrong chain, changed block and changed timestamp are refused', async () => {
  await assert.rejects(
    () => snapshot(async (m) => (m === 'eth_chainId' ? '0x1' : header), { now: NOW + 181n }),
    /STALE_BLOCK/,
  );
  await assert.rejects(() => snapshot(async () => '0x2105', { now: NOW }), /CHAIN_MISMATCH/);
  for (const patch of [{ hash: '0x' + 'b'.repeat(64) }, { timestamp: '0x' + (NOW + 1n).toString(16) }]) {
    let n = 0;
    const s = await snapshot(
      async (m) => (m === 'eth_chainId' ? '0x1' : ++n === 1 ? header : { ...header, ...patch }),
      { now: NOW },
    );
    await assert.rejects(() => s.finish(), /BLOCK_CHANGED/);
  }
});
test('failed deployment verification exposes no quote or execution permission', async () => {
  const result = await preflight(
    async (m) => (m === 'eth_chainId' ? '0x1' : m === 'eth_getBlockByNumber' ? header : '0x'),
    config,
    { now: NOW },
  );
  assert.equal(result.status, 'read_failed');
  assert.equal(result.quote, null);
  assert.equal(result.executionAllowed, false);
  assert.deepEqual(result.issues, ['DEPLOYMENT_MISMATCH']);
});
