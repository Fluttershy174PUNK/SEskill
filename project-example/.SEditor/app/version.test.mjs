#!/usr/bin/env node
// Verify app release manifest checksums and launcher contract.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.dirname(fileURLToPath(import.meta.url));
let manifest;
try { manifest = JSON.parse(await readFile(path.join(app, 'version.json'), 'utf8')); } catch (error) {
  console.error(`invalid app/version.json: ${error.message}`);
  process.exit(1);
}
assert.equal(manifest.name, 'SEditor');
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.launcherFormat, 'embed-v1');
for (const [file, expected] of Object.entries(manifest.files)) {
  const actual = createHash('sha256').update(await readFile(path.join(app, file))).digest('hex');
  assert.equal(actual, expected, `version.json checksum mismatch for ${file}`);
}
assert.match(await readFile(path.join(app, 'shortcut.html'), 'utf8'), /__SCHEME_JSON__/);
assert.match(await readFile(path.join(app, 'shortcut.html'), 'utf8'), /seditor-schema/);
console.log(`version.test.mjs: ${Object.keys(manifest.files).length} release checksums verified`);
