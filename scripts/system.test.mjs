#!/usr/bin/env node
// Комплексный системный тест: редактор + скилл + ярлыки.
//
// Проверяет реальные контракты, а не текст:
//   1. Сборка редактора: артефакт содержит офлайн-загрузку и проходит контрольные суммы.
//   2. Ярлык: inline-скрипт ИСПОЛНЯЕТСЯ в node:vm с заглушкой DOM; перехваченный
//      редирект разрешается в реальный файл editor.html, а вшитые данные проходят
//      полный round-trip (JSON -> \u003c-экранирование -> hash -> JSON).
//   3. Пути: глубокая папка, пробелы, юникод, «&», кавычки, кириллица.
//   4. Генераторы: вендорный и скилловый дают побайтово один ярлык; --check ловит устаревание.
//   5. backend: статика, /api/schema (чтение+запись), /api/schemas, /api/shortcut, /api/runtime,
//      защита от выхода за ROOT.
//   6. Скилл: sync-editor, validate-scheme, паритет с исходным репозиторием, ярлык на каждую схему.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(skillDir, '..');
const editorRepo = path.join(repoRoot, 'SEditor');
const temp = await mkdtemp(path.join(os.tmpdir(), 'seditor-system-'));
const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
};
const tests = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
};

const RUNTIME_FILES = ['editor.html', 'server.js', 'create-shortcut.mjs', 'shortcut.html', 'launcher.js', 'editor.test.mjs', 'version.test.mjs'];

async function unusedPort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const { port } = socket.address();
  socket.close();
  await once(socket, 'close');
  return port;
}

async function waitForServer(base, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`backend exited (${child.exitCode})`);
    try {
      const res = await fetch(`${base}/editor.html`);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`backend did not start at ${base}`);
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * Исполняет inline-скрипт ярлыка в песочнице с заглушкой DOM и возвращает
 * перехваченный location.replace — то, что реально произойдёт в браузере.
 */
function runLauncher(html) {
  const holder = html.match(/<script type="application\/json" id="seditor-schema">([\s\S]*?)<\/script>/);
  assert.ok(holder, 'launcher must contain the embedded schema holder');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1, 'launcher must have exactly one redirect script');
  let redirected = null;
  const sandbox = {
    document: { getElementById: (id) => (id === 'seditor-schema' ? { textContent: holder[1] } : null) },
    location: { replace: (url) => { redirected = url; } },
    encodeURIComponent
  };
  vm.createContext(sandbox);
  new vm.Script(scripts[0]).runInContext(sandbox);
  assert.ok(redirected, 'launcher script must call location.replace');
  return { embeddedRaw: holder[1], redirected };
}

