#!/usr/bin/env node
// End-to-end skill path: generate schema + launcher, start bundled server, update JSON, reopen same path.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = path.join(repoRoot, 'skills/seditor');
const temp = await mkdtemp(path.join(os.tmpdir(), 'seditor-skill-e2e-'));
let server;

async function unusedPort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const { port } = socket.address();
  socket.close();
  await once(socket, 'close');
  return port;
}

async function waitFor(url, child) {
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) throw new Error(`backend exited (${child.exitCode})`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`backend did not start at ${url}`);
}

try {
  const project = path.join(temp, 'demo');
  const editorDir = path.join(project, 'SEditor', 'app');
  await mkdir(editorDir, { recursive: true });
  for (const file of ['editor.html', 'server.js', 'create-shortcut.mjs', 'shortcut.html', 'launcher.js']) {
    await writeFile(path.join(editorDir, file), await readFile(path.join(skillDir, 'app', file)));
  }
  const schemaRel = 'SEditor/logic-demo.json';
  const schemaPath = path.join(project, schemaRel);
  const schema = {
    version: 1,
    meta: { name: 'logic-demo', app: 'SEditor' },
    nodes: [{ id: 'n1', type: 'shape', position: { x: 0, y: 0 }, width: 160, height: 80, data: { shape: 'rect', label: 'Generated' } }],
    edges: []
  };
  await writeFile(schemaPath, JSON.stringify(schema, null, 2));

  const generated = spawn(process.execPath, [path.join(skillDir, 'scripts/create-shortcut.mjs'), schemaPath, path.join(project, 'SEditor/logic-demo.html'), path.join(editorDir, 'editor.html')], { cwd: project, stdio: 'ignore' });
  assert.equal((await once(generated, 'exit'))[0], 0, 'skill launcher generator exits successfully');
  const launcherPath = path.join(project, 'SEditor/logic-demo.html');
  const launcherBeforeUpdate = await readFile(launcherPath, 'utf8');
  // Ярлык несёт схему внутри (offline-открытие) и кодирует путь схемы.
  assert.match(launcherBeforeUpdate, /id="seditor-schema">/);
  assert.match(launcherBeforeUpdate, /#d=/);
  assert.match(launcherBeforeUpdate, /logic-demo\.json/);
  assert.match(launcherBeforeUpdate, /"nodes"\s*:/);

  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(editorDir, 'server.js')], {
    cwd: project,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
    stdio: 'ignore'
  });
  await waitFor(`${base}/editor.html`, server);

  const readSchema = async () => {
    const pathArg = encodeURIComponent('../logic-demo.json');
    const response = await fetch(`${base}/api/schema?path=${pathArg}`);
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  assert.equal((await readSchema()).nodes[0].data.label, 'Generated');

  // Simulate an LLM revision: same HTML path opens the new persisted schema, no regeneration.
  schema.meta.name = 'logic-demo-revised';
  schema.nodes[0].data.label = 'Revised by agent';
  await writeFile(schemaPath, JSON.stringify(schema, null, 2));
  assert.equal(await readFile(launcherPath, 'utf8'), launcherBeforeUpdate);
  const reopened = await readSchema();
  assert.equal(reopened.meta.name, 'logic-demo-revised');
  assert.equal(reopened.nodes[0].data.label, 'Revised by agent');

  const validator = spawn(process.execPath, [path.join(skillDir, 'scripts/validate-scheme.mjs'), schemaPath], { stdio: 'ignore' });
  assert.equal((await once(validator, 'exit'))[0], 0, 'generated schema passes skill validator');
  console.log('skill.integration.test.mjs: generated schema → launcher → bundled backend → updated schema passed');
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  await rm(temp, { recursive: true, force: true });
}
