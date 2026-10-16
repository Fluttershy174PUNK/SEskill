#!/usr/bin/env node
// Grade observable output assertions against an explicit run directory.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , runDir] = process.argv;
if (!runDir) {
  console.error('usage: node tests/grade-evals.mjs <eval-run-dir>');
  process.exit(2);
}
let evals;
try { evals = JSON.parse(await readFile(path.join(repoRoot, 'tests/evals/evals.json'), 'utf8')); } catch (error) {
  console.error(`invalid evals/evals.json: ${error.message}`);
  process.exit(1);
}
const root = path.resolve(runDir);
if (!root.startsWith(`${path.resolve(process.cwd())}${path.sep}`)) {
  console.error('run directory must be inside the current workspace');
  process.exit(2);
}
const report = [];
let failures = 0;
for (const item of evals.evals) {
  const outDir = path.join(root, item.id, 'outputs');
  const schemasDir = path.join(outDir, 'SEditor');
  let files = [];
  try { files = await readdir(schemasDir); } catch {}
  const jsons = files.filter((name) => name.endsWith('.json'));
  const htmls = files.filter((name) => name.endsWith('.html'));
  const assertions = [];
  const record = (text, passed, details) => {
    assertions.push({ text, passed, evidence: details });
    if (!passed) failures += 1;
  };
  if (item.id === 'no-type-no-overwrite') {
    record('No speculative schema was written before clarifying type/topic', jsons.length === 0 && htmls.length === 0, `JSON=${jsons.length}, HTML=${htmls.length}`);
  } else if (item.id === 'near-miss-unrelated-html') {
    record('Unrelated CSS task did not create a schema', jsons.length === 0 && htmls.length === 0, `JSON=${jsons.length}, HTML=${htmls.length}`);
  } else {
    record('At least one schema and launcher pair exists', jsons.length > 0 && htmls.length >= jsons.length, `JSON=${jsons.join(',')}; HTML=${htmls.join(',')}`);
    for (const file of jsons) {
      let parsed;
      try { parsed = JSON.parse(await readFile(path.join(schemasDir, file), 'utf8')); } catch (error) {
        record(`${file} is parseable JSON`, false, error.message);
        continue;
      }
      record(`${file} is SEditor v1`, parsed.version === 1 && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges), `version=${parsed.version}; nodes=${parsed.nodes?.length}; edges=${parsed.edges?.length}`);
      const launcherFile = file.replace(/\.json$/, '.html');
      const launcher = await readFile(path.join(schemasDir, launcherFile), 'utf8').catch(() => '');
      record(`${launcherFile} embeds the schema and opens offline`, Boolean(launcher) && launcher.includes('id="seditor-schema">') && /"nodes"\s*:/.test(launcher) && launcher.includes('#d='), launcher.slice(0, 400));
    }
    if (item.id === 'protect-existing-human-schema') {
      const old = await readFile(path.join(schemasDir, 'data-model.json'), 'utf8').catch(() => '');
      record('Existing human-edited target preserved', old.includes('data-model'), old.slice(0, 200));
    }
  }
  const passed = assertions.filter((x) => x.passed).length;
  report.push({ id: item.id, passed, failed: assertions.length - passed, assertions });
}
const output = { eval_file: 'tests/evals/evals.json', run_dir: root, passed_assertions: report.reduce((n, x) => n + x.passed, 0), failed_assertions: failures, cases: report };
await writeFile(path.join(root, 'grading.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`grading report: ${path.join(root, 'grading.json')} (${output.passed_assertions} passed, ${failures} failed)`);
if (failures) process.exitCode = 1;
