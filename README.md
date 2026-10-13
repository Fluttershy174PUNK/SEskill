# SEskill

An Agent Skill that turns a project into a compact visual diagram, then pairs the SEditor JSON with an HTML launcher. Open the launcher in a browser; no server is required.

[Русская версия README](README.ru.md) · [SEditor](https://github.com/Fluttershy174PUNK/SEditor)

## Install

Install the repository in pi:

```bash
pi install git:github.com/Fluttershy174PUNK/SEskill
```

For other Agent Skills-compatible tools, copy only `skills/seditor/` into the tool's skills directory. Keep that folder named `seditor`.

Then ask your agent for a diagram, for example:

```text
/seditor map the authentication flow
/seditor create a screen map for the checkout flow
```

The skill inspects the project and creates `.SEditor/<type>-<topic>.json` plus a same-name `.html` launcher. Open the HTML file to edit the diagram.

## Schema and compatibility

The skill writes compact SEditor schema v1 JSON. Older unversioned and v1 files remain supported; unknown future versions must not be downgraded. Defaults and geometry-derived membership are omitted from new saves. See the canonical [schema reference](skills/seditor/references/schema-format.md).

## Validate and test

```bash
node skills/seditor/scripts/validate-scheme.mjs .SEditor/*.json
bash verify.sh
```

`verify.sh` runs package validation, runtime checksum/vendor parity, launcher and backend integration tests, schema tests, and mechanical output-eval scenarios. It needs a sibling SEditor checkout, or set `SEDITOR_ROOT` to one.

## License

MIT — see [LICENSE](LICENSE).
