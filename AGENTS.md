# AGENTS.md — working on the seditor skill

## Editor version parity (required)

This skill vendors a copy of the SEditor editor. The vendor copy must match one
SEditor release exactly — never a hand-edited hybrid.

- Upstream editor repository: **https://github.com/Fluttershy174PUNK/SEditor**
- `app/version.json` pins the release: version, `launcherFormat`, and a sha256 per runtime file.
- `scripts/sync-editor.mjs <project-root>` installs the bundle checksum-verified into
  `<project-root>/.SEditor/app/`. It updates only runtime-owned files and never touches
  schemas, launchers, or unrelated user files.
- `bash verify.sh` (repo root) checks the vendored bundle against the sibling SEditor
  source repo and re-verifies every checksum.

### Updating the vendored editor

1. In the SEditor repo: make the change, run `npm run build` and `npm test`.
2. Recompute `app/version.json` checksums for every file listed in `files`, and bump
   `version` when the launcher/backend/edit contracts change. Bump `launcherFormat`
   only when the launcher format itself changes (currently `embed-v1`).
3. Copy the runtime files into this repo's `app/`: `editor.html`, `server.js`,
   `create-shortcut.mjs`, `shortcut.html`, `launcher.js`, `editor.test.mjs`,
   `version.test.mjs`, `version.json`.
4. Re-sync the checked-in demo: `node scripts/sync-editor.mjs project-example`,
   then regenerate launchers for the demo schemas.
5. Run `bash verify.sh` from the repo root and fix everything it reports.

Do not edit `app/editor.html` by hand — it is a build artifact. Fix `src/` upstream
and rebuild.

## Launcher contract

A launcher (`<slug>.html`) is **not** a live view of the JSON. `file://` cannot read a
sibling JSON (`fetch`, XHR and dynamic `import()` are all blocked), so the launcher:

- embeds the schema in `<script type="application/json" id="seditor-schema">`,
- redirects to `app/editor.html` with `#d=<url-encoded json>&p=<schema path>`,
- stores `<` in the embedded JSON as `\u003c` so a label can never close the script tag.

Consequence: **regenerate the launcher after every JSON write.** The skill's
`scripts/create-shortcut.mjs` and the editor's in-app HTML button both use the same
renderer (`app/launcher.js` + `app/shortcut.html`), so the two paths cannot drift.

The optional backend (`node .SEditor/app/server.js`) adds recents, direct disk writes
for JSON/PNG, and the in-editor HTML button. Without it, the editor still saves
JSON/PNG to a folder the user picks once (File System Access API, handle persisted in
IndexedDB). The File System Access API is unavailable inside cross-origin iframes,
which is why the launcher redirects instead of embedding the editor in an iframe.
