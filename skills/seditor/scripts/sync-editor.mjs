#!/usr/bin/env node
// Install/update the managed SEditor/app runtime files as one verified release.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(skillDir, 'app');

// Каталог вывода: <project-root>/SEditor, либо явно заданный пользователем,
// либо legacy .SEditor (проекты, созданные скиллом до 0.7).
export function resolveOutputDir(projectRoot, outDir) {
  if (outDir) return path.resolve(projectRoot, outDir);
  const modern = path.join(projectRoot, 'SEditor');
  const legacy = path.join(projectRoot, '.SEditor');
  return existsSync(modern) || !existsSync(legacy) ? modern : legacy;
}

export async function syncEditor(projectRoot, { sourceAppDir = appDir, outDir } = {}) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(sourceAppDir, 'version.json'), 'utf8'));
  } catch (error) {
    throw new Error(`invalid bundled app/version.json: ${error.message}`);
  }
  if (manifest.name !== 'SEditor' || manifest.schemaVersion !== 1 || manifest.launcherFormat !== 'embed-v1') {
    throw new Error('unsupported SEditor app/version.json contract');
  }
  const outputDir = resolveOutputDir(projectRoot, outDir);
  const rootHtml = path.join(outputDir, 'SEditor.html');
  const rootSource = await readFile(path.join(sourceAppDir, 'editor.html'));
  if (createHash('sha256').update(rootSource).digest('hex') !== manifest.files['editor.html']) {
    throw new Error('skill editor bundle checksum failed: editor.html');
  }
  const targetDir = path.join(outputDir, 'app');
  const currentRoot = await readFile(rootHtml).catch(() => null);
  const previousEditor = await readFile(path.join(targetDir, 'editor.html')).catch(() => null);
  if (currentRoot && !currentRoot.equals(rootSource) && (!previousEditor || !currentRoot.equals(previousEditor))) {
    throw new Error(`${rootHtml} exists and is not the managed SEditor copy; preserving it`);
  }
  let existed = false;
  try { existed = JSON.parse(await readFile(path.join(targetDir, 'version.json'), 'utf8')).version === manifest.version; } catch {}
  if (!manifest.files || typeof manifest.files !== 'object') throw new Error('editor version manifest has no file checksums');
  await mkdir(targetDir, { recursive: true });
  const installed = [];
  for (const [file, expectedHash] of Object.entries(manifest.files)) {
    if (!['editor.html', 'server.js', 'create-shortcut.mjs', 'shortcut.html', 'launcher.js'].includes(file)) {
      throw new Error(`refusing to install unrecognized runtime file: ${file}`);
    }
    const source = await readFile(path.join(sourceAppDir, file));
    const actualHash = createHash('sha256').update(source).digest('hex');
    if (actualHash !== expectedHash) throw new Error(`skill editor bundle checksum failed: ${file}`);
    const current = await readFile(path.join(targetDir, file)).catch(() => null);
    if (!current?.equals(source)) await writeFile(path.join(targetDir, file), source);
    installed.push(file);
  }
  const runtimeFiles = ['editor.html', 'server.js', 'create-shortcut.mjs', 'shortcut.html', 'launcher.js'];
  // editor.test.mjs / version.test.mjs когда-то ставились сюда — теперь это только
  // тесты репозитория редактора. managedFiles шире installed: старые установки чистим.
  const managedFiles = [...runtimeFiles, 'editor.test.mjs', 'version.test.mjs'];
  if (runtimeFiles.some((file) => !installed.includes(file))) throw new Error('editor manifest omits a required runtime file');
  for (const file of await readdir(targetDir)) {
    if (managedFiles.includes(file) && !installed.includes(file)) await rm(path.join(targetDir, file));
  }
  const rootHtmlChanged = !currentRoot?.equals(rootSource);
  if (rootHtmlChanged) await writeFile(rootHtml, rootSource);
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const oldManifest = await readFile(path.join(targetDir, 'version.json'), 'utf8').catch(() => null);
  if (oldManifest !== manifestText) await writeFile(path.join(targetDir, 'version.json'), manifestText);
  return { targetDir, version: manifest.version, files: Object.keys(manifest.files), changed: !existed || rootHtmlChanged };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [projectRootArg, outDirArg] = process.argv.slice(2);
  const projectRoot = projectRootArg || process.cwd();
  try {
    const result = await syncEditor(projectRoot, { outDir: outDirArg });
    console.log(`SEditor ${result.version} installed: ${result.targetDir} and ${path.join(result.targetDir, '..', 'SEditor.html')}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
