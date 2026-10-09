#!/usr/bin/env node
// Validate SEditor schema file(s) without opening the editor.
// Zero dependencies — run with `node scripts/validate-scheme.mjs .SEditor/*.json`.
//
// The rules below replicate the behaviour of the bundled app/editor.html
// (shape vocabulary, size clamping, URL-ignoring, positional zone/level/stage
// membership). If the editor is ever updated, re-check this file against it.
//
// Exit code 0 = everything valid, 1 = at least one error.
// Warnings never fail the run; they flag things the editor would silently change.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

// Mirrors app/editor.html: cg / lg / dg / fg / pg / mg / hg and the size table.
const SHAPES = ['square', 'rect', 'circle', 'ellipse', 'diamond', 'hexagon', 'triangle', 'label', 'table', 'zone', 'level', 'stage'];
const DIVIDERS = ['level', 'stage']; // layout shapes, not draggable
const HANDLES = ['inside', 'top', 'right', 'bottom', 'left']; // dg — also the labelPos vocabulary
const DASHES = ['solid', 'dashed', 'dotted'];
const MARKERS = ['none', 'arrow', 'triangle', 'circle'];
const EDGE_TYPES = ['straight', 'step', 'smoothstep', 'bezier'];
const ARROWS = ['none', 'end', 'start', 'both'];
const SIZES = {
  square: { min: 12, max: 4000, lock: true },
  rect: { min: 12, max: 4000 },
  circle: { min: 12, max: 4000, lock: true },
  ellipse: { min: 12, max: 4000 },
  diamond: { min: 12, max: 4000, lock: true },
  hexagon: { min: 12, max: 4000 },
  triangle: { min: 12, max: 4000 },
  label: { minW: 24, minH: 20, max: 4000 },
  table: { minW: 40, minH: 40, max: 4000 },
  zone: { min: 24, minH: 24, max: 20000 },
  level: { minW: 60, minH: 14, maxW: 400, maxH: 14 },
  stage: { minW: 14, minH: 60, maxW: 14, maxH: 400 }
};

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const bounds = (n) => {
  const c = SIZES[n.data?.shape] || SIZES.rect;
  let w = Number(n.width) || 160;
  let h = Number(n.height) || 80;
  w = Math.min(Math.max(w, c.minW ?? c.min ?? 12), c.maxW ?? c.max ?? 4000);
  h = Math.min(Math.max(h, c.minH ?? c.min ?? 12), c.maxH ?? c.max ?? 4000);
  if (c.lock) { const s = Math.min(w, h); w = s; h = s; }
  const x = Number(n.position?.x) || 0;
  const y = Number(n.position?.y) || 0;
  return { x, y, x2: x + w, y2: y + h, cx: x + w / 2, cy: y + h / 2, w, h };
};
// app/editor.html: wg — plain rect intersection, overlap on an edge counts.
const overlaps = (a, b) => a.x < b.x2 && a.x2 > b.x && a.y < b.y2 && a.y2 > b.y;
// app/editor.html: Dg — the non-default label side shifts a divider's band by one.
const BAND_SHIFT_SIDE = { level: 'bottom', stage: 'right' };
const BAND_DEFAULT_SIDE = { level: 'top', stage: 'left' };
// Count of divider axes at or below the coordinate (app/editor.html: Og).
const bandIndex = (dividers, axis, coord) => dividers.filter((d) => bounds(d)[axis] <= coord).length;
// Which divider owns a node's centre band. Verified against app/editor.html:
// the topmost divider also owns everything above it; the last owns nothing below.
function bandOwner(dividers, kind, center, axis) {
  const sorted = dividers.slice().sort((p, q) => bounds(p)[axis] - bounds(q)[axis]);
  const index = bandIndex(sorted, axis, center);
  for (let j = 0; j < sorted.length; j += 1) {
    const declaredSide = sorted[j].data?.labelPos ?? BAND_DEFAULT_SIDE[kind];
    const key = j + (declaredSide === BAND_SHIFT_SIDE[kind] ? 1 : 0);
    if (key === index) return sorted[j];
  }
  return null;
}

