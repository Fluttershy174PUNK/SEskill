#!/usr/bin/env bash
# Verify the whole repository: the skill payload, its tests, and the generated example.
# Run from the repo root:  bash verify.sh
#
# Needs a sibling SEditor clone for vendor parity:
#   git clone https://github.com/Fluttershy174PUNK/SEditor ../SEditor
#   (or point SEDITOR_ROOT at an existing checkout)
#
# Exit 0 = everything checks out.
set -uo pipefail

cd "$(dirname "$0")"
fail=0
pass() { printf 'ok    %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; fail=1; }

SKILL=skills/seditor

# 0. Preflight: parity checks need the SEditor source checkout.
if [ -n "${SEDITOR_ROOT:-}" ]; then
  SEDITOR_SRC="$SEDITOR_ROOT"
elif [ -f ../SEditor/app/version.json ]; then
  SEDITOR_SRC=../SEditor
else
  echo "FAIL  SEditor source checkout not found (needed for vendor parity)."
  echo "        git clone https://github.com/Fluttershy174PUNK/SEditor ../SEditor"
  echo "      or: export SEDITOR_ROOT=/path/to/SEditor && bash verify.sh"
  exit 1
fi
if [ ! -f "$SEDITOR_SRC/app/version.json" ]; then
  echo "FAIL  SEDITOR_ROOT=$SEDITOR_SRC does not contain app/version.json"
  exit 1
fi
pass "SEditor source: $SEDITOR_SRC"

# 1. The version manifest pins the complete vendored editor bundle.
export SEDITOR_SRC SKILL
node --input-type=module <<'NODE' || bad "editor bundle manifest"
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const editorSrc = process.env.SEDITOR_SRC;
const skillDir = process.env.SKILL;
for (const root of [path.join(skillDir, 'app'), path.join(editorSrc, 'app')]) {
  const manifest = JSON.parse(await readFile(path.join(root, 'version.json'), 'utf8'));
  assert.equal(manifest.name, 'SEditor');
  assert.equal(manifest.schemaVersion, 1);
  for (const [file, hash] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'), hash, `${root}/${file} checksum`);
  }
}
const bundled = JSON.parse(await readFile(path.join(skillDir, 'app/version.json'), 'utf8'));
const source = JSON.parse(await readFile(path.join(editorSrc, 'app/version.json'), 'utf8'));
assert.deepEqual(bundled, source, 'vendored editor version mismatch');
console.log(`ok    editor bundle manifest (${Object.keys(bundled.files).length} checksums)`);
NODE

# 2. Use the reference Agent Skills validator on the payload package only.
if command -v skills-ref >/dev/null 2>&1 || command -v uvx >/dev/null 2>&1; then
  skill_tmp=$(mktemp -d)
  cp -a "$SKILL" "$skill_tmp/seditor"
  if command -v skills-ref >/dev/null 2>&1; then
    skills-ref validate "$skill_tmp/seditor" && pass "skills-ref validation" || bad "skills-ref validation"
  else
    (cd "$skill_tmp" && uvx --from skills-ref agentskills validate seditor) && pass "skills-ref validation" || bad "skills-ref validation"
  fi
  rm -rf "$skill_tmp"
else
  bad "skills-ref validator unavailable; install skills-ref or uvx"
fi

# 3. The payload works standalone from a clean copy at an arbitrary location.
install_tmp=$(mktemp -d)
cp -a "$SKILL" "$install_tmp/seditor"
(cd "$install_tmp/seditor" && node scripts/validate-scheme.mjs --selfcheck >/dev/null) \
  && pass "payload installs and runs standalone" || bad "payload standalone install"
rm -rf "$install_tmp"

# 4. SKILL.md body stays inside the recommended budget.
lines=$(wc -l < "$SKILL/SKILL.md")
if [ "$lines" -lt 500 ]; then pass "SKILL.md body is $lines lines (< 500)"
else bad "SKILL.md body is $lines lines (>= 500, split it)"; fi

# 5. Every bundled asset and script is actually referenced from the skill.
for f in references/schema-format.md assets/example-scheme.json \
         scripts/validate-scheme.mjs scripts/create-shortcut.mjs scripts/sync-editor.mjs \
         app/version.json LICENSE; do
  if grep -q "$(basename "$f")" "$SKILL/SKILL.md" README.md tests/evals/README.md; then
    pass "referenced: $f"
  else
    bad "unreferenced (dead weight): $f"
  fi
done

# 6. Real tests and eval workflow run.
node "$SKILL/scripts/validate-scheme.mjs" --selfcheck >/dev/null \
  && pass "validator self-check" || bad "validator self-check"
node tests/validate-scheme.test.mjs \
  && pass "schema validator black-box tests" || bad "schema validator black-box tests"
node tests/shortcut.test.mjs \
  && pass "path-launcher and version-parity self-check" || bad "path-launcher and version-parity self-check"
node tests/system.test.mjs \
  && pass "end-to-end system test (editor + skill + launchers)" || bad "end-to-end system test (editor + skill + launchers)"
node tests/validate-skill.mjs \
  && pass "skill bundle/evals validation" || bad "skill bundle/evals validation"
node tests/sync-editor.test.mjs \
  && pass "editor sync filesystem tests" || bad "editor sync filesystem tests"
node tests/skill.integration.test.mjs \
  && pass "skill generation/backend integration test" || bad "skill generation/backend integration test"
node tests/run-evals.mjs \
  && pass "output-eval scenarios in isolated projects" || bad "output-eval scenarios in isolated projects"

# 7. Every example schema has a same-basename path launcher.
for schema in examples/auth-tasks/.SEditor/*.json "$SKILL/assets/example-scheme.json"; do
  slug=${schema%.json}
  launcher="$slug.html"
  if [[ "$schema" == "$SKILL"/assets/* ]]; then editor="$SKILL/app/editor.html"
  else editor=examples/auth-tasks/.SEditor/app/editor.html; fi
  node "$SKILL/scripts/create-shortcut.mjs" "$schema" "$launcher" "$editor" --check \
    && pass "path launcher: $launcher" || bad "path launcher: $launcher"
done

# 8. Every generated schema validates, and has a launcher pointing at it.
if compgen -G "examples/auth-tasks/.SEditor/*.json" > /dev/null; then
  node "$SKILL/scripts/validate-scheme.mjs" examples/auth-tasks/.SEditor/*.json \
    && pass "example schemas valid" || bad "example schemas"
  for j in examples/auth-tasks/.SEditor/*.json; do
    slug=$(basename "$j" .json)
    html="examples/auth-tasks/.SEditor/$slug.html"
    if [ -f "$html" ] && grep -q "$slug" "$html"; then pass "launcher: $slug.html"
    else bad "missing or wrong launcher for $slug"; fi
  done
  for j in examples/auth-tasks/.SEditor/*.json; do
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
  bad "no example schemas found in examples/auth-tasks/.SEditor/"
fi

# 9. The vendored editor is complete.
for f in editor.html server.js create-shortcut.mjs shortcut.html version.json; do
  [ -s "$SKILL/app/$f" ] && pass "vendored: $f" || bad "missing: $SKILL/app/$f"
done
[ -d examples/auth-tasks/.SEditor/app ] && pass "example has .SEditor/app/" || bad "example missing .SEditor/app/"

echo
if [ "$fail" -eq 0 ]; then echo "all checks passed"; else echo "some checks FAILED"; fi
exit "$fail"
