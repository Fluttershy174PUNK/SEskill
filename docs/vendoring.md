# Vendoring the SEditor editor (maintainer guide)

The `seditor` skill ships a verbatim copy of the SEditor runtime under
`skills/seditor/app/`. There is no skill-only patch: SEditor itself owns
`create-shortcut.mjs`, `launcher.js`, `shortcut.html`, the backend API and the offline
`#d=` loading. The vendor copy must match **one** SEditor release exactly — never a
hand-edited hybrid.

## Editor version parity (required)

- Upstream editor repository: **https://github.com/Fluttershy174PUNK/SEditor**
- `skills/seditor/app/version.json` pins the release: version, `launcherFormat` and a
  sha256 for each of the five managed runtime files (`editor.html`, `server.js`,
  `create-shortcut.mjs`, `shortcut.html`, `launcher.js`). `editor.html` is a
  byte-identical copy of the primary root `SEditor.html` in the editor repo; build
  configs and tests stay in the SEditor repo.
- `skills/seditor/scripts/sync-editor.mjs <project-root> [output-dir]` installs the bundle
  checksum-verified into `<output-dir>/app/` and writes the standalone `SEditor.html`
  alongside it. The output dir defaults to `<project-root>/SEditor/` (a legacy
  `<project-root>/.SEditor/` is kept until the user migrates; an explicit second argument
  selects a custom directory). It updates only the managed runtime/root HTML and
  never touches schemas, launchers or unrelated user files.
- `bash verify.sh` (repo root) checks the vendored bundle against the SEditor source
  checkout (sibling clone by default, or `SEditor_ROOT=/path/to/SEditor`) and
  re-verifies every checksum.

### Updating the vendored editor

1. In the SEditor repo: make the change, run `npm run build` and `npm test`. The build
   is reproducible from any directory (`cssHash` is derived from the CSS content, not
   from the file path).
2. Bump the editor release version in `app/version.json` when publishing user-visible behavior, then run `npm run build` (which refreshes runtime checksums). Bump `launcherFormat`
   only when the launcher format itself changes (currently `embed-v1`).
3. Copy the five runtime files plus `version.json` from `SEditor/app/` into
   `skills/seditor/app/`.
4. Copy the five runtime files plus `version.json` from `SEditor/app/` into
   `skills/seditor/app/`. Update the vendored schema reference from
   `SEditor/docs/schema-format.md`.
5. Re-sync the checked-in demo (`node skills/seditor/scripts/sync-editor.mjs examples/auth-tasks`)
   and regenerate launchers for its demo schemas.
6. Run `bash verify.sh` from the repo root and fix everything it reports.

Do not edit `skills/seditor/app/editor.html` by hand — it is a build artifact. Fix
`src/` upstream and rebuild.

## Launcher contract

A launcher (`<slug>.html`) is **not** a live view of the JSON. `file://` cannot read a
sibling JSON (`fetch`, XHR and dynamic `import()` are all blocked), so the launcher:

- embeds the schema in `<script type="application/json" id="seditor-schema">`,
- redirects to the compatibility `app/editor.html` with `#d=<url-encoded json>&p=<schema path>`,
- stores `<` in the embedded JSON as `\u003c` so a label can never close the script tag.

Consequence: **regenerate the launcher after every JSON write.** The skill's
`scripts/create-shortcut.mjs` is a thin wrapper over the bundled generator — it must not
implement a second launcher format. Both paths render through the same
`app/launcher.js` + `app/shortcut.html`, so they cannot drift.

The primary root `SEditor.html` and launcher are standalone. The bundled editor opens
JSON using the browser picker, saves directly when File System Access is available,
and otherwise downloads JSON/PNG. Recent files depend on persistent browser file handles
and IndexedDB support. The legacy backend remains optional compatibility tooling; the
launcher redirects rather than embedding the editor in an iframe.
