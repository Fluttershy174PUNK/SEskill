# SEditor schema format (reference)

> The canonical description of the schema the editor reads and writes. `SEditor/README.md`
> carries only a short example; this file wins wherever they disagree.
>
> Everything below was verified against `app/editor.html` in a browser. If the editor is
> updated, re-verify with `scripts/validate-scheme.mjs` in the `seditor` skill — it encodes
> the same rules.

## Top-level shape

```json
{
  "version": 1,
  "meta": { "name": "<scheme-name>", "app": "SEditor", "updated": "<ISO-8601>" },
  "nodes": [],
  "edges": [],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `version` | yes | Must be `1`. |
| `meta.name` | yes | Becomes the editor's schema name. The editor does **not** derive it from the filename — if it is empty the toolbar shows "Untitled" and Save suggests `schema.json`. Keep it equal to the slug. |
| `meta.app` | no | The editor always writes `"SEditor"`. |
| `meta.updated` | no | The editor overwrites this with the save timestamp. |
| `nodes` / `edges` | yes | Arrays; may be empty. |
| `viewport` | no | Camera position; the editor rewrites it. Safe to set `{x:0,y:0,zoom:1}`. |
| `meta.path` | no | Added by the backend on save (used by the "recent" list). Do not write it yourself. |

## Node

```json
{
  "id": "n1",
  "type": "shape",
  "position": { "x": 0, "y": 0 },
  "width": 160,
  "height": 80,
  "data": { "shape": "rect", "label": "Начало", "labelPos": "inside", "desc": "точка входа" }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Unique, stable, non-empty string. |
| `type` | yes | Always `"shape"` — **even for zone / level / stage and table nodes**. `"zone"`, `"level"`, `"table"` as a node `type` still render (the editor falls back to `rect`'s size table), but the shape then comes only from `data.shape`. Use `"shape"` everywhere. |
| `position` | yes | Top-left corner, editor coordinates. |
| `width` / `height` | yes | Integers. **Clamped on load** — see "Sizes are clamped". |
| `data.shape` | yes | One of the twelve shapes below. |
| `data.label` | no | Visible text (Russian and English both render). |
| `data.labelPos` | no | `inside` (default), `top`, `right`, `bottom`, `left`. |
| `data.desc` | no | Long-form text; shown in the properties panel. Not drawn on the canvas. |
| `data.cells` | table only | `{ "row,col": "text" }`, zero-based. This is the **only** key the table reader understands. |
| `data.cols` / `data.rows` / `data.header` | table only | Integers ≥ 1, `header` boolean (first row is a header band). |
| `data.zones` | no | Written by the editor from geometry (list of zone ids). See "Containment is positional". |
| `data.level` / `data.stage` | no | Written by the editor from geometry (the band divider's `label`, or `null`). |
| `zIndex` | no | `-2` for zone, `-1` for level/stage; the editor sets this itself. |

### Shape vocabulary

| Shape | Node `type` the editor uses | Drawn as | Default size |
| --- | --- | --- | --- |
| `square` | `shape` | shape | 96×96 (locked square) |
| `rect` | `shape` | shape | 160×80 |
| `circle` | `shape` | shape | 96×96 (locked square) |
| `ellipse` | `shape` | shape | 160×96 |
| `diamond` | `shape` | shape | 112×112 (locked square) |
| `hexagon` | `shape` | shape | 140×96 |
| `triangle` | `shape` | shape | 120×104 |
| `label` | `text` | shape | 140×32 |
| `table` | `table` | grid | 240×120 |
| `zone` | `zone` | container overlay | 280×200 |
| `level` | `divider` | full-width horizontal line | 180×14 |
| `stage` | `divider` | full-height vertical line | 14×180 |

### Sizes are clamped

The editor runs every node through its size table on load
(`app/editor.html`: `xg`), so a size outside the range comes back different:

| Shape | Min | Max | Notes |
| --- | --- | --- | --- |
| `square`, `circle`, `diamond` | 12 | 4000 | Side-locked: `width` and `height` collapse to the smaller value. |
| `rect`, `ellipse`, `hexagon`, `triangle` | 12 | 4000 | Free. |
| `label` | 24 × 20 | 4000 | |
| `table` | 40 × 40 | 4000 | |
| `zone` | 24 × 24 | 20000 | |
| `level` | 60 wide | **400 wide, 14 tall** | `height` is *always* 14. |
| `stage` | 60 tall | **14 wide, 400 tall** | `width` is *always* 14. |

So: **never write `width: 1000` on a `level`** — the editor silently renders 400 and
writes 400 back. A divider should span the diagram visually; the editor already
extends it to the whole board, so a 400-wide `level` still draws across everything.

## Edge

```json
{
  "id": "e1",
  "source": "n1",
  "target": "n2",
  "sourceHandle": "right",
  "targetHandle": "left",
  "type": "straight",
  "data": { "label": "да", "dash": "solid", "marker": "arrow", "arrow": "end" }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Unique. |
| `source` / `target` | yes | Node ids. **Edges pointing at unknown nodes are silently dropped on load.** |
| `sourceHandle` / `targetHandle` | yes | `top`, `right`, `bottom`, `left`. `inside` is *not* a handle — it is the default `labelPos`, not an anchor. |
| `type` | no | `straight` (default), `step`, `smoothstep`, `bezier`. |
| `data.label` | no | Short edge caption. |
| `data.dash` | no | `solid` (default), `dashed`, `dotted`. |
| `data.marker` | no | `none`, `arrow`, `triangle`, `circle`. |
| `data.arrow` | no | `none`, `end` (default), `start`, `both`. |
| `data.width` | no | Stroke width, ≥ 1. Default 2. |
| `data.stroke` | no | Hex colour. Default `#cfe3f5`. |

## Containment is positional, not declarative

**This is the biggest difference from the upstream README.** The editor computes
zone / level / stage membership from **geometry** every time it loads and saves
(`app/editor.html`: `kg`, `Ag`). The `data.zones`, `data.levels`, `data.stages` and
zone's `data.contains` fields in a file are **outputs**, not inputs:

| What you write | What the editor does |
| --- | --- |
| `data.zones: ["z1"]` on a node whose bounds do **not** overlap the `z1` rect | Drops the link on save — the node is not inside the zone. |
| A node overlapping a zone but with `data.zones: []` | Adds the link on save. |
| `data.contains` on a `zone` | Always rewritten from geometry. |
| `data.level` / `data.stage` | **These are the editor's output fields.** It writes them itself as the band's **label string** (or `null`). A value you write that disagrees with the geometry is overwritten on save. |
| `data.levels` / `data.stages` (arrays) | **Neither read nor written.** Do not use them — the editor stores band membership in the singular `data.level` / `data.stage` keys. |

Rules the editor applies:

- **Zone**: a node belongs to a zone iff their rectangles intersect (`a.x < b.x2 && a.x2 > b.x && a.y < b.y2 && a.y2 > b.y`). A node can overlap **several** zones; the editor then lists all of them.
- **Level** (horizontal divider): the divider's band is the region **above the line**, not below it.
  Concretely, a node's centre Y is compared against the sorted divider positions: the
  topmost level owns everything above it, each following level owns the strip between it
  and the one above, and **a node below the last level belongs to no level at all**.
- **Stage** (vertical divider): the same on the X axis — the band is to the **left** of the line.
- A node's **centre**, not its top-left corner, decides the band.
- The divider's `data.labelPos` shifts the band: with the default (`top` for level, `left`
  for stage) the band sits above/left of the line; switching it to `bottom` / `right` moves
  the node one band down.
- The stored value is the divider's **`label`**, not its id. An unlabelled divider therefore
  contributes an empty string, and nodes in its band get `data.level: ""`.

**Practical consequence:** to put nodes in a lane, place the `level` **above** them, give it a
`label` (that label is what lands in the node JSON), and add one final level at the bottom of
the diagram if the lowest group needs a lane too. Size zones generously so they actually
overlap their children, then verify with:

```bash
node <skill-dir>/scripts/validate-scheme.mjs .SEditor/*.json
```

The validator flags every declared-but-mismatched link as a warning.

## Minimal valid example

```json
{
  "version": 1,
  "meta": { "name": "hello-world", "app": "SEditor" },
  "nodes": [
    { "id": "n1", "type": "shape", "position": { "x": 0, "y": 0 }, "width": 96, "height": 96,
      "data": { "shape": "circle", "label": "Start", "labelPos": "inside" } },
    { "id": "n2", "type": "shape", "position": { "x": 240, "y": 8 }, "width": 160, "height": 80,
      "data": { "shape": "rect", "label": "Say hello", "labelPos": "inside" } },
    { "id": "n3", "type": "shape", "position": { "x": 520, "y": 0 }, "width": 96, "height": 96,
      "data": { "shape": "circle", "label": "End", "labelPos": "inside" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "sourceHandle": "right", "targetHandle": "left",
      "type": "straight", "data": { "label": "", "dash": "solid", "marker": "arrow", "arrow": "end" } },
    { "id": "e2", "source": "n2", "target": "n3", "sourceHandle": "right", "targetHandle": "left",
      "type": "straight", "data": { "label": "", "dash": "solid", "marker": "arrow", "arrow": "end" } }
  ]
}
```

## Containers, done right

Put the zone rect around its children *before* the children exist, then place the
children inside it:

```jsonc
// zone first, sized to contain what follows (>= 60px margin on every side)
{ "id": "z1", "type": "shape", "position": { "x": -60, "y": -60 }, "width": 620, "height": 260,
  "data": { "shape": "zone", "label": "Authentication", "labelPos": "top", "border": "dashed" } },

// child: its rect must intersect z1's rect — no data.zones needed
{ "id": "n3", "type": "shape", "position": { "x": 40, "y": 20 }, "width": 160, "height": 80,
  "data": { "shape": "rect", "label": "Validate token", "labelPos": "inside" } },

// level band: a level owns the region *above* its line, so a node below y=300
// belongs to no level unless another level exists further down. Its `label`
// is what the editor stores in a node's data.level.
{ "id": "l1", "type": "shape", "position": { "x": -60, "y": 300 }, "width": 400, "height": 14,
  "data": { "shape": "level", "label": "Above the line", "labelPos": "top", "dash": "dashed" } }
```

## Tables

```jsonc
{ "id": "t1", "type": "shape", "position": { "x": 660, "y": 60 }, "width": 280, "height": 140,
  "data": { "shape": "table", "label": "", "cols": 3, "rows": 2, "header": true,
            "cells": { "0,0": "id", "0,1": "имя", "0,2": "статус",
                       "1,0": "1",  "1,1": "Задача", "1,2": "готово" } } }
```

- Cell keys are `"row,col"`, **zero-based**, as strings. This is the only key format the
  table reader accepts.
- `rows` counts data rows; the header (when `header: true`) is drawn as an extra band,
  so a 3-row table with a header shows 4 bands. Set `rows` to your data-row count.
- Keys that do not match `"row,col"` (e.g. Excel-style `"A1"`) are ignored — only the
  well-formed keys render.
- Text is clamped per cell, so keep entries short.
- `cells`, `cols`, `rows` and `header` survive a normal open → edit → save round trip
  (verified in a browser against the bundled editor).

## Layout hints

- **Spacing**: leave ≥ 40 px between node edges so edge labels do not collide.
- **Grid**: snap positions to multiples of 8 (that is the editor's snap step), ideally 20 or 40.
- **Decision fan-out**: a `diamond` usually has two outgoing edges labelled `да` / `нет`.
- **Edges first, coordinates second**: place nodes, then point edges at real ids.
- **Stable ids**: `n1`, `n2`, … for plain nodes, `z1`/`l1`/`s1` for containers, `e1`, `e2`, … for edges.

## What the editor does NOT support

- No custom ports: every node has exactly four cardinal handles.
- No nested zones: a node's `zones` list is geometric, so nesting requires overlapping rects.
- No edge routing beyond the four path types; no edge bundles.
- No multi-line node bodies: `label` is short, `desc` is the long text, `table` is tabular data.
- No `labelPos: "above" | "below"` — those are `top` / `bottom`.

## Validate before you hand off

```bash
node <skill-dir>/scripts/validate-scheme.mjs .SEditor/*.json
```

It checks JSON validity, id uniqueness, shape/handle/enum vocabularies, table cell
keys, size clamping, and geometric containment — the same rules listed above.
