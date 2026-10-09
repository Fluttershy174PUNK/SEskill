# Vendoring the SEditor editor (maintainer guide)

The `seditor` skill ships a verbatim copy of the SEditor runtime under
`skills/seditor/app/`. There is no skill-only patch: SEditor itself owns
`create-shortcut.mjs`, `launcher.js`, `shortcut.html`, the backend API and the offline
`#d=` loading. The vendor copy must match **one** SEditor release exactly — never a
hand-edited hybrid.

## Editor version parity (required)

- Upstream editor repository: **https://github.com/Fluttershy174PUNK/SEditor**
- `skills/seditor/app/version.json` pins the release: version, `launcherFormat` and a
  sha256 for each of the five runtime files (`editor.html`, `server.js`,
  `create-shortcut.mjs`, `shortcut.html`, `launcher.js`). Build configs and the
  editor's own tests stay in the SEditor repo — they are not part of what ships.
- `skills/seditor/scripts/sync-editor.mjs <project-root>` installs the bundle
  checksum-verified into `<project-root>/.SEditor/app/`. It updates only runtime-owned
  files and never touches schemas, launchers or unrelated user files.
- `bash verify.sh` (repo root) checks the vendored bundle against the SEditor source
  checkout (sibling clone by default, or `SEditor_ROOT=/path/to/SEditor`) and
  re-verifies every checksum.

### Updating the vendored editor

1. In the SEditor repo: make the change, run `npm run build` and `npm test`. The build
   is reproducible from any directory (`cssHash` is derived from the CSS content, not
   from the file path).
2. Recompute `skills/seditor/app/version.json` checksums for every file in `files`, and
   bump `version` when the launcher/backend/edit contracts change. Bump `launcherFormat`
   only when the launcher format itself changes (currently `embed-v1`).
3. Copy the five runtime files plus `version.json` from `SEditor/app/` into
   `skills/seditor/app/`.
4. Re-sync the checked-in demo: `node skills/seditor/scripts/sync-editor.mjs
   examples/auth-tasks`, then regenerate launchers for the demo schemas.
5. Run `bash verify.sh` from the repo root and fix everything it reports.

Do not edit `skills/seditor/app/editor.html` by hand — it is a build artifact. Fix
`src/` upstream and rebuild.

## Launcher contract

A launcher (`<slug>.html`) is **not** a live view of the JSON. `file://` cannot read a
sibling JSON (`fetch`, XHR and dynamic `import()` are all blocked), so the launcher:

- embeds the schema in `<script type="application/json" id="seditor-schema">`,
- redirects to `app/editor.html` with `#d=<url-encoded json>&p=<schema path>`,
- stores `<` in the embedded JSON as `\u003c` so a label can never close the script tag.

Consequence: **regenerate the launcher after every JSON write.** The skill's
`scripts/create-shortcut.mjs` is a thin wrapper over the bundled generator — it must not
implement a second launcher format. Both paths render through the same
`app/launcher.js` + `app/shortcut.html`, so they cannot drift.

The optional backend (`node .SEditor/app/server.js`) adds recents, direct disk writes
for JSON/PNG, and the in-editor HTML button. Without it, the editor still saves
JSON/PNG to a folder the user picks once (File System Access API, handle persisted in
IndexedDB). The File System Access API is unavailable inside cross-origin iframes,
which is why the launcher redirects instead of embedding the editor in an iframe.
