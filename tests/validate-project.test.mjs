#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'skills/seditor/scripts/validate-project.mjs');
const temp = await mkdtemp(path.join(os.tmpdir(), 'seditor-project-validate-'));
try {
  const app = path.join(temp, 'SEditor/app');
  await mkdir(app, { recursive: true });
  await writeFile(path.join(app, 'editor.html'), await readFile(path.join(repo, 'skills/seditor/app/editor.html')));
  const schema = { version: 1, meta: { name: 'valid' }, nodes: [], edges: [] };
  const schemaPath = path.join(temp, 'SEditor/valid.json');
  const launcherPath = schemaPath.replace('.json', '.html');
  await writeFile(schemaPath, JSON.stringify(schema, null, 2));
  const generate = spawn(process.execPath, [path.join(repo, 'skills/seditor/scripts/create-shortcut.mjs'), schemaPath, launcherPath, path.join(app, 'editor.html')], { stdio: 'ignore' });
  assert.equal(await new Promise((resolve, reject) => { generate.once('error', reject); generate.once('exit', resolve); }), 0, 'test launcher generation succeeds');
  const run = () => spawn(process.execPath, [script, temp], { stdio: 'ignore' });
  const exitCode = async (child) => (await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }));
  assert.equal(await exitCode(run()), 0, 'valid schema and paired launcher pass');
  await writeFile(launcherPath, '<html>stale</html>');
  assert.notEqual(await exitCode(run()), 0, 'stale launcher fails validation');
  await rm(launcherPath);
  assert.notEqual(await exitCode(run()), 0, 'missing launcher fails validation');
  // Пользовательский каталог: validate-project принимает output-dir третьим аргументом.
  const custom = path.join(temp, 'custom');
  const customApp = path.join(custom, 'docs/diagrams/app');
  await mkdir(customApp, { recursive: true });
  await writeFile(path.join(customApp, 'editor.html'), await readFile(path.join(repo, 'skills/seditor/app/editor.html')));
  const customSchema = path.join(custom, 'docs/diagrams/valid.json');
  await writeFile(customSchema, JSON.stringify(schema, null, 2));
  const customGen = spawn(process.execPath, [path.join(repo, 'skills/seditor/scripts/create-shortcut.mjs'), customSchema, customSchema.replace('.json', '.html'), path.join(customApp, 'editor.html')], { stdio: 'ignore' });
  assert.equal(await new Promise((resolve, reject) => { customGen.once('error', reject); customGen.once('exit', resolve); }), 0, 'custom-dir launcher generation succeeds');
  const customRun = () => spawn(process.execPath, [script, custom, 'docs/diagrams'], { stdio: 'ignore' });
  assert.equal(await exitCode(customRun()), 0, 'custom output dir passes validation');
  console.log('validate-project.test.mjs: valid, stale, missing launcher, and custom output dir cases passed');
} finally {
  await rm(temp, { recursive: true, force: true });
}