/** Разбор перехваченного редиректа: абсолютный путь редактора + объект схемы. */
function parseRedirect(redirected, launcherAbs) {
  const url = new URL(redirected, pathToFileURL(launcherAbs));
  const params = new URLSearchParams(url.hash.replace(/^#/, ''));
  const data = params.get('d');
  assert.ok(data, 'redirect must carry #d=<schema>');
  return { editorPath: fileURLToPath(new URL(url.pathname, pathToFileURL(launcherAbs))), schema: JSON.parse(data), schemaPath: params.get('p') || '', url };
}

try {
  const appSrc = path.join(editorRepo, 'app');
  const skillApp = path.join(skillDir, 'app');

  // ---------------------------------------------------------------- 1. редактор
  await tests('editor: сборка содержит офлайн-загрузку, backend и создание ярлыков', async () => {
    const html = await readFile(path.join(appSrc, 'editor.html'), 'utf8');
    // Маркеры фич, которые появляются только после сборки новых исходников.
    for (const marker of ['showDirectoryPicker', '#d=', 'seditor-schema', 'node .SEditor/app/server.js', 'Create']) {
      assert.ok(html.includes(marker) || html.includes(marker.toLowerCase()), `editor.html must contain "${marker}"`);
    }
    // Разбор hash — это контракт ярлыка; проверяем, что он есть в бандле.
    assert.match(html, /location\.hash\.replace\(\/\^#\//, 'editor must parse the launcher hash');
  });

  await tests('editor: контрольные суммы релиза совпадают с манифестом', async () => {
    const manifest = JSON.parse(await readFile(path.join(appSrc, 'version.json'), 'utf8'));
    assert.equal(manifest.name, 'SEditor');
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.launcherFormat, 'embed-v1');
    for (const [file, expected] of Object.entries(manifest.files)) {
      assert.equal(sha256(await readFile(path.join(appSrc, file))), expected, `checksum mismatch: ${file}`);
    }
    for (const file of RUNTIME_FILES) assert.ok(manifest.files[file], `manifest must pin ${file}`);
  });

  await tests('editor: вендорная копия скилла идентична исходному репозиторию (8 файлов)', async () => {
    for (const file of [...RUNTIME_FILES, 'version.json']) {
      assert.deepEqual(await readFile(path.join(skillApp, file)), await readFile(path.join(appSrc, file)), `vendored differs: ${file}`);
    }
  });

  await tests('editor: version.json одинаков во всех трёх местах', async () => {
    const places = [path.join(appSrc, 'version.json'), path.join(skillApp, 'version.json'), path.join(skillDir, 'project-example/.SEditor/app/version.json')];
    const texts = await Promise.all(places.map((p) => readFile(p, 'utf8')));
    assert.equal(new Set(texts).size, 1, 'version manifest must be identical everywhere');
  });

  // ---------------------------------------------------------------- 2. ярлыки
  const hostileDir = path.join(temp, 'проект с пробелами & «кавычками»');
  const launcherRel = '.SEditor/logic-auth-flow.json';
  const schemaAbs = path.join(hostileDir, launcherRel);
  const schema = {
    version: 1,
    meta: { name: 'logic-auth-flow' },
    nodes: [
      { id: 'n1', type: 'shape', position: { x: 0, y: 0 }, width: 160, height: 80, data: { shape: 'rect', label: 'Старт <b> & "кавычки"' } },
      { id: 'n2', type: 'shape', position: { x: 240, y: 0 }, width: 160, height: 80, data: { shape: 'rect', label: '</script><img src=x onerror=alert(1)>' } },
      { id: 'n3', type: 'shape', position: { x: 480, y: 0 }, width: 160, height: 80, data: { shape: 'diamond', label: 'Юникод: ✓ é ü 中文' } }
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'right', targetHandle: 'left', type: 'straight' }]
  };

  await mkdir(path.join(hostileDir, '.SEditor/app'), { recursive: true });
  for (const file of RUNTIME_FILES) {
    await writeFile(path.join(hostileDir, '.SEditor/app', file), await readFile(path.join(appSrc, file)));
  }
  await writeFile(schemaAbs, JSON.stringify(schema, null, 2));

  const launcherAbs = schemaAbs.replace(/\.json$/, '.html');
  const generate = (which) =>
    new Promise((resolve, reject) => {
      const script = which === 'editor' ? path.join(appSrc, 'create-shortcut.mjs') : path.join(skillDir, 'scripts/create-shortcut.mjs');
      const args = which === 'editor' ? [schemaAbs] : [schemaAbs, launcherAbs, path.join(hostileDir, '.SEditor/app/editor.html')];
      const child = spawn(process.execPath, [script, ...args], { cwd: which === 'editor' ? path.join(hostileDir, '.SEditor/app') : hostileDir, stdio: 'ignore' });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${which} generator exited ${code}`))));
    });

  await tests('ярлык: генерируется враждебное имя папки, редирект ведёт в реальный editor.html', async () => {
    await generate('editor');
    const html = await readFile(launcherAbs, 'utf8');
    const { redirected } = runLauncher(html);
    const { editorPath } = parseRedirect(redirected, launcherAbs);
    assert.equal(editorPath, path.join(hostileDir, '.SEditor/app/editor.html'));
    await readFile(editorPath); // файл обязан существовать
  });

  await tests('ярлык: вшитые данные проходят полный round-trip (экранирование, hash, JSON)', async () => {
    const html = await readFile(launcherAbs, 'utf8');
    const { embeddedRaw, redirected } = runLauncher(html);
    // Инъекция невозможна: литерального "<" в блоке данных нет.
    assert.ok(!embeddedRaw.includes('<'), 'embedded JSON must not contain a literal "<"');
    assert.equal((html.match(/<\/script>/g) || []).length, 2, 'exactly two closing script tags expected');
    const { schema: parsed, schemaPath } = parseRedirect(redirected, launcherAbs);
    assert.deepEqual(parsed.nodes, schema.nodes, 'nodes must survive the round-trip');
    assert.deepEqual(parsed.edges, schema.edges, 'edges must survive the round-trip');
    assert.equal(parsed.nodes[1].data.label, '</script><img src=x onerror=alert(1)>', 'hostile label preserved verbatim');
    assert.equal(schemaPath, '../logic-auth-flow.json', 'schema path is relative to app/');
  });

  await tests('ярлык: путь схемы кодируется в query и не ломается спецсимволами', async () => {
    const html = await readFile(launcherAbs, 'utf8');
    const { url } = parseRedirect(runLauncher(html).redirected, launcherAbs);
    // В сыром URL не должно быть незакодированных пробелов/кавычек.
    assert.ok(!/[\s"<>]/.test(url.hash), `hash must be fully encoded: ${url.hash.slice(0, 80)}`);
    assert.equal(new URLSearchParams(url.hash.replace(/^#/, '')).get('p'), '../logic-auth-flow.json');
  });

  await tests('ярлык: вендорный и скилловый генераторы дают побайтово одинаковый файл', async () => {
    await generate('editor');
    const fromEditor = await readFile(launcherAbs, 'utf8');
    await generate('skill');
    const fromSkill = await readFile(launcherAbs, 'utf8');
    assert.equal(fromEditor, fromSkill, 'both generators must produce identical launchers');
  });

  await tests('ярлык: --check ловит устаревание и проходит после перегенерации', async () => {
    const checkLauncher = () =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(skillDir, 'scripts/create-shortcut.mjs'), schemaAbs, launcherAbs, path.join(hostileDir, '.SEditor/app/editor.html'), '--check'], { cwd: hostileDir, stdio: 'ignore' });
        child.on('exit', (code) => resolve(code));
      });
    assert.equal(await checkLauncher(), 0, 'fresh launcher must pass --check');
    const updated = { ...schema, meta: { name: 'logic-auth-flow' }, nodes: [...schema.nodes, { id: 'n4', type: 'shape', position: { x: 720, y: 0 }, width: 160, height: 80, data: { shape: 'rect', label: 'Новый узел' } }] };
    await writeFile(schemaAbs, JSON.stringify(updated, null, 2));
    assert.equal(await checkLauncher(), 1, '--check must fail once the JSON changed');
    await generate('skill');
    assert.equal(await checkLauncher(), 0, '--check must pass again after regeneration');
  });

  // ---------------------------------------------------------------- 3. backend
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  const projectRoot = path.join(temp, 'backend-demo');
  await mkdir(path.join(projectRoot, '.SEditor/app'), { recursive: true });
  for (const file of [...RUNTIME_FILES, 'version.json']) {
    await writeFile(path.join(projectRoot, '.SEditor/app', file), await readFile(path.join(appSrc, file)));
  }
  await writeFile(path.join(projectRoot, '.SEditor', 'demo-flow.json'), JSON.stringify(schema, null, 2));
  await writeFile(path.join(projectRoot, 'secret.txt'), 'must not be served');

  let server;
  await tests('backend: статика, файловый API, runtime и защита ROOT', async () => {
    server = spawn(process.execPath, [path.join(projectRoot, '.SEditor/app/server.js')], {
      cwd: projectRoot,
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
      stdio: 'ignore'
    });
    await waitForServer(base, server);

    const page = await fetch(`${base}/editor.html`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /SEditor/);

    const read = await fetch(`${base}/api/schema?path=${encodeURIComponent('../demo-flow.json')}`);
    assert.equal(read.status, 200);
    assert.equal((await read.json()).data.nodes.length, schema.nodes.length);

    // Список схем: сами схемы, а не служебный version.json.
    const list = await (await fetch(`${base}/api/schemas`)).json();
    const names = list.items.map((i) => i.name);
    assert.ok(names.includes('demo-flow'), `demo-flow must be listed, got ${JSON.stringify(names)}`);
    assert.ok(!names.includes('version'), 'version.json must not be listed as a schema');

    // Запись схемы.
    const next = { ...schema, meta: { name: 'demo-flow' }, nodes: [...schema.nodes, { id: 'n9', type: 'shape', position: { x: 900, y: 0 }, width: 160, height: 80, data: { shape: 'rect', label: 'Записан' } }] };
    const write = await fetch(`${base}/api/schema`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: '../demo-flow.json', data: next }) });
    assert.equal(write.status, 200);
    const onDisk = JSON.parse(await readFile(path.join(projectRoot, '.SEditor', 'demo-flow.json'), 'utf8'));
    assert.equal(onDisk.nodes.length, next.nodes.length);
    assert.ok(onDisk.meta.updated, 'backend must stamp meta.updated');

    // Создание ярлыка через backend и его валидность.
    const shortcut = await fetch(`${base}/api/shortcut`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: '../demo-flow.json' }) });
    assert.equal(shortcut.status, 200);
    assert.equal((await shortcut.json()).saved, true);
    const served = await readFile(path.join(projectRoot, '.SEditor', 'demo-flow.html'), 'utf8');
    const { editorPath } = parseRedirect(runLauncher(served).redirected, path.join(projectRoot, '.SEditor', 'demo-flow.html'));
    assert.equal(editorPath, path.join(projectRoot, '.SEditor/app/editor.html'));

    // runtime отдаёт ровно запинованные файлы.
    const runtime = await (await fetch(`${base}/api/runtime`)).json();
    assert.equal(runtime.version, JSON.parse(await readFile(path.join(appSrc, 'version.json'), 'utf8')).version);
    for (const file of RUNTIME_FILES) assert.ok(runtime.files[file], `runtime must expose ${file}`);

    // Выход за ROOT через статику запрещён.
    const escape = await fetch(`${base}/../secret.txt`);
    assert.ok([403, 404].includes(escape.status), `path traversal must be blocked, got ${escape.status}`);

    // Ошибки не валят сервер.
    const bad = await fetch(`${base}/api/schema?path=${encodeURIComponent('../missing.json')}`);
    assert.equal(bad.status, 404);
    assert.equal((await fetch(`${base}/editor.html`)).status, 200, 'server must stay alive after errors');
  });

  // ---------------------------------------------------------------- 4. скилл
  await tests('скилл: sync-editor ставит рантайм, сохраняет пользовательские файлы', async () => {
    const project = path.join(temp, 'sync-demo');
    await mkdir(path.join(project, '.SEditor/app'), { recursive: true });
    await writeFile(path.join(project, '.SEditor/app/user-note.txt'), 'keep me');
    await writeFile(path.join(project, '.SEditor/my-schema.json'), JSON.stringify(schema));
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(skillDir, 'scripts/sync-editor.mjs'), project], { stdio: 'ignore' });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`sync exited ${code}`))));
    });
    for (const file of [...RUNTIME_FILES, 'version.json']) {
      assert.deepEqual(await readFile(path.join(project, '.SEditor/app', file)), await readFile(path.join(appSrc, file)), `installed differs: ${file}`);
    }
    assert.equal(await readFile(path.join(project, '.SEditor/app/user-note.txt'), 'utf8'), 'keep me', 'user file must survive');
    assert.equal(JSON.parse(await readFile(path.join(project, '.SEditor/my-schema.json'), 'utf8')).nodes.length, schema.nodes.length, 'schema must survive');
  });

  await tests('скилл: каждая схема примера валидна и имеет парный ярлык с round-trip', async () => {
    const dir = path.join(skillDir, 'project-example/.SEditor');
    const schemas = (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'version.json');
    assert.ok(schemas.length > 0, 'example must contain schemas');
    for (const file of schemas) {
      const jsonPath = path.join(dir, file);
      const launcherPath = jsonPath.replace(/\.json$/, '.html');
      const raw = JSON.parse(await readFile(jsonPath, 'utf8'));
      assert.equal(raw.version, 1);
      assert.equal(raw.meta.name, file.replace(/\.json$/, ''), `${file}: meta.name must match filename`);
      const html = await readFile(launcherPath, 'utf8');
      const { schema: baked } = parseRedirect(runLauncher(html).redirected, launcherPath);
      assert.deepEqual(baked.nodes, raw.nodes, `${file}: launcher must match its JSON`);
      const { editorPath } = parseRedirect(runLauncher(html).redirected, launcherPath);
      assert.equal(editorPath, path.join(dir, 'app/editor.html'), `${file}: redirect must target the bundled editor`);
    }
  });

  await tests('скилл: SKILL.md и AGENTS.md описывают контракт ярлыка и версии', async () => {
    const skill = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    const agents = await readFile(path.join(skillDir, 'AGENTS.md'), 'utf8');
    assert.match(skill, /regenerate/i, 'SKILL.md must require launcher regeneration');
    assert.match(skill, /embed-v1|встраива|embedded/i, 'SKILL.md must document embedded data');
    assert.match(agents, /github\.com\/Fluttershy174PUNK\/SEditor/, 'AGENTS.md must link the editor repo');
    assert.match(agents, /sync-editor\.mjs/, 'AGENTS.md must document the sync path');
  });

  // ---------------------------------------------------------------- отчёт
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : `\n       ${r.error}`}`);
  }
  console.log(`\nsystem.test.mjs: ${results.length - failed.length}/${results.length} проверок пройдено`);
  if (failed.length) process.exitCode = 1;
} finally {
  if (typeof server !== 'undefined' && server && server.exitCode === null) {
    server.kill('SIGTERM');
    server.unref();
    await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  await rm(temp, { recursive: true, force: true });
  // Тест-раннер: явно выходим, иначе keep-alive сокеты fetch и handle детей
  // держат event loop и скрипт висит после отчёта.
  process.exit(process.exitCode ?? 0);
}