// Level/stage band rules above were derived from app/editor.html and confirmed in a
// browser. These cases are the exact probes that produced the recorded results;
// they run before any file is read, so a drift in the rule fails fast.
const BAND_CASES = [
  // `y` is the level's own position.y; `center` is the probed node's centre Y.
  // Every row is a probe whose result was read back from app/editor.html in a browser.
  { y: [300], center: 140, expect: 0 },                      // node above the line
  { y: [300], center: 540, expect: null },                   // node below the line
  { y: [100, 400], center: -160, expect: 0 },                // above both -> topmost divider
  { y: [100, 400], center: 240, expect: 1 },                 // between -> lower divider
  { y: [100, 400], center: 640, expect: null },              // below both -> nothing
  { y: [300], center: 140, expect: null, labelPos: 'bottom' }, // band shifted down
  { y: [300], center: 540, expect: 0, labelPos: 'bottom' }
];

function selfcheck() {
  let failed = 0;
  for (const c of BAND_CASES) {
    const dividers = c.y.map((y, i) => ({
      id: `d${i}`,
      position: { x: 0, y },
      width: 400,
      height: 14,
      data: { shape: 'level', labelPos: c.labelPos ?? 'top' }
    }));
    const owner = bandOwner(dividers, 'level', c.center, 'cy');
    const got = owner ? Number(owner.id.slice(1)) : null;
    if (got !== c.expect) {
      failed += 1;
      console.error(
        `selfcheck FAIL: y=${JSON.stringify(c.y)} center=${c.center} labelPos=${c.labelPos ?? 'top'} -> got ${got}, expected ${c.expect}`
      );
    }
  }
  if (!failed) console.log(`selfcheck ok (${BAND_CASES.length} level-band cases)`);
  return failed;
}

