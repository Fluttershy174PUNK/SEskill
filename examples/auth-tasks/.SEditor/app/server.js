// SEditor backend: отдаёт editor.html + файловый API для схем и PNG.
// Зависимостей нет — только node:http/node:fs.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createShortcut } from './create-shortcut.mjs';

// База — сам каталог app/: скопированная папка app/ работает автономно.
const APP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = APP;
const HOME = path.resolve(APP, '..');
const EDITOR = path.join(APP, 'editor.html');
const PORT = Number(process.env.PORT || 5174);
// Слушаем только localhost: файловый API отдаёт/пишет любые пути диска.
// Для запуска «на сервере» задайте HOST=0.0.0.0 — но только на доверенной машине.
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 64 * 1024 * 1024;

// Папки со схемами для списка последних: сам app/, корень проекта рядом с ним
// (в раскладке .SEditor/ схемы лежат рядом с app/) и catalog example_scheme/.
// Папка, которой нет, просто пропускается.
const SCHEMA_DIRS = [...new Set([HOME, APP, path.join(HOME, 'example_scheme')])].filter((dir) => fs.existsSync(dir));
// Служебные json (манифесты, конфиги) в списке схем не нужны.
const MANIFESTS = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'jsconfig.json', 'components.json', 'version.json']);
const SCAN_SKIP = new Set(['node_modules', 'src', '.git', '.build', 'dev-dist']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png'
};

const resolveInside = (rel) => {
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
};

// Файловый API работает с любой директорией диска: абсолютный путь или от app/.
// Статика по-прежнему отдаётся только изнутри ROOT (см. resolveInside).
const resolveAny = (rel) => path.resolve(ROOT, rel || '.');

// Показываем абсолютный путь, если файл лежит вне проекта.
const toRel = (abs) => {
  const rel = path.relative(ROOT, abs);
  return rel.startsWith('..') ? abs : rel.split(path.sep).join('/');
};

async function scanSchemas() {
  const found = [];
  const walk = async (dir, depth) => {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SCAN_SKIP.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth > 0) await walk(abs, depth - 1);
      } else if (entry.name.toLowerCase().endsWith('.json') && !MANIFESTS.has(entry.name)) {
        const stat = await fsp.stat(abs).catch(() => null);
        if (stat) found.push({ path: toRel(abs), name: entry.name.replace(/\.json$/i, ''), mtime: stat.mtimeMs, size: stat.size });
      }
    }
  };
  for (const dir of SCHEMA_DIRS) await walk(dir, 2);
  return found.sort((a, b) => b.mtime - a.mtime);
}

const json = (res, code, value) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const rel = decodeURIComponent(url.pathname);
  // Ссылки на /assets/* в собранном файле не нужны, но пусть отдаются, если есть.
  const file = rel === '/' || rel === '' || rel === '/editor.html' ? 'editor.html' : rel.slice(1);
  const abs = resolveInside(file);
  const stat = abs && (await fsp.stat(abs).catch(() => null));
  if (!stat?.isFile()) {
    return json(res, 404, { error: 'not found', hint: 'Соберите страницу: npm run build' });
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(abs)] || 'application/octet-stream',
    'cache-control': 'no-cache'
  });
  fs.createReadStream(abs).pipe(res);
}

async function api(req, res, url) {
  const action = url.pathname.slice('/api/'.length);

  if (action === 'schemas' && req.method === 'GET') {
    return json(res, 200, { root: ROOT, items: await scanSchemas() });
  }

  if (action === 'fs' && req.method === 'GET') {
    // Листинг любой директории для диалога открытия/сохранения.
    const dir = resolveAny(url.searchParams.get('path') || '');
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => null);
    if (!entries) return json(res, 404, { error: 'not found' });
    const dirs = [];
    const files = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        dirs.push({ name: entry.name });
      } else if (entry.name.toLowerCase().endsWith('.json') && !MANIFESTS.has(entry.name)) {
        const stat = await fsp.stat(path.join(dir, entry.name)).catch(() => null);
        files.push({ name: entry.name, mtime: stat?.mtimeMs ?? 0 });
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return json(res, 200, { path: dir, parent: path.dirname(dir), dirs, files });
  }

  if (action === 'schema' && req.method === 'GET') {
    const abs = resolveAny(url.searchParams.get('path') || '');
    const stat = abs && (await fsp.stat(abs).catch(() => null));
    if (!stat?.isFile()) return json(res, 404, { error: 'not found' });
    const parsed = parseJson(await fsp.readFile(abs, 'utf8'));
    if (!parsed) return json(res, 422, { error: 'invalid json in schema file' });
    return json(res, 200, { path: toRel(abs), data: parsed });
  }

  if (action === 'runtime' && req.method === 'GET') {
    const manifest = parseJson(await fsp.readFile(path.join(APP, 'version.json'), 'utf8'));
    if (!manifest || manifest.name !== 'SEditor' || !manifest.files) return json(res, 500, { error: 'invalid SEditor runtime manifest' });
    const files = {};
    for (const [file, expected] of Object.entries(manifest.files)) {
      if (!['editor.html', 'server.js', 'create-shortcut.mjs', 'shortcut.html', 'launcher.js'].includes(file)) {
        return json(res, 500, { error: `unexpected runtime file: ${file}` });
      }
      const data = await fsp.readFile(path.join(APP, file));
      const hash = createHash('sha256').update(data).digest('hex');
      if (hash !== expected) return json(res, 409, { error: `runtime integrity check failed: ${file}` });
      files[file] = data.toString('base64');
    }
    return json(res, 200, { version: manifest.version, files });
  }

  if (action === 'shortcut' && req.method === 'POST') {
    const payload = parseJson(await readBody(req));
    if (!payload || typeof payload.path !== 'string') return json(res, 400, { error: 'schema path required' });
    try {
      const result = await createShortcut(payload.path, { appDir: ROOT, port: PORT });
      return json(res, 200, { path: toRel(result.path), saved: true });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (action === 'schema' && req.method === 'POST') {
    const payload = parseJson(await readBody(req));
    if (!payload) return json(res, 400, { error: 'invalid json body' });
    const { path: rel = '', data } = payload;
    const abs = resolveAny(rel);
    if (!abs || !abs.toLowerCase().endsWith('.json')) return json(res, 400, { error: 'bad path' });
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    const entry = typeof data === 'object' && data !== null ? data : {};
    entry.meta = { ...(entry.meta || {}), path: toRel(abs), updated: new Date().toISOString() };
    await fsp.writeFile(abs, JSON.stringify(entry, null, 2), 'utf8');
    return json(res, 200, { path: toRel(abs), saved: true });
  }

  if (action === 'png' && req.method === 'POST') {
    const payload = parseJson(await readBody(req));
    if (!payload) return json(res, 400, { error: 'invalid json body' });
    const { path: rel = '', dataUrl = '' } = payload;
    const abs = resolveAny(rel);
    if (!abs || !abs.toLowerCase().endsWith('.png') || !String(dataUrl).startsWith('data:image/png;base64,')) {
      return json(res, 400, { error: 'bad png payload' });
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
    return json(res, 200, { path: toRel(abs), saved: true });
  }

  return json(res, 404, { error: 'unknown api', action });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(req, res);
  } catch (err) {
    json(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `SEditor server: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/editor.html  (root: ${ROOT})\n` +
      (fs.existsSync(EDITOR) ? '' : 'Внимание: editor.html не собран, выполните npm run build\n')
  );
});

export { ROOT, SCHEMA_DIRS };
