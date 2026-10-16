#!/usr/bin/env node
// Dependency-free structural validator for the portable seditor skill bundle.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = path.join(repoRoot, 'skills/seditor');
const evalsDir = path.join(repoRoot, 'tests/evals');
const errors = [];
const check = (condition, message) => condition || errors.push(message);

const skillMd = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
const frontmatter = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
check(Boolean(frontmatter), 'SKILL.md must start with YAML frontmatter');
if (frontmatter) {
  const fm = frontmatter[1];
  const name = fm.match(/^name:\s*([^\s#]+)/m)?.[1] || '';
  const description = fm.match(/^description:\s*([\s\S]*?)(?=\n[a-z-]+:|$)/m)?.[1]?.trim() || '';
  const metadataText = fm.match(/^metadata:\s*\n((?:[ \t]+.*\n?)*)/m)?.[1] || '';
  check(!metadataText || metadataText.split('\n').filter(Boolean).every((line) => /^\s+[\w.-]+:\s*[^\s#].*$/.test(line)), 'metadata must be a string-to-string YAML map');
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64, 'frontmatter name invalid');
  check(name === 'seditor', 'frontmatter name must be seditor');
  check(path.basename(skillDir) === 'seditor', 'payload must live at skills/seditor (directory name matches frontmatter name)');
  check(description.length > 0 && description.length <= 1024, 'frontmatter description must be 1..1024 chars');
  const license = fm.match(/^license:\s*(.*)$/m)?.[1];
  const compatibility = fm.match(/^compatibility:\s*(.*)$/m)?.[1];
  check(license === undefined || license.length > 0, 'license must not be empty');
  check(compatibility === undefined || (compatibility.length > 0 && compatibility.length <= 500), 'compatibility must be 1..500 chars');
  for (const field of ['license', 'compatibility', 'metadata', 'allowed-tools']) {
    check((fm.match(new RegExp(`^${field}:`, 'gm')) || []).length <= 1, `frontmatter field repeats: ${field}`);
  }
}
check(skillMd.split('\n').length < 500, 'SKILL.md must stay under 500 lines');
check(!skillMd.includes('Re-running overwrites'), 'SKILL.md still contains outdated overwrite guidance');
check(skillMd.includes('scripts/sync-editor.mjs'), 'SKILL.md must use the managed bundle sync script');

let manifest;
try { manifest = JSON.parse(await readFile(path.join(skillDir, 'app/version.json'), 'utf8')); } catch (error) {
  errors.push(`app/version.json invalid: ${error.message}`);
  manifest = { files: {} };
}
check(manifest.name === 'SEditor' && manifest.version === '0.7.0' && manifest.schemaVersion === 1 && manifest.launcherFormat === 'embed-v1', 'editor manifest contract mismatch');
for (const file of ['editor.html', 'server.js', 'create-shortcut.mjs', 'shortcut.html', 'launcher.js']) {
  const bundled = await readFile(path.join(skillDir, 'app', file));
  const hash = createHash('sha256').update(bundled).digest('hex');
  check(manifest.files[file] === hash, `SEditor version manifest checksum mismatch: ${file}`);
}

const script = await readFile(path.join(skillDir, 'scripts/create-shortcut.mjs'), 'utf8');
const manifestText = await readFile(path.join(skillDir, 'app/version.json'), 'utf8');
check(skillMd.includes('app/version.json'), 'SKILL.md should mention the bundled runtime manifest');
const workflowText = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
check(workflowText.includes('scripts/sync-editor.mjs') && workflowText.includes('scripts/create-shortcut.mjs') && workflowText.includes('scripts/validate-project.mjs'), 'skill workflow should call bundled runtime, launcher, and project validation scripts');
for (const file of ['assets/example-scheme.json', 'scripts/sync-editor.mjs', 'scripts/create-shortcut.mjs', 'scripts/validate-scheme.mjs', 'scripts/validate-project.mjs', 'app/version.json', 'LICENSE']) {
  check(workflowText.includes(file) || skillMd.includes(file), `SKILL.md should reference resource: ${file}`);
}
check(script.includes('createShortcut') && script.includes('renderShortcut'), 'skill launcher wrapper must delegate to the bundled generator');
check(manifestText.includes('embed-v1'), 'launcher format missing from release manifest');
const testScript = await readFile(path.join(repoRoot, 'tests/shortcut.test.mjs'), 'utf8');
check(testScript.includes("assert.deepEqual(readFileSync(join(bundledEditor"), 'launcher test must assert editor-version parity');
const skillTests = await readFile(path.join(repoRoot, 'tests/validate-scheme.test.mjs'), 'utf8');
check(skillTests.includes('malformed') && skillTests.includes('missing'), 'schema validator tests must cover bad and missing input');
const integrationTest = await readFile(path.join(repoRoot, 'tests/skill.integration.test.mjs'), 'utf8');
check(integrationTest.includes('logic-demo-revised') && integrationTest.includes('validate-scheme.mjs'), 'skill integration test must cover live schema revisions and validation');
const syncScript = await readFile(path.join(skillDir, 'scripts/sync-editor.mjs'), 'utf8');
check(syncScript.includes('checksum failed') && syncScript.includes('version.json'), 'skill editor sync must check bundle integrity');
const syncTest = await readFile(path.join(repoRoot, 'tests/sync-editor.test.mjs'), 'utf8');
check(syncTest.includes('old-editor.js') && syncTest.includes('checksum failed'), 'skill sync tests must cover stale files and tampering');
const validator = await readFile(path.join(skillDir, 'scripts/validate-scheme.mjs'), 'utf8');
check(validator.includes("data.shape") && validator.includes('sourceHandle'), 'schema validator missing core checks');
const projectValidator = await readFile(path.join(skillDir, 'scripts/validate-project.mjs'), 'utf8');
check(projectValidator.includes('validate-scheme.mjs') && projectValidator.includes('--check'), 'project validator should combine schema and launcher freshness checks');

const examples = [
  path.join(repoRoot, 'examples/auth-tasks/SEditor'),
  path.join(skillDir, 'assets')
];
for (const directory of examples) {
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.json') || ['package.json', 'package-lock.json'].includes(file)) continue;
    const schemaPath = path.join(directory, file);
    const launcherPath = schemaPath.replace(/\.json$/i, '.html');
    let schema;
    try { schema = JSON.parse(await readFile(schemaPath, 'utf8')); } catch (error) {
      errors.push(`${path.relative(skillDir, schemaPath)} invalid JSON: ${error.message}`);
      continue;
    }
    check(schema.version === 1 && Array.isArray(schema.nodes) && Array.isArray(schema.edges), `${file} is not SEditor v1`);
    const launcher = await readFile(launcherPath, 'utf8').catch(() => null);
    check(Boolean(launcher), `${file} has no same-name HTML launcher`);
    if (launcher) {
      // Ярлык несёт схему внутри (file:// не читает соседний JSON) и обязан
      // перегенерироваться после правок; проверяем встраивание и путь.
      check(launcher.includes('id="seditor-schema">') && /"/.test(launcher), `${path.basename(launcherPath)} must embed the schema`);
      check(launcher.includes('\u003c') || !/"[^"]*</.test(launcher), `${path.basename(launcherPath)} must escape "<" in embedded data`);
      check(launcher.includes('encodeURIComponent'), `${path.basename(launcherPath)} must encode the schema path at runtime`);
    }
  }
}

let evalFile;
try { evalFile = JSON.parse(await readFile(path.join(evalsDir, 'evals.json'), 'utf8')); } catch (error) {
  errors.push(`evals/evals.json invalid: ${error.message}`);
  evalFile = { evals: [] };
}
check(evalFile.skill_name === 'seditor' && Array.isArray(evalFile.evals) && evalFile.evals.length >= 6, 'evals.json needs 6+ cases for seditor');
let triggerQueries;
try { triggerQueries = JSON.parse(await readFile(path.join(evalsDir, 'eval_queries.json'), 'utf8')); } catch (error) {
  errors.push(`evals/eval_queries.json invalid: ${error.message}`);
  triggerQueries = [];
}
check(Array.isArray(triggerQueries) && triggerQueries.length >= 8, 'eval_queries.json needs positive and near-miss trigger cases');
if (Array.isArray(triggerQueries)) {
  check(triggerQueries.some((q) => q.should_trigger === true), 'trigger eval set needs positive cases');
  check(triggerQueries.some((q) => q.should_trigger === false), 'trigger eval set needs negative near-miss cases');
}
const ids = new Set();
for (const item of evalFile.evals || []) {
  check(typeof item.id === 'string' && item.id, 'each eval needs a string id');
  check(!ids.has(item.id), `duplicate eval id: ${item.id}`);
  ids.add(item.id);
  check(typeof item.prompt === 'string' && item.prompt.trim(), `eval ${item.id} prompt missing`);
  check(typeof item.expected_output === 'string' && item.expected_output.trim(), `eval ${item.id} expected_output missing`);
  check(Array.isArray(item.assertions) && item.assertions.length > 0, `eval ${item.id} assertions missing`);
}

// Что именно устанавливается: единственный allowlist пакета. Лишний файл внутри
// skills/seditor/ — ошибка (например, забытый тест или промежуточный артефакт).
const allowedPayload = new Set([
  'SKILL.md',
  'LICENSE',
  'references/schema-format.md',
  'scripts/sync-editor.mjs',
  'scripts/create-shortcut.mjs',
  'scripts/validate-scheme.mjs',
  'scripts/validate-project.mjs',
  'assets/example-scheme.json',
  'assets/example-scheme.html',
  'app/editor.html',
  'app/server.js',
  'app/create-shortcut.mjs',
  'app/shortcut.html',
  'app/launcher.js',
  'app/version.json'
]);
const walk = async (dir) => {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else found.push(path.relative(skillDir, full));
  }
  return found;
};
const payloadFiles = await walk(skillDir);
for (const file of payloadFiles) {
  check(allowedPayload.has(file), `unexpected file in installable payload: ${file}`);
}
check(payloadFiles.length === allowedPayload.size,
  `payload must be exactly ${allowedPayload.size} files, found ${payloadFiles.length}`);

if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exitCode = 1;
} else {
  console.log(`skill validation passed: ${evalFile.evals.length} eval cases, app version ${manifest.version}`);
}