function validate(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    return err(`${path}: cannot read (${e.message})`);
  }
  let s;
  try {
    s = JSON.parse(raw);
  } catch (e) {
    return err(`${path}: invalid JSON (${e.message})`);
  }

  const file = basename(path);
  if (s.version !== 1) err(`${file}: "version" must be 1, got ${JSON.stringify(s.version)}`);
  if (!Array.isArray(s.nodes)) err(`${file}: "nodes" must be an array`);
  if (!Array.isArray(s.edges)) err(`${file}: "edges" must be an array`);
  if (!Array.isArray(s.nodes) || !Array.isArray(s.edges)) return;

  const name = s.meta?.name;
  if (!name) warn(`${file}: "meta.name" is empty — the editor shows "Untitled" until you rename it`);

  const ids = new Set();
  for (const n of s.nodes) {
    const id = n?.id;
    if (typeof id !== 'string' || !id) { err(`${file}: node without a string "id"`); continue; }
    if (ids.has(id)) err(`${file}: duplicate node id "${id}"`);
    ids.add(id);
    const shape = n.data?.shape;
    if (!SHAPES.includes(shape)) err(`${file}: node "${id}" has unsupported data.shape ${JSON.stringify(shape)}`);
    if (n.data?.labelPos != null && !HANDLES.includes(n.data.labelPos)) {
      err(`${file}: node "${id}" has data.labelPos ${JSON.stringify(n.data.labelPos)}; use one of ${HANDLES.join('|')}`);
    }
    const b = bounds(n);
    if (DIVIDERS.includes(shape) && (b.w !== Number(n.width) || b.h !== Number(n.height))) {
      warn(`${file}: node "${id}" (${shape}) is ${n.width}x${n.height}; the editor renders it as ${b.w}x${b.h}`);
    }
    if (shape === 'zone' && Array.isArray(n.data?.contains) && n.data.contains.length) {
      // app/editor.html: Ag recomputes zone.contains from geometry on every save.
      warn(`${file}: zone "${id}" declares data.contains — the editor rewrites it from geometry, so it will be dropped`);
    }
    if (shape === 'table') {
      if (!Number.isInteger(n.data?.cols) || n.data.cols < 1) err(`${file}: table "${id}" needs data.cols >= 1`);
      if (!Number.isInteger(n.data?.rows) || n.data.rows < 1) err(`${file}: table "${id}" needs data.rows >= 1`);
      // app/editor.html: the table reader only accepts { "row,col": text }.
      for (const key of Object.keys(n.data?.cells || {})) {
        if (!/^\d+,\d+$/.test(key)) err(`${file}: table "${id}" has cell key ${JSON.stringify(key)}; use "row,col" (e.g. "0,1")`);
      }
    }
    if (n.data?.cells === undefined && shape === 'table') {
      warn(`${file}: table "${id}" has no data.cells — it renders as an empty grid`);
    }
  }

  const edgeIds = new Set();
  for (const e of s.edges) {
    const id = e?.id ?? '(no id)';
    if (edgeIds.has(id)) err(`${file}: duplicate edge id "${id}"`);
    edgeIds.add(id);
    if (!ids.has(e?.source)) err(`${file}: edge "${id}" source ${JSON.stringify(e?.source)} is not a node id`);
    if (!ids.has(e?.target)) err(`${file}: edge "${id}" target ${JSON.stringify(e?.target)} is not a node id`);
    if (!HANDLES.includes(e?.sourceHandle) || e.sourceHandle === 'inside') err(`${file}: edge "${id}" sourceHandle must be top|right|bottom|left`);
    if (!HANDLES.includes(e?.targetHandle) || e.targetHandle === 'inside') err(`${file}: edge "${id}" targetHandle must be top|right|bottom|left`);
    if (e?.type != null && !EDGE_TYPES.includes(e.type)) err(`${file}: edge "${id}" type ${JSON.stringify(e.type)}; use ${EDGE_TYPES.join('|')}`);
    if (e?.data?.dash != null && !DASHES.includes(e.data.dash)) err(`${file}: edge "${id}" dash ${JSON.stringify(e.data.dash)}`);
    if (e?.data?.marker != null && !MARKERS.includes(e.data.marker)) err(`${file}: edge "${id}" marker ${JSON.stringify(e.data.marker)}; use ${MARKERS.join('|')}`);
    if (e?.data?.arrow != null && !ARROWS.includes(e.data.arrow)) err(`${file}: edge "${id}" arrow ${JSON.stringify(e.data.arrow)}`);
  }

  // Containment is positional in app/editor.html. A declared-but-not-overlapping
  // zone exists in the file but is dropped the first time the human saves.
  const byId = new Map(s.nodes.filter((n) => n?.id).map((n) => [n.id, n]));
  for (const n of s.nodes) {
    if (!n?.id || DIVIDERS.includes(n.data?.shape) || n.data?.shape === 'zone') continue;
    const declaredZones = n.data?.zones || [];
    const actualZones = s.nodes
      .filter((z) => z.data?.shape === 'zone' && overlaps(bounds(n), bounds(z)))
      .map((z) => z.id);
    for (const zid of declaredZones) {
      const z = byId.get(zid);
      if (!z) err(`${file}: node "${n.id}" lists unknown zone "${zid}"`);
      else if (z.data?.shape !== 'zone') err(`${file}: node "${n.id}" lists "${zid}" in data.zones but its shape is ${z.data?.shape}`);
      else if (!actualZones.includes(zid)) {
        warn(`${file}: node "${n.id}" declares zone "${zid}" but does not overlap it — the editor will drop the link on save`);
      }
    }
    if (declaredZones.length && actualZones.length && !declaredZones.some((z) => actualZones.includes(z))) {
      warn(`${file}: node "${n.id}" overlaps ${actualZones.join(', ')} but declares ${declaredZones.join(', ')}`);
    }
    for (const kind of ['level', 'stage']) {
      // The editor stores the band in data.level / data.stage as the divider's *label*
      // (verified in a browser). data.levels / data.stages are neither read nor written.
      const plural = n.data?.[kind + 's'];
      if (Array.isArray(plural) && plural.length) {
        warn(
          `${file}: node "${n.id}" sets data.${kind}s — the editor neither reads nor writes it; it stores the band label in data.${kind}`
        );
      }
      const dividers = s.nodes.filter((d) => d.data?.shape === kind);
      if (!dividers.length) continue;
      const axis = kind === 'level' ? 'cy' : 'cx';
      const owner = bandOwner(dividers, kind, bounds(n)[axis], axis);
      const declared = n.data?.[kind];
      if (declared == null) continue;
      if (typeof declared !== 'string') {
        err(`${file}: node "${n.id}" data.${kind} must be the band label (string) or null`);
        continue;
      }
      const ownerLabel = owner ? (owner.data?.label || '').trim() : null;
      if (declared.trim() !== ownerLabel) {
        warn(
          `${file}: node "${n.id}" data.${kind} is ${JSON.stringify(declared)} but its centre sits in ${JSON.stringify(ownerLabel)}'s band — the editor recomputes this on save`
        );
      }
    }
  }
}

const args = process.argv.slice(2);
if (args.includes('--selfcheck')) process.exit(selfcheck() ? 1 : 0);

const files = args;
if (!files.length) {
  console.error('usage: node scripts/validate-scheme.mjs <.SEditor/*.json>');
  process.exit(1);
}
for (const f of files) validate(f);

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
if (!errors.length && !warnings.length) console.log(`ok    ${files.length} schema file(s) valid`);
else if (!errors.length) console.log(`ok    ${files.length} schema file(s) valid, ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
