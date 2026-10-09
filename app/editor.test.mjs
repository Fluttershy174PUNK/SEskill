#!/usr/bin/env node
// Live backend regression: generated launcher resolves current JSON, not an embedded snapshot.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShortcut } from './create-shortcut.mjs';

const sourceApp = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(os.tmpdir(), 'seditor-http-test-'));
const appDir = path.join(temp, 'app');
let server;
let port;

async function unusedPort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  socket.close();
  await once(socket, 'close');
  return address.port;
}

async function waitForServer(base) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${base}/editor.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('SEditor test server did not start');
}

try {
  await mkdir(path.join(appDir, 'schemas'), { recursive: true });
  for (const file of ['editor.html', 'server.js', 'create-shortcut.mjs', 'shortcut.html', 'launcher.js']) {
    await writeFile(path.join(appDir, file), await readFile(path.join(sourceApp, file)));
  }
  const schemaRel = 'schemas/схема & flow.json';
  const schemaPath = path.join(appDir, schemaRel);
  const original = { version: 1, meta: { name: 'live-flow' }, nodes: [{ id: 'n1', type: 'shape', position: { x: 0, y: 0 }, width: 160, height: 80, data: { shape: 'rect', label: 'Start' } }], edges: [] };
  await writeFile(schemaPath, JSON.stringify(original));

  const launcher = await createShortcut(schemaRel, { appDir });
  assert.equal(path.basename(launcher.path), 'схема & flow.html');
  // Ярлык несёт саму схему и редиректит в общий редактор: открывается без сервера.
  assert.match(launcher.html, /#d=/, 'launcher must redirect into the editor with embedded data');
  assert.match(launcher.html, /"nodes"\s*:/, 'launcher must embed the schema so file:// works');
  assert.match(launcher.html, /<script type="application\/json" id="seditor-schema">/);
  assert.match(launcher.html, /embed-v1/);
  // Экранирование: ни одного лишнего </script> и никакого литерального "<".
  assert.doesNotMatch(launcher.html.split('id="seditor-schema">')[1].split('</script>')[0], /</);
  // Путь редактора и схемы — от папки ярлыка, с корректным кодированием.
  assert.match(launcher.html, /"\.\.\/editor\.html"/, 'editor path is relative to the launcher');
  // Путь схемы хранится сырым, а в query кодируется на месте — так пробелы/юникод/«&» не ломают URL.
  assert.match(launcher.html, /schemas\/схема & flow\.json/, 'raw schema path is embedded');
  assert.match(launcher.html, /'&p=' \+ encodeURIComponent\(/, 'schema path is encoded into the query at runtime');
  assert.match(launcher.html, /meta name="seditor-editor-sha256" content="[0-9a-f]{64}"/);

  port = await unusedPort();
  server = spawn(process.execPath, [path.join(appDir, 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  await waitForServer(base);

  const page = await fetch(`${base}/editor.html?path=${encodeURIComponent(schemaRel)}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /SEditor/);

  const readCurrent = async () => {
    const response = await fetch(`${base}/api/schema?path=${encodeURIComponent(schemaRel)}`);
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  assert.equal((await readCurrent()).nodes[0].data.label, 'Start');

  // Схема обновилась в JSON, но ярлык несёт свою копию данных — пока его не перегенерировали.
  const launcherBeforeEdit = await readFile(launcher.path, 'utf8');
  original.meta.name = 'updated-by-agent';
  original.nodes[0].data.label = 'Updated';
  await writeFile(schemaPath, JSON.stringify(original));
  assert.equal(await readFile(launcher.path, 'utf8'), launcherBeforeEdit);
  // Перегенерация возвращает ярлык в соответствие с JSON.
  const rebuilt = await createShortcut(schemaRel, { appDir });
  assert.match(rebuilt.html, /Updated/);
  assert.notEqual(rebuilt.html, launcherBeforeEdit);
  const updated = await readCurrent();
  assert.equal(updated.meta.name, 'updated-by-agent');
  assert.equal(updated.nodes[0].data.label, 'Updated');

  const badSchema = await fetch(`${base}/api/shortcut`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: 'schemas/missing.json' })
  });
  assert.equal(badSchema.status, 400);

  console.log('editor.test.mjs: live backend and path-launcher integration passed');
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  await rm(temp, { recursive: true, force: true });
}
