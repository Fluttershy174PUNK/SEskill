# SEditor version bundled by SEskill

The standalone editor is copied verbatim from the SEditor source build. There is no
skill-only patch: SEditor itself owns `app/create-shortcut.mjs`, `app/launcher.js`,
`app/shortcut.html`, the backend API, and offline `#d=` loading. Keep `editor.html`,
`server.js`, `create-shortcut.mjs`, `shortcut.html`, and `launcher.js` from the same
SEditor revision when updating the bundled app.

The skill's `scripts/create-shortcut.mjs` is a thin wrapper around the bundled editor
generator — it must not implement a second launcher format. Both paths render through the
same `app/launcher.js` + `app/shortcut.html`, so they cannot drift.

The launcher carries the schema inside itself and redirects into `app/editor.html`. That is
deliberate: `file://` cannot read a sibling JSON, so embedding the data is the only way a
double click opens a schema with no backend. Regenerate the launcher after every JSON write.

To refresh the vendored version, synchronize the managed editor bundle as one release and run
`bash verify.sh` from this repository root. Do not hand-patch only `editor.html`; the launcher,
server, and editor contracts are checksum-pinned in `version.json`. See `AGENTS.md` for the
full update procedure.
