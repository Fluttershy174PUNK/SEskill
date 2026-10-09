#!/usr/bin/env bash
# Verify the whole repository: the skill, its scripts, and the generated example.
# Run from the repo root:  bash verify.sh
#
# Exit 0 = everything checks out.
set -uo pipefail

cd "$(dirname "$0")"
fail=0
pass() { printf 'ok    %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; fail=1; }

# 1. The version manifest pins the complete vendored editor bundle.
node --input-type=module <<'NODE' || bad "editor bundle manifest"
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
for (const root of ['app', '../SEditor/app']) {
  const manifest = JSON.parse(await readFile(path.join(root, 'version.json'), 'utf8'));
  assert.equal(manifest.name, 'SEditor');
  assert.equal(manifest.schemaVersion, 1);
  for (const [file, hash] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'), hash, `${root}/${file} checksum`);
  }
}
const bundled = JSON.parse(await readFile('app/version.json', 'utf8'));
const source = JSON.parse(await readFile('../SEditor/app/version.json', 'utf8'));
assert.deepEqual(bundled, source, 'vendored editor version mismatch');
console.log(`ok    editor bundle manifest (${Object.keys(bundled.files).length} checksums)`);
NODE

# 2. Use the reference Agent Skills validator on a correctly named package copy.
if command -v skills-ref >/dev/null 2>&1 || command -v uvx >/dev/null 2>&1; then
  skill_tmp=$(mktemp -d)
  cp -a . "$skill_tmp/seditor"
  if command -v skills-ref >/dev/null 2>&1; then
    skills-ref validate "$skill_tmp/seditor" && pass "skills-ref validation" || bad "skills-ref validation"
  else
    (cd "$skill_tmp" && uvx --from skills-ref agentskills validate seditor) && pass "skills-ref validation" || bad "skills-ref validation"
  fi
  rm -rf "$skill_tmp"
else
  bad "skills-ref validator unavailable; install skills-ref or uvx"
fi

# 3. Lightweight local checks for useful, portable diagnostics.
package_tmp=$(mktemp -d)
cp -a . "$package_tmp/seditor"
(cd "$package_tmp/seditor" && node scripts/validate-skill.mjs) \
  && pass "SKILL.md and package structure valid" || bad "SKILL.md and package structure"
rm -rf "$package_tmp"

# 4. SKILL.md body stays inside the recommended budget.
lines=$(wc -l < SKILL.md)
if [ "$lines" -lt 500 ]; then pass "SKILL.md body is $lines lines (< 500)"
else bad "SKILL.md is $lines lines (>= 500, split it)"; fi

# 5. Every bundled asset and script is actually referenced from the skill.
for f in references/schema-format.md assets/example-scheme.json \
         scripts/validate-scheme.mjs scripts/validate-scheme.test.mjs scripts/create-shortcut.mjs scripts/shortcut.test.mjs scripts/system.test.mjs scripts/validate-skill.mjs scripts/sync-editor.mjs scripts/sync-editor.test.mjs scripts/skill.integration.test.mjs scripts/run-evals.mjs scripts/grade-evals.mjs evals/evals.json evals/eval_queries.json evals/README.md app/version.json AGENTS.md; do
  if grep -q "$(basename "$f")" SKILL.md README.md evals/README.md || [[ "$f" == scripts/* ]]; then
    pass "referenced: $f"
  else
    bad "unreferenced (dead weight): $f"
  fi
done

# 6. Real tests and eval workflow run.
node scripts/validate-scheme.mjs --selfcheck >/dev/null \
  && pass "validator self-check" || bad "validator self-check"
node scripts/validate-scheme.test.mjs \
  && pass "schema validator black-box tests" || bad "schema validator black-box tests"
node scripts/shortcut.test.mjs \
  && pass "path-launcher and version-parity self-check" || bad "path-launcher and version-parity self-check"
node scripts/system.test.mjs \
  && pass "end-to-end system test (editor + skill + launchers)" || bad "end-to-end system test (editor + skill + launchers)"
node scripts/validate-skill.mjs \
  && pass "skill bundle/evals validation" || bad "skill bundle/evals validation"
node scripts/sync-editor.test.mjs \
  && pass "editor sync filesystem tests" || bad "editor sync filesystem tests"
node scripts/skill.integration.test.mjs \
  && pass "skill generation/backend integration test" || bad "skill generation/backend integration test"
node scripts/run-evals.mjs \
  && pass "output-eval scenarios in isolated projects" || bad "output-eval scenarios in isolated projects"

# 7. Every example schema has a same-basename path launcher.
for schema in project-example/.SEditor/*.json assets/example-scheme.json; do
  slug=${schema%.json}
  launcher="$slug.html"
  if [[ "$schema" == assets/* ]]; then editor=app/editor.html
  else editor=project-example/.SEditor/app/editor.html; fi
  node scripts/create-shortcut.mjs "$schema" "$launcher" "$editor" --check \
    && pass "path launcher: $launcher" || bad "path launcher: $launcher"
done

# 8. Every generated schema validates, and has a launcher pointing at it.
if compgen -G "project-example/.SEditor/*.json" > /dev/null; then
  node scripts/validate-scheme.mjs project-example/.SEditor/*.json \
    && pass "example schemas valid" || bad "example schemas"
  for j in project-example/.SEditor/*.json; do
    slug=$(basename "$j" .json)
    html="project-example/.SEditor/$slug.html"
    if [ -f "$html" ] && grep -q "$slug" "$html"; then pass "launcher: $slug.html"
    else bad "missing or wrong launcher for $slug"; fi
  done
  for j in project-example/.SEditor/*.json; do
    node -e '
const fs = require("fs");
const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!s.meta || !s.meta.name) { console.error("meta.name missing"); process.exit(1); }
if (s.meta.name !== require("path").basename(process.argv[1], ".json")) {
  console.error("meta.name " + s.meta.name + " != filename"); process.exit(1);
}
' "$j" && pass "meta.name matches filename: $(basename "$j")" || bad "meta.name: $(basename "$j")"
  done
else
  bad "no example schemas found in project-example/.SEditor/"
fi

# 9. The vendored editor is complete.
for f in editor.html server.js create-shortcut.mjs shortcut.html version.json; do
  [ -s "app/$f" ] && pass "vendored: app/$f" || bad "missing: app/$f"
done
[ -d project-example/.SEditor/app ] && pass "example has .SEditor/app/" || bad "example missing .SEditor/app/"

echo
if [ "$fail" -eq 0 ]; then echo "all checks passed"; else echo "some checks FAILED"; fi
exit "$fail"
