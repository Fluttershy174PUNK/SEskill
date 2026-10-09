---
name: seditor
description: >
  Use this skill when the user asks to create or revise a visual project schema—logic or auth flow,
  code/module architecture, UI screen map, data model/ER diagram, deployment topology, state machine,
  API contract, or another project diagram—and when they invoke /seditor, in English or Russian.
  Inspect the actual project, write valid SEditor JSON, and pair it with an HTML launcher that opens
  the schema directly. Do not use for ordinary prose explanations or CSS/code
  fixes that do not request a project schema.
license: MIT
compatibility: Node.js >= 18 for the bundled local editor backend.
metadata:
  author: Fluttershy174PUNK
  version: "0.4.0"
  upstream_editor: "https://github.com/Fluttershy174PUNK/SEditor"
  allowed_harnesses: "pi, claude-code, codex, opencode"
  license_file: "LICENSE"
---

# seditor — generate a visual schema, hand it to a human

Turn one request into a **structured schema** in `.SEditor/`, plus an HTML launcher that
opens it in the bundled SEditor. The agent writes the JSON, the human edits it visually.

## What you produce

For each schema, in the project's `.SEditor/` folder (create it if missing):

```text
.SEditor/
├── app/                      # рантайм редактора: копия SEditor/app, без конфигов сборки
│   ├── editor.html           # собранный в один файл редактор (не править руками)
│   ├── server.js             # опциональный backend: /api/*, листинг диска
│   ├── create-shortcut.mjs   # генерирует ярлык с данными схемы внутри
│   ├── launcher.js           # общий рендер ярлыка (Node и браузер)
│   ├── shortcut.html         # шаблон ярлыка
│   └── version.json          # sha256 каждого файла рантайма
├── <type>-<topic>.json       # the schema
└── <type>-<topic>.html       # ярлык: открывает схему двойным кликом, без сервера
```

One invocation can produce several schemas if the request covers distinct concerns.

### Naming

`<type>-<topic>.json`, lowercase-hyphenated:

| Request | Files |
| --- | --- |
| "map out the authentication flow" | `logic-auth-flow.json` |
| "describe all UI screens" | `designer-screen-map.json` |
| "show the data model" | `data-model.json` |
| "how does this deploy" | `deployment-topology.json` |
| "what modules exist" | `code-module-map.json` |

The type prefix keeps names predictable across runs; the topic keeps two requests of the
same type from overwriting each other. Set `meta.name` to the same string.

## Workflow

1. **Read the request.** If the user invoked the command with **no text**, ask which schema
   type they want — offer the menu below, never silently invent one. If they said "make all
   of them" / "давай всё", generate all six.
2. **Inspect the project** — existing files, modules, naming, routes. Run `ls`, `grep`,
   `read` on the project root. The schema must describe what is actually there. An empty
   project is fine: build it from the user's description instead of refusing.
3. **Read `references/schema-format.md`** before writing any JSON. It documents what the
   bundled editor actually reads, which differs from the upstream README in ways that
   silently lose data (see Gotchas).
4. **Check before writing.** If the target JSON exists, preserve it; ask before overwriting human edits. For an edit request, prefer updating the existing schema and keep its slug.
5. **Write the SEditor v1 JSON** into `.SEditor/<type>-<topic>.json`.
6. **Install/update the managed editor runtime** with `node <skill-dir>/scripts/sync-editor.mjs <project-root>`. It verifies bundle checksums and updates only runtime-owned files. Preserve schemas, launchers, and every unrelated/user file under `.SEditor/`.
7. **Generate the same-basename launcher** with `node <skill-dir>/scripts/create-shortcut.mjs .SEditor/<slug>.json .SEditor/<slug>.html .SEditor/app/editor.html`. The launcher carries the schema inside itself and redirects into `.SEditor/app/editor.html`, so a double click opens the schema with **no backend**. Because the data is embedded, **regenerate the launcher every time you write the JSON** — it is the last step of any schema edit, not a one-off at creation.
8. **Validate and repair** with `node <skill-dir>/scripts/validate-scheme.mjs .SEditor/*.json`; check the launcher with the generator's `--check` mode.
9. **Hand off** the launcher path. Opening `.SEditor/<slug>.html` needs nothing else. Mention the optional backend (`node .SEditor/app/server.js`) only for the extras it adds: recent-schema list, saving JSON/PNG straight to disk, and the in-editor HTML button.

### Repository support files (not workflow steps)

`assets/example-scheme.json` is the canonical format sample; `app/version.json` declares the
path-launcher contract and pins the bundled runtime checksums. The maintainer suite
(`tests/*.test.mjs`, `tests/validate-skill.mjs`) and `tests/evals/README.md` — fresh-session
output and trigger evaluation — live in the repository, not in this package: they are
maintainer resources, not extra tasks to repeat for each generated schema.

## Finding the skill directory

Resolve it once at the start, then use it as `<skill-dir>`:

- pi / Claude Code substitute the skill path automatically — use it directly.
- Otherwise: `dirname` of the resolved `SKILL.md`, e.g.
  `ls <skill-dir>/app/shortcut.html` to confirm.

