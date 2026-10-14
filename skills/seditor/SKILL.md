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
compatibility: Node.js >= 18 for schema generation and validation scripts.
metadata:
  author: Fluttershy174PUNK
  version: "0.6.0"
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

One invocation can produce several schemas when the request names distinct concerns; keep each diagram focused.

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
3. **Use the bundled mini-reference by default:** copy the compact structure from `assets/example-scheme.json`. Read `references/schema-format.md` when using non-default shapes, tables, zones/lanes, custom edge styles, or when an editor round-trip changes data.
4. **Check before writing.** If the target JSON exists, preserve it; ask before overwriting human edits. For an edit request, prefer updating the existing schema and keep its slug.
5. **Write compact, readable SEditor v1 JSON** to `.SEditor/<type>-<topic>.json`. Use stable short ids (`n1`, `e1`), one node/edge per object, concise labels, and omit defaults/derived fields; do not minify JSON. The editor restores omitted defaults. Add descriptions only when they clarify the diagram. Never overwrite an existing human-edited schema without explicit permission or downgrade a future version.
6. **Ensure the managed runtime exists.** If `.SEditor/app/editor.html` is missing, install the checksum-verified runtime using `node <skill-dir>/scripts/sync-editor.mjs <project-root>`. It preserves user schemas and refuses a conflicting root `SEditor.html`; don't rerun it unnecessarily.
7. **Generate the paired launcher** with `node <skill-dir>/scripts/create-shortcut.mjs .SEditor/<slug>.json .SEditor/<slug>.html .SEditor/app/editor.html`. It embeds the schema and opens the standalone editor without a server. Regenerate after every JSON edit.
8. **Validate in one command:** `node <skill-dir>/scripts/validate-project.mjs <project-root>`. It validates every `.SEditor/*.json` and checks each paired launcher is current. Fix errors and unintended warnings; never claim success on failure.
9. **Hand off** the `.SEditor/<slug>.html` path and mention it opens offline. Node is needed only for schema/launcher generation and validation; normal editing needs no server.

### Repository support files (not workflow steps)

`scripts/validate-scheme.mjs` validates individual schema files; `scripts/validate-project.mjs` is the one-command project check. `assets/example-scheme.json` is the compact format sample; `app/version.json` declares the
path-launcher contract and pins the bundled runtime checksums. The maintainer suite
(`tests/*.test.mjs`, `tests/validate-skill.mjs`) and `tests/evals/README.md` — fresh-session
output and trigger evaluation — live in the repository, not in this package: they are
maintainer resources, not extra tasks to repeat for each generated schema.

## Finding the skill directory

Resolve it once at the start, then use it as `<skill-dir>`:

- Pi provides the resolved skill directory path — use it for bundled scripts.
- Otherwise, resolve the directory containing this `SKILL.md` once and use it as `<skill-dir>`.

## Schema type menu (only when the command has no text)

| Type | Best for | Example slug |
| --- | --- | --- |
| `logic` | business logic, control flow, state machines | `logic-auth-flow` |
| `code` | module layout, API contracts, data flow between code | `code-module-map` |
| `designer` | screens, UI components, navigation | `designer-screen-map` |
| `data` | database entities, relationships | `data-model` |
| `deployment` | infra topology, services, deploys | `deployment-topology` |
| `custom` | anything else — ask the user for the topic name | user-provided |

The JSON vocabulary is identical for every type; only the nodes you choose differ. Load `assets/example-scheme.json` for a compact starting point and `references/schema-format.md` only when shape-specific details are needed.

## Validation loop

After every schema or launcher edit, run this read-only project check; it validates all schemas and checks launcher freshness:

```bash
node <skill-dir>/scripts/validate-project.mjs <project-root>
```

If a launcher is missing or stale, regenerate it with the `create-shortcut.mjs` command in workflow step 7 and rerun validation.

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
  The standalone editor opens JSON with browser pickers, saves directly when the browser supports it, and otherwise downloads files. Recents depend on browser file-handle and IndexedDB support. A local backend is optional compatibility tooling only.
- **Schema compatibility and readability:** keep additive fields under schema v1 only when old readers can safely ignore them. The editor rejects versions newer than v1 to avoid destructive saves. Prefer omitted defaults (`label`, `desc`, `labelPos`, table defaults, standard styles) and derived membership fields for readable, compact JSON. Fill colors must be one of the editor's 16 palette values; shape layer order is optional numeric `zIndex`.
- **Editor shortcuts:** focus the canvas, then use `Ctrl/Cmd+C`, `V`, `X`, `Z` to copy, paste, cut, undo; multi-selection copies all selected nodes and their internal edges. Shortcuts follow physical key positions and work with non-English keyboard layouts. Editable text fields keep native shortcuts. Other editor features include multi-select, fill palette, layers, standalone HTML export, JSON/PNG export, browser file open/save and best-effort recents.
- **Keep the bundled editor in sync with the editor repo.** The skill vendors a copy of SEditor;
  `scripts/sync-editor.mjs` installs it checksum-verified, and `app/version.json` pins the release.
  Never hand-edit generated HTML: it is built from the SEditor source. The repository's root `SEditor.html` is the primary standalone release; `app/editor.html` is its byte-identical compatibility copy used by the managed skill runtime. Managed app files are checksum-pinned in `version.json`.
- **Never clobber generated or human files by default.** If the JSON or its same-name launcher already exists and the request is to create a new schema, ask before overwriting; if the request explicitly updates that schema, preserve its slug and pair.
- **Keep the generated JSON much smaller than the editor can render.** A 200-node diagram
  is unreadable. Split into several named schemas instead.

## How the user opens it

**Open the schema:** double click `.SEditor/<slug>.html`. It embeds the schema and loads the bundled single-file editor; no local server is required. Browser-native direct file access and recent-file support vary by browser; download/open pickers remain the fallback. The legacy local backend is optional and only needed by older integrations.

Mention the launcher path on hand-off. For an existing project, preserve `.SEditor/` contents; only the managed `app/` runtime is synchronized.
