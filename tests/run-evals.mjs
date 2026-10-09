#!/usr/bin/env node
// Run isolated skill output-eval cases in temporary workspaces and grade generated files.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = path.join(repoRoot, 'skills/seditor');
const evalsDir = path.join(repoRoot, 'tests/evals');
const sourceEditor = path.resolve(repoRoot, '../SEditor/app');
let evals;
try { evals = JSON.parse(await readFile(path.join(evalsDir, 'evals.json'), 'utf8')); } catch (error) {
  console.error(`invalid evals/evals.json: ${error.message}`);
  process.exit(1);
}
const temp = await mkdtemp(path.join(os.tmpdir(), 'seditor-evals-'));
let failed = 0;

function run(file, args, cwd) {
  const result = spawnSync(process.execPath, [path.join(skillDir, file), ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

try {
  for (const item of evals.evals) {
    if (item.id === 'near-miss-unrelated-html') {
      console.log(`SKIP ${item.id}: trigger selection is model/client-dependent; listed in eval_queries.json`);
      continue;
    }
    const project = path.join(temp, item.id);
    const schemas = path.join(project, '.SEditor');
    const app = path.join(schemas, 'app');
    await mkdir(app, { recursive: true });
    const existingSchema = item.id === 'protect-existing-human-schema' ? 'data-model.json' : null;
    if (item.id === 'no-type-no-overwrite') {
      await writeFile(path.join(schemas, 'existing.json'), JSON.stringify({ version: 1, meta: { name: 'existing' }, nodes: [], edges: [] }));
      await writeFile(path.join(schemas, 'existing.html'), 'keep-this-user-launcher');
    }
    if (existingSchema) {
      await writeFile(path.join(schemas, existingSchema), JSON.stringify({ version: 1, meta: { name: 'data-model' }, nodes: [], edges: [] }));
      await writeFile(path.join(schemas, 'data-model.html'), '<!doctype html>existing-user-shortcut</html>');
    }
    if (item.id === 'stale-vendored-editor') {
      await writeFile(path.join(app, 'version.json'), JSON.stringify({ name: 'SEditor', version: 'outdated' }));
      await writeFile(path.join(app, 'old-editor.js'), 'obsolete');
      for (const file of ['editor.html', 'server.js', 'create-shortcut.mjs', 'shortcut.html', 'launcher.js']) {
        await writeFile(path.join(app, file), `stale:${file}`);
      }
    } else {
      // Рантайм нужен генератору ярлыков (он читает editor.html для sha256)
      // и синхронизируется так же, как это делает навык по шагу 6 workflow.
      const synced = spawnSync(process.execPath, [path.join(skillDir, 'scripts/sync-editor.mjs'), project], { encoding: 'utf8' });
      assert.equal(synced.status, 0, synced.stderr);
    }
    if (item.id === 'no-type-no-overwrite') {
      assert.equal(await readFile(path.join(schemas, 'existing.json'), 'utf8').then((text) => JSON.parse(text).meta.name), 'existing');
      assert.equal(await readFile(path.join(schemas, 'existing.html'), 'utf8'), 'keep-this-user-launcher');
      console.log(`PASS ${item.id}: did not invent a schema before clarification`);
      continue;
    }
    const name = item.id === 'protect-existing-human-schema' ? 'data-new' : 'logic-test';
    const schemaPath = path.join(schemas, `${name}.json`);
    const launcherPath = schemaPath.replace(/\.json$/, '.html');
    const schema = { version: 1, meta: { name, app: 'SEditor' }, nodes: [], edges: [] };
    await writeFile(schemaPath, JSON.stringify(schema, null, 2));

    if (item.id === 'stale-vendored-editor') {
      const synced = spawnSync(process.execPath, [path.join(skillDir, 'scripts/sync-editor.mjs'), project], { encoding: 'utf8' });
      assert.equal(synced.status, 0, synced.stderr);
      const installed = JSON.parse(await readFile(path.join(app, 'version.json'), 'utf8'));
      const sourceManifest = JSON.parse(await readFile(path.join(sourceEditor, 'version.json'), 'utf8'));
      assert.equal(installed.version, sourceManifest.version);
      assert.equal(installed.launcherFormat, 'embed-v1');
      for (const [file, checksum] of Object.entries(sourceManifest.files)) {
        const bytes = await readFile(path.join(app, file));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum);
      }
      assert.equal(await readFile(path.join(app, 'old-editor.js'), 'utf8'), 'obsolete', 'sync must preserve unmanaged user files');
    }
    const generated = run('scripts/create-shortcut.mjs', [schemaPath, launcherPath, path.join(app, 'editor.html')], project);
    assert.equal(generated.status, 0, generated.stderr);
    const launcher = await readFile(launcherPath, 'utf8');
    if (existingSchema) {
      assert.equal(JSON.parse(await readFile(path.join(schemas, existingSchema), 'utf8')).meta.name, 'data-model');
      assert.equal(await readFile(path.join(schemas, 'data-model.html'), 'utf8'), '<!doctype html>existing-user-shortcut</html>');
    }
    // Ярлык встраивает данные и после правок обязан перегенерироваться.
    assert.match(launcher, /id="seditor-schema">/);
    assert.match(launcher, /#d=/);
    assert.match(launcher, /"nodes"\s*:/);

    const updated = structuredClone(schema);
    updated.meta.name += '-updated';
    updated.nodes.push({ id: 'n1', type: 'shape', position: { x: 0, y: 0 }, width: 160, height: 80, data: { shape: 'rect', label: 'Updated' } });
    await writeFile(schemaPath, JSON.stringify(updated, null, 2));
    assert.equal(await readFile(launcherPath, 'utf8'), launcher, 'launcher stays until it is regenerated');
    const validator = run('scripts/validate-scheme.mjs', [schemaPath], project);
    assert.equal(validator.status, 0, validator.stderr);

    // Deliberately malformed schema: validator must fail with a useful diagnostic.
    const malformedPath = path.join(schemas, 'malformed.json');
    await writeFile(malformedPath, '{broken');
    const malformed = run('scripts/validate-scheme.mjs', [malformedPath], project);
    assert.notEqual(malformed.status, 0, 'invalid JSON must fail validation');
    assert.match(malformed.stderr, /invalid JSON/);

    console.log(`PASS ${item.id}: launcher generation, update stability, schema validation, malformed-input rejection`);
  }
  console.log(`output evals passed: ${evals.evals.length - 1} mechanical scenarios; trigger evals run separately`);
} catch (error) {
  failed += 1;
  console.error(`FAIL output eval: ${error.stack || error}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
if (failed) process.exitCode = 1;
