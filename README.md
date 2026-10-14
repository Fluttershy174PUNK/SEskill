# SEskill

An Agent Skill that turns a project into a compact visual diagram, then pairs the SEditor JSON with a self-contained HTML launcher. Open the launcher in a browser; no server is required.

[Русская версия README](README.ru.md) · [SEditor](https://github.com/Fluttershy174PUNK/SEditor)

## Install

**Recommended: install in the project repository** so the whole team gets the same skill. In Pi, copy the skill payload into the standard project-local location:

```bash
mkdir -p .agents/skills
cp -R /path/to/SEskill/skills/seditor .agents/skills/seditor
```

Pi discovers `.agents/skills/` from the project; use `/skill:seditor ...` to invoke it explicitly. Other compatible agents may use their own project-local skill directory (for example `.claude/skills/seditor` or `.github/skills/seditor`); copy the same `skills/seditor/` folder and preserve its name.

**Optional: install globally in Pi** to use it across projects:

```bash
pi install git:github.com/Fluttershy174PUNK/SEskill
```

Project-local installation is preferred for project-specific setup and version control; global installation is convenient for personal reuse.

Then ask your agent for a diagram, for example:

```text
/seditor map the authentication flow
/seditor create a screen map for the checkout flow
```

The skill inspects the project and creates `.SEditor/<type>-<topic>.json` plus a same-name `.html` launcher that embeds the schema and editor. Open that HTML file to edit the diagram; select a node and use `Ctrl/Cmd+C/V/X/Z` for copy, paste, cut, and undo. Node is only needed to generate and validate files.

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
