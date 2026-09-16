import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = execFileSync('git', ['ls-files', '--cached', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
for (const file of files) {
  assert(
    !/^(artifacts|evidence|node_modules|coverage|out|cache|broadcast)\//.test(file),
    `generated file: ${file}`,
  );
  assert(!/\b20\d{2}-\d{2}-\d{2}\b/.test(file), `dated run path: ${file}`);
  assert(
    !/(^|\/)\.env($|\.)|\.local\.|\.(log|tgz|pem|key)$/.test(file),
    `local or secret-bearing file: ${file}`,
  );
  if (!file.endsWith('.md')) continue;
  const content = readFileSync(resolve(root, file), 'utf8');
  for (const [, target] of content.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;
    const path = target.split('#')[0];
    assert(existsSync(resolve(root, dirname(file), path)), `broken documentation link: ${file} -> ${target}`);
  }
}
console.log(`Repository checks passed (${files.length} tracked files).`);
