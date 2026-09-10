import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outdir = mkdtempSync(join(tmpdir(), 'ring-aqua-browser-'));
await build({
  entryPoints: [fileURLToPath(new URL('./browser-entry.mjs', import.meta.url))],
  outfile: join(outdir, 'smoke.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  inject: [fileURLToPath(new URL('./browser-shims.mjs', import.meta.url))],
  logLevel: 'warning',
});
writeFileSync(
  join(outdir, 'index.html'),
  '<!doctype html><meta charset="utf-8"><title>Ring Aqua SDK browser smoke</title><body>Loading SDK test<script>window.addEventListener("error",e=>{document.body.textContent="FAILED: "+e.message})</script><script src="./smoke.js"></script></body>',
);
console.log(JSON.stringify({ status: 'bundled', outdir, browserExecution: 'required', wallet: false }));
