// Rewrites Leaflet-specific control selectors in the cross-port suite to the
// `data-testid` contract that MapML-OpenLayers, MapML.js and MapML-MapLibre all
// emit, so the same spec drives any of the three renderers.
//
// Only whole-control selectors are handled here. Selectors that reach INSIDE the
// layer control (`.leaflet-control-layers-overlays > fieldset > ...`) encode DOM
// structure rather than identity and need per-element testids first.
//
// Usage: node tools/retestid.js [--apply]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { E2E } from './classify-leaflet.js';

// Ordered: the corner-qualified forms must win over the bare ones.
const RULES = [
  [/\.leaflet-top\.leaflet-left > \.leaflet-control-zoom\b/g, 'zoom-control'],
  [/\.leaflet-top\.leaflet-left > \.mapml-reload-button\b/g, 'reload-control'],
  [
    /\.leaflet-top\.leaflet-left > \.leaflet-control-fullscreen\b/g,
    'fullscreen-control'
  ],
  [
    /\.leaflet-top\.leaflet-right > \.leaflet-control-layers\b(?!-)/g,
    'layer-control'
  ],
  [
    /\.leaflet-bottom\.leaflet-right > \.leaflet-control-locate\b/g,
    'locate-control'
  ],
  [
    /\.leaflet-bottom\.leaflet-left > \.mapml-control-scale\b/g,
    'scale-control'
  ],
  [/\.leaflet-top\.leaflet-left > \.mapml-search-control\b/g, 'search-control'],
  [/\.leaflet-control-zoom-in\b/g, 'zoom-in-button'],
  [/\.leaflet-control-zoom-out\b/g, 'zoom-out-button'],
  // Hovering the top-right corner is how upstream expands the layer control.
  [/\.leaflet-top\.leaflet-right(?!\s*>)(?![\w-])/g, 'layer-control'],
  [/\.leaflet-control-layers\b(?!-)(?:\.leaflet-control\b)?/g, 'layer-control']
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const apply = process.argv.includes('--apply');
let total = 0;
let files = 0;
for (const abs of walk(E2E)) {
  const src = readFileSync(abs, 'utf8');
  let out = src;
  let n = 0;
  for (const [re, testid] of RULES) {
    out = out.replace(re, () => {
      n++;
      return `[data-testid="${testid}"]`;
    });
  }
  if (!n) continue;
  files++;
  total += n;
  console.log(`  ${String(n).padStart(3)}  ${relative(E2E, abs)}`);
  if (apply) writeFileSync(abs, out);
}
console.log(
  `${apply ? 'Rewrote' : 'Would rewrite'} ${total} selectors across ${files} files.`
);
if (!apply) console.log('Re-run with --apply to write the changes.');
