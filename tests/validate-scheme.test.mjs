#!/usr/bin/env node
// Black-box validator tests with fixtures for valid and malformed schemas.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = path.join(repoRoot, 'skills/seditor');
const validator = path.join(skillDir, 'scripts/validate-scheme.mjs');
const temp = await mkdtemp(path.join(os.tmpdir(), 'seditor-validator-'));
const run = (file) => spawnSync(process.execPath, [validator, file], { encoding: 'utf8' });
try {
  const validPath = path.join(temp, 'valid.json');
  await writeFile(validPath, JSON.stringify({
    version: 1, meta: { name: 'valid' },
    nodes: [
      { id: 'n1', type: 'shape', position: { x: 0, y: 0 }, width: 160, height: 80, data: { shape: 'rect', label: 'Start' } },
      { id: 'n2', type: 'shape', position: { x: 240, y: 0 }, width: 160, height: 80, data: { shape: 'rect', label: 'End' } }
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'right', targetHandle: 'left', type: 'straight' }]
  }));
  const good = run(validPath);
  assert.equal(good.status, 0, good.stderr);

  const invalidPath = path.join(temp, 'invalid.json');
  await writeFile(invalidPath, JSON.stringify({ version: 2, nodes: [], edges: [{ id: 'e1', source: 'missing', target: 'missing', sourceHandle: 'inside', targetHandle: 'wrong' }] }));
  const bad = run(invalidPath);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /version/);
  assert.match(bad.stderr, /source/);
  assert.match(bad.stderr, /sourceHandle/);

  const malformedPath = path.join(temp, 'malformed.json');
  await writeFile(malformedPath, '{broken');
  const malformed = run(malformedPath);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /invalid JSON/);

  const missing = run(path.join(temp, 'missing.json'));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /cannot read/);
  console.log('validate-scheme.test.mjs: valid, invalid, malformed, missing cases passed');
} finally {
  await rm(temp, { recursive: true, force: true });
}
