#!/usr/bin/env node
// Generate an HTML launcher that carries the schema itself and redirects into the
// bundled editor. Opening it by double click (file://) needs no local server;
// the backend is only for recents and direct disk writes.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLauncher, urlPath } from './launcher.js';

const APP = path.dirname(fileURLToPath(import.meta.url));

export async function renderShortcut(schemaPath, { appDir = process.cwd(), name: overrideName } = {}) {
  const abs = path.resolve(appDir, schemaPath);
  if (path.extname(abs).toLowerCase() !== '.json') throw new Error('schema path must end with .json');
  let schema;
  try {
    schema = JSON.parse(await readFile(abs, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read schema: ${error.message}`);
  }
  if (schema.version !== 1 || !Array.isArray(schema.nodes) || !Array.isArray(schema.edges)) throw new Error('not a valid SEditor v1 schema');

  // Ярлык лежит рядом со схемой; редактор — общий, в app/.
  const launcherAbs = abs.replace(/\.json$/i, '.html');
  const editorAbs = path.join(appDir, 'editor.html');
  const editorUrl = urlPath(path.relative(path.dirname(launcherAbs), editorAbs));
  // Путь схемы берём сырым: ярлык сам кодирует его в query (encodeURIComponent).
  const schemaParam = path.relative(appDir, abs).split(path.sep).join('/');
  const editorSha = createHash('sha256').update(await readFile(editorAbs)).digest('hex');

  const template = await readFile(path.join(APP, 'shortcut.html'), 'utf8');
  return renderLauncher(template, {
    schema,
    name: overrideName || schema.meta?.name || path.basename(abs, '.json'),
    editorUrl,
    schemaPathParam: schemaParam,
    editorSha,
    serverCommand: 'node .SEditor/app/server.js'
  });
}

export async function createShortcut(schemaPath, options = {}) {
  const appDir = options.appDir || process.cwd();
  const abs = path.resolve(appDir, schemaPath);
  const contents = await renderShortcut(schemaPath, { ...options, appDir });
  const output = abs.replace(/\.json$/i, '.html');
  await writeFile(output, contents, 'utf8');
  return { path: output, html: contents };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , schemaPath] = process.argv;
  if (!schemaPath) {
    console.error('usage: node create-shortcut.mjs <schema.json>');
    process.exit(1);
  }
  try {
    const result = await createShortcut(schemaPath, { appDir: process.cwd() });
    console.log(`created ${result.path}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
