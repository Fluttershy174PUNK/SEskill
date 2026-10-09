#!/usr/bin/env node
// Тонкая обёртка: скилл использует ТОТ ЖЕ генератор ярлыков, что и вендорный
// редактор (app/create-shortcut.mjs + app/shortcut.html). Своего формата нет,
// поэтому шаблон и рендер не могут разойтись с редактором.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShortcut, renderShortcut } from '../app/create-shortcut.mjs';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [schemaArg, launcherArg, editorArg, mode] = process.argv.slice(2);
if (!schemaArg || !launcherArg || !editorArg || (mode && mode !== '--check')) {
  console.error('usage: node scripts/create-shortcut.mjs <schema.json> <launcher.html> <editor.html> [--check]');
  process.exit(1);
}
const schemaPath = path.resolve(schemaArg);
const launcherPath = path.resolve(launcherArg);
const editorDir = path.dirname(path.resolve(editorArg));
if (launcherPath !== path.resolve(schemaPath.replace(/\.json$/i, '.html'))) throw new Error('launcher must be next to the schema with the same basename');
const candidates = [path.resolve(skillDir, 'app'), path.resolve(path.dirname(schemaPath), 'app')];
if (!candidates.includes(editorDir) || path.basename(path.resolve(editorArg)) !== 'editor.html') throw new Error('editor must be the matching bundled app/editor.html');

// editorDir — это app/ редактора; appDir у генератора имеет тот же смысл.
const options = { appDir: editorDir };
if (mode === '--check') {
  const expected = await renderShortcut(schemaPath, options);
  let current;
  try { current = await readFile(launcherPath, 'utf8'); } catch { current = null; }
  if (current !== expected) {
    console.error(`${launcherArg}: missing or stale launcher`);
    process.exit(1);
  }
  console.log(`ok ${launcherArg}`);
} else {
  const result = await createShortcut(schemaPath, options);
  console.log(`created ${result.path}`);
}
