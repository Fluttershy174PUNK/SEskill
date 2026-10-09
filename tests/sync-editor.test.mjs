#!/usr/bin/env node
// Real filesystem sync tests: version upgrade, idempotence, user-file preservation, checksum guard.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncEditor } from '../skills/seditor/scripts/sync-editor.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = path.join(repoRoot, 'skills/seditor');
const temp = await mkdtemp(path.join(os.tmpdir(), 'seditor-sync-test-'));
try {
  const project = path.join(temp, 'project');
  const staleApp = path.join(project, '.SEditor/app');
  await mkdir(staleApp, { recursive: true });
  await writeFile(path.join(staleApp, 'old-editor.js'), 'user-owned file');
  await writeFile(path.join(staleApp, 'editor.html'), 'old version');

  const first = await syncEditor(project);
  const manifest = JSON.parse(await readFile(path.join(skillDir, 'app', 'version.json'), 'utf8'));
  assert.equal(first.version, manifest.version);
  assert.equal(first.changed, true);
  for (const file of ['editor.html', 'server.js', 'create-shortcut.mjs', 'shortcut.html', 'launcher.js', 'version.json']) {
    assert.deepEqual(await readFile(path.join(staleApp, file)), await readFile(path.join(skillDir, 'app', file)));
  }
  // Тесты бандла — только в репозитории редактора, в чужой проект не ставятся.
  for (const file of ['editor.test.mjs', 'version.test.mjs']) {
    await assert.rejects(readFile(path.join(staleApp, file)), /ENOENT/, `${file} must not be installed into a project`);
  }
  assert.equal(await readFile(path.join(staleApp, 'old-editor.js'), 'utf8'), 'user-owned file', 'do not delete unrecognized user files');
  const installedManifest = await readFile(path.join(staleApp, 'version.json'), 'utf8');
  const second = await syncEditor(project);
  assert.equal(second.changed, false, 'same version must be idempotent');
  assert.equal(await readFile(path.join(staleApp, 'version.json'), 'utf8'), installedManifest);

  const broken = path.join(temp, 'broken-bundle');
  await mkdir(broken, { recursive: true });
  await cp(path.join(skillDir, 'app'), broken, { recursive: true });
  await cp(path.join(skillDir, 'app/version.json'), path.join(broken, 'version.json'));
  await cp(path.join(skillDir, 'app/editor.html'), path.join(broken, 'editor.html'));
  await writeFile(path.join(broken, 'editor.html'), 'tampered bundle');
  await assert.rejects(syncEditor(project, { sourceAppDir: broken }), /checksum failed/);
  console.log('sync-editor.test.mjs: upgrade, idempotence, user-file preservation, and checksum rejection passed');
} finally {
  await rm(temp, { recursive: true, force: true });
}
