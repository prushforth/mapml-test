// Classifies each cross-port test as Leaflet-bound or not, so the Leaflet-only
// ones can be quarantined and converted one at a time.
//
// A test is only flagged when it BOTH failed/timed out in the last run AND its
// body touches an API or DOM structure that exists solely in Leaflet. Tests that
// pass are never flagged, and neither are failures with no Leaflet fingerprint —
// those are real porting differences worth keeping red.
//
// Usage: node tools/classify-leaflet.js [--detail]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E = fileURLToPath(new URL('../test/e2e/', import.meta.url));

// `leaflet-` class names the OpenLayers port still emits (see src/). A selector
// using one of these resolves here, so it is NOT a Leaflet dependency.
const RETAINED = new Set([
  'leaflet-container',
  'leaflet-disabled',
  'leaflet-control-layers',
  'leaflet-control-layers-expanded',
  'leaflet-control-layers-toggle',
  'leaflet-control-layers-selector',
  'leaflet-control-layers-list',
  'leaflet-control-layers-overlays',
  'leaflet-control-scale-line',
  'leaflet-control-fullscreen'
]);

// Leaflet-only JS surface reached through the viewer's internals. Most of these
// hang off `layerEl._layer` / `viewer._map`, which are Leaflet objects upstream
// and OpenLayers objects here, so the property simply does not exist.
const API_MARKERS = [
  /_leaflet_id/,
  /\b_map\.(getContainer|getCenter|getZoom|getBounds|getPanes?|getPixelBounds|latLngToContainerPoint|containerPointToLatLng|options)\b/,
  /\bL\.(Map|LatLng|Point|Bounds|DomUtil|DomEvent)\b/,
  /_mapmlFeatures/,
  /\.def(Loc|Ext)CS\b/,
  /\._leaflet\b/,
  /\bleafletLayer\b/,
  /\.crs\b/,
  /\._container\b/,
  /\._enabled\b/
];

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

// Split a spec into per-test source blocks, keeping each `test(` offset so a
// codemod can rewrite it in place. Titles may be multi-line template literals
// with line continuations, so the title class has to match newlines and the
// captured title needs the continuations collapsed to match the reported name.
export function testBlocks(src) {
  const re =
    /\btest(\.only|\.skip|\.fixme)?\(\s*(['"`])((?:\\[\s\S]|(?!\2)[\s\S])*)\2/g;
  const hits = [];
  let m;
  while ((m = re.exec(src)))
    hits.push({
      title: m[3].replace(/\\\r?\n/g, ''),
      start: m.index,
      modifier: m[1] || ''
    });
  return hits.map((h, i) => ({
    ...h,
    body: src.slice(h.start, hits[i + 1] ? hits[i + 1].start : src.length)
  }));
}

export function leafletReasons(body) {
  const reasons = new Set();
  // A quarantine TODO sits immediately above the NEXT test, so it falls inside
  // this block's slice; ignore it or neighbours get flagged by our own marker.
  const src = body.replace(/^[ \t]*\/\/ TODO\(cross-port\):.*$/gm, '');
  for (const tok of src.match(/leaflet-[a-z-]+/g) || [])
    if (!RETAINED.has(tok)) reasons.add('.' + tok);
  for (const re of API_MARKERS) {
    const hit = src.match(re);
    if (hit) reasons.add(hit[0]);
  }
  return [...reasons];
}

export function classify(failsPath = '/tmp/fails.json') {
  const failed = new Map();
  for (const f of JSON.parse(readFileSync(failsPath, 'utf8')))
    failed.set(f.file + '::' + f.title, f.status);

  const perFile = new Map();
  for (const abs of walk(E2E)) {
    const rel = relative(E2E, abs);
    const blocks = testBlocks(readFileSync(abs, 'utf8'));
    if (!blocks.length) continue;
    const entry = { total: blocks.length, leaflet: [], otherFail: 0, pass: 0 };
    for (const b of blocks) {
      const status = failed.get(rel + '::' + b.title);
      if (!status) {
        entry.pass++;
        continue;
      }
      const reasons = leafletReasons(b.body);
      if (reasons.length)
        entry.leaflet.push({
          title: b.title,
          status,
          reasons,
          start: b.start,
          alreadyFixme: b.modifier === '.fixme'
        });
      else entry.otherFail++;
    }
    perFile.set(rel, entry);
  }
  return perFile;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const perFile = classify();
  const flagged = [...perFile].filter(([, e]) => e.leaflet.length);
  let whole = 0;
  let mixed = 0;
  console.log('=== files where EVERY test is Leaflet-bound ===');
  for (const [f, e] of flagged)
    if (e.leaflet.length === e.total) {
      whole++;
      console.log(`  ${String(e.leaflet.length).padStart(2)}/${e.total}  ${f}`);
    }
  console.log('\n=== files with a Leaflet-bound SUBSET ===');
  for (const [f, e] of flagged)
    if (e.leaflet.length !== e.total) {
      mixed++;
      console.log(
        `  leaflet=${e.leaflet.length} pass=${e.pass} otherFail=${e.otherFail} total=${e.total}  ${f}`
      );
    }
  const count = flagged.reduce((n, [, e]) => n + e.leaflet.length, 0);
  console.log(
    `\nTOTAL Leaflet-bound tests: ${count}  (whole files: ${whole}, mixed files: ${mixed})`
  );

  if (process.argv.includes('--detail')) {
    console.log('\n=== reasons ===');
    for (const [f, e] of flagged)
      for (const t of e.leaflet)
        console.log(
          `${f}\n    [${t.status}] ${t.title}\n    -> ${t.reasons.join(', ')}`
        );
  }
}