## Schema type menu (only when the command has no text)

| Type | Best for | Example slug |
| --- | --- | --- |
| `logic` | business logic, control flow, state machines | `logic-auth-flow` |
| `code` | module layout, API contracts, data flow between code | `code-module-map` |
| `designer` | screens, UI components, navigation | `designer-screen-map` |
| `data` | database entities, relationships | `data-model` |
| `deployment` | infra topology, services, deploys | `deployment-topology` |
| `custom` | anything else — ask the user for the topic name | user-provided |

The JSON vocabulary is identical for every type; only the nodes you choose differ.

## Validation loop

Run the bundled validator on the written schemas and check that the corresponding launcher exists and matches its JSON name:

```bash
node <skill-dir>/scripts/validate-scheme.mjs .SEditor/*.json
node <skill-dir>/scripts/create-shortcut.mjs .SEditor/<slug>.json .SEditor/<slug>.html .SEditor/app/editor.html --check
```

It checks JSON validity, id uniqueness and edge endpoints, the shape/handle/enum
vocabularies, table cell keys, size clamping, and geometric zone/level/stage containment.
**Errors must be fixed. Warnings mean the editor will silently change that field on the
first human save — fix those too unless they are intentional.** Do not declare success on a
non-zero exit code.

## Gotchas

These were verified against the bundled editor in a browser. Each one silently corrupts
or drops data if ignored.

- **Containment is positional, not declarative.** The editor recomputes zone / level /
  stage membership from geometry on load and save. Writing `data.zones: ["z1"]` on a node
  that does not overlap `z1`'s rectangle means the link is **dropped** the first time the
  human saves. Place the container rect so it actually contains the nodes. The validator
  flags every mismatch.
- **`data.level` / `data.stage` are the editor's output fields, and they hold the divider's
  `label` string** (or `null`), not an id. `data.levels` / `data.stages` are neither read nor
  written — do not use them. Label your `level` / `stage` dividers, or the band value is `""`.
- **`data.contains` on a zone is always rewritten** — never write it by hand.
- **Table cells live under `data.cells` as `"row,col"`** (zero-based, string keys). Any
  other key format renders an empty grid, and the human's first save bakes that in.
- **Node `type` is always `"shape"`** — including for zones, levels, tables and stages.
- **`labelPos` is `inside|top|right|bottom|left`**, not `above|below`. `inside` is not a
  valid edge handle.
- **Sizes are clamped on load**: `level` is always 14px tall and at most 400 wide; `stage`
  is always 14px wide and at most 400 tall; `circle`, `square` and `diamond` are square.
  Do not write a 1000-wide level — the editor renders and saves 400.
- **`meta.name` is not derived from the filename.** Leave it empty and the toolbar says
  "Untitled" and Save offers `schema.json`.
- **Edges to unknown node ids are dropped silently.** Validate after every edit pass.
- **The launcher carries the schema and must be regenerated after every JSON write.** Opening
  `.SEditor/<slug>.html` by double click works with no server: `file://` blocks reading a sibling
  JSON (`fetch`/XHR/`import()` all fail), so the launcher embeds the data and redirects into
  `.SEditor/app/editor.html` via `#d=<json>&p=<path>`. It is not a live view — an agent edit to the
  JSON is invisible in the launcher until it is regenerated, so regenerate it as the final step of
  every edit. A JSON with `</script>` or `<` in a label is safe: `<` is stored as `\u003c`.
  The optional backend (`node .SEditor/app/server.js`) only adds recents, disk writes, and the
  in-editor HTML button; without it the editor can still save JSON/PNG to a folder you pick once.
- **Keep the bundled editor in sync with the editor repo.** The skill vendors a copy of SEditor;
  `scripts/sync-editor.mjs` installs it checksum-verified, and `app/version.json` pins the release.
  Never hand-edit `app/editor.html`: it is a build artifact from the SEditor repository and
  every bundled file is checksum-pinned in `app/version.json`.
- **Never clobber generated or human files by default.** If the JSON or its same-name launcher already exists and the request is to create a new schema, ask before overwriting; if the request explicitly updates that schema, preserve its slug and pair.
- **Keep the generated JSON much smaller than the editor can render.** A 200-node diagram
  is unreadable. Split into several named schemas instead.

## How the user opens it

**Open the schema:** double click `.SEditor/<slug>.html`. Nothing else is required — the launcher
carries the schema and opens `.SEditor/app/editor.html`. The optional backend adds recents,
direct JSON/PNG disk writes, and the in-editor HTML button; keep `HOST` at `127.0.0.1` when using it:

```bash
cd <project-root>
node .SEditor/app/server.js   # → http://127.0.0.1:5174/editor.html
```

`PORT` and `HOST` override the defaults (5174 / 127.0.0.1). The file API can write to any
path on disk, so only bind `HOST=0.0.0.0` on a machine you trust.

Mention the launcher path on hand-off. For an existing project, preserve `.SEditor/` contents; only the managed `app/` runtime is synchronized.
