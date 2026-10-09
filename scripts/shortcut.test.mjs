#!/usr/bin/env node
// Regression check: skill wrapper delegates to the bundled SEditor launcher generator.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const skillDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(skillDir, '..');
const temp = mkdtempSync(join(tmpdir(), 'seditor-shortcut-'));
try {
  const schema = { version: 1, meta: { name: 'test-flow' }, nodes: [], edges: [] };
  const schemaPath = join(temp, 'test-flow.json');
  const launcherPath = join(temp, 'test-flow.html');
  const bundledEditor = join(skillDir, 'app');
  const bundledSchema = join(skillDir, 'assets/example-scheme.json');
  const expectedLauncherPath = join(skillDir, 'assets/example-scheme.html');
  const shortcutScript = join(skillDir, 'scripts/create-shortcut.mjs');
  writeFileSync(schemaPath, JSON.stringify(schema));
  const run = (args) => {
    const result = spawnSync(process.execPath, [shortcutScript, ...args], { cwd: temp, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  run([schemaPath, launcherPath, join(bundledEditor, 'editor.html')]);
  const launcher = readFileSync(launcherPath, 'utf8');
  // Ярлык несёт схему внутри и открывает её без сервера.
  assert.match(launcher, /id="seditor-schema">/);
  assert.match(launcher, /#d=/);
  assert.match(launcher, /test-flow\.json/);
  assert.match(launcher, /"nodes"\s*:/, 'launcher embeds the schema');
  run([schemaPath, launcherPath, join(bundledEditor, 'editor.html'), '--check']);
  const before = readFileSync(launcherPath, 'utf8');
  schema.meta.name = 'changed';
  writeFileSync(schemaPath, JSON.stringify(schema));
  // Данные внутри: после правки JSON ярлык устаревает и обязан быть перегенерирован.
  assert.equal(readFileSync(launcherPath, 'utf8'), before, 'launcher stays until regenerated');
  run([schemaPath, launcherPath, join(bundledEditor, 'editor.html')]);
  const rebuilt = readFileSync(launcherPath, 'utf8');
  assert.match(rebuilt, /changed/, 'regeneration picks up the new schema');
  assert.notEqual(rebuilt, before);
  run([bundledSchema, expectedLauncherPath, join(bundledEditor, 'editor.html'), '--check']);
  const editor = (relative) => readFileSync(join(repoRoot, 'SEditor/app', relative));
  for (const file of ['editor.html', 'server.js', 'create-shortcut.mjs', 'shortcut.html', 'launcher.js']) {
    assert.deepEqual(readFileSync(join(bundledEditor, file)), editor(file), `bundled SEditor differs: ${file}`);
  }
  console.log('shortcut.test.mjs: ok');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
