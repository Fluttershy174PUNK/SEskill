#!/usr/bin/env node
// Validate every schema and its generated HTML launcher in one read-only pass.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(process.argv[2] || process.cwd());
const schemaDir = path.join(projectRoot, '.SEditor');
let entries;
try {
  entries = await readdir(schemaDir);
} catch (error) {
  console.error(`Cannot read ${schemaDir}: ${error.message}`);
  process.exit(1);
}
const schemas = entries.filter((file) => file.endsWith('.json') && file !== 'package.json');
if (!schemas.length) {
  console.error(`No schema JSON files found in ${schemaDir}`);
  process.exit(1);
}

const run = (script, args) => {
  const result = spawnSync(process.execPath, [path.join(skillDir, 'scripts', script), ...args], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
};
const paths = schemas.map((file) => path.join(schemaDir, file));
let status = run('validate-scheme.mjs', paths);
for (const schema of paths) {
  const launcher = schema.replace(/\.json$/i, '.html');
  const result = run('create-shortcut.mjs', [schema, launcher, path.join(projectRoot, '.SEditor/app/editor.html'), '--check']);
  if (result) status = result;
}
if (!status) console.log(`ok    ${schemas.length} schema(s) and matching launcher(s)`);
process.exit(status);
