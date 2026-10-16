# SEskill

An Agent Skill that turns a project into a compact visual diagram, then pairs the SEditor JSON with a self-contained HTML launcher. Open the launcher in a browser; no server is required.

[Русская версия README](README.ru.md) · [SEditor](https://github.com/Fluttershy174PUNK/SEditor)

## Install

A skill's **installation scope controls where the agent discovers it**, not where it writes project output. Whether installed globally or locally, when you run the agent in a project, SEskill reads that project and writes schemas, launchers, and the managed editor under that project's `SEditor/` directory (any other directory the user names works too). A global install does not redirect output to the skill's install folder.

### Pi

Pi supports both package installs and skill directories ([skill discovery](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md), [package installs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md)):

| Scope | Command | Pi behavior |
| --- | --- | --- |
| Project (recommended for teams) | `pi install --local git:github.com/Fluttershy174PUNK/SEskill` | Records the package in the project's `.pi/settings.json`; project resources load after project trust is granted. |
| Personal/global | `pi install git:github.com/Fluttershy174PUNK/SEskill` | Records the package in `~/.pi/agent/settings.json`; available across projects. |

This repository exposes the skill through its conventional `skills/seditor/` directory, so Pi's git package install makes it available. Alternatively, install just the raw skill folder: `.agents/skills/seditor/` in a project or `~/.agents/skills/seditor/` for personal use. Pi discovers both locations. Use `/skill:seditor ...` to invoke the skill explicitly.

### Other compatible agents

Copy this repository's `skills/seditor/` directory (keep the destination folder named `seditor`) to the location supported by your agent. These locations are documented by [Claude Code](https://code.claude.com/docs/en/skills) and [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills):

| Agent | Project-local | Personal/global |
| --- | --- | --- |
| Claude Code | `.claude/skills/seditor/` | `~/.claude/skills/seditor/` |
| Codex | `.agents/skills/seditor/` | See the current Codex documentation for user-level discovery paths; this README only confirms the project location. |
| GitHub Copilot CLI | `.github/skills/seditor/` or `.agents/skills/seditor/` | `~/.copilot/skills/seditor/` or `~/.agents/skills/seditor/` |

For example, after cloning this repository to `/path/to/SEskill`, from the project root install for Claude Code with `mkdir -p .claude/skills && cp -R /path/to/SEskill/skills/seditor .claude/skills/seditor`; for Codex or Copilot's `.agents` location, use `.agents/skills` as the destination instead. For a personal install, use the agent's personal path in the table, e.g. `mkdir -p ~/.claude/skills && cp -R /path/to/SEskill/skills/seditor ~/.claude/skills/seditor`.

Project-local installs are easiest to share and version with a team. Personal/global installs are convenient for reuse; the skill still writes outputs into the active project's `SEditor/`.

After installing, start the agent from the project directory so the skill inspects and writes to the correct project. Then ask for a diagram, for example:

```text
/seditor map the authentication flow
/seditor create a screen map for the checkout flow
```

The skill inspects the project and creates `SEditor/<type>-<topic>.json` plus a same-name `.html` launcher that embeds the schema and editor. Open that HTML file to edit the diagram; select a node and use `Ctrl/Cmd+C/V/X/Z` for copy, paste, cut, and undo. Node is only needed to generate and validate files.

## Output layout

Everything the skill writes lives in one folder at the project root — `SEditor/` by default, or whatever directory the user names:

```text
SEditor/
├── SEditor.html              # standalone editor copy — open it to edit any schema by hand
├── app/                      # managed SEditor runtime (checksum-pinned, never hand-edited)
├── <type>-<topic>.json       # the schema
└── <type>-<topic>.html       # launcher: opens that schema by double click, offline
```

Projects created by skill ≤ 0.6 keep their `.SEditor/` folder; pass it explicitly to the scripts to keep working there.

## Schema and compatibility

The bundled example is intentionally small and readable; use it as a pattern rather than copying editor-generated defaults. The skill writes compact SEditor schema v1 JSON. Older unversioned and v1 files remain supported; unknown future versions must not be downgraded. Defaults and geometry-derived membership are omitted from new saves. See the canonical [schema reference](skills/seditor/references/schema-format.md).

## Validate and test

```bash
node skills/seditor/scripts/validate-project.mjs .
bash verify.sh
```

`verify.sh` runs package validation, runtime checksum/vendor parity, standalone launcher and compatibility-backend tests, schema tests, and mechanical output-eval scenarios. It needs a sibling SEditor checkout, or set `SEDITOR_ROOT` to one.

## License

MIT — see [LICENSE](LICENSE).
