// Codemod: quarantine Leaflet-bound cross-port tests with `test.fixme(...)`.
//
// Reads the classification produced by classify-leaflet.js and rewrites each
// flagged `test(` into `test.fixme(`, prefixed with a TODO naming the Leaflet
// API that blocks it. `fixme` keeps the test in its original file and position
// (these upstream specs share one page per describe and mutate it in sequence,
// so moving tests between files would change what the survivors see) while
// excluding it from the run.
//
// To convert one back: rewrite the assertions against OpenLayers state, then
// drop the TODO line and the `.fixme`.
//
// Usage: node cross-port-test/quarantine-leaflet.js [--status=failed,timedOut] [--mixed-only] [--restore] [--apply]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  classify,
  E2E,
  leafletReasons,
  testBlocks,
  walk
} from './classify-leaflet.js';

const statusArg = process.argv.find((a) => a.startsWith('--status='));
const statuses = new Set(
  (statusArg ? statusArg.split('=')[1] : 'failed,timedOut').split(',')
);
const apply = process.argv.includes('--apply');
// Files where EVERY test is Leaflet-bound are quarantined by renaming them to
// `*-leaflet.test.js` instead, which playwright.cross-port.config.js ignores.
const mixedOnly = process.argv.includes('--mixed-only');

// Reverse pass: once a test's Leaflet dependency has been rewritten (e.g. to the
// data-testid contract), drop its quarantine so it runs again.
if (process.argv.includes('--restore')) {
  let restored = 0;
  let touched = 0;
  for (const abs of walk(E2E)) {
    if (abs.endsWith('-leaflet.test.js')) continue;
    let src = readFileSync(abs, 'utf8');
    const blocks = testBlocks(src)
      .filter((b) => b.modifier === '.fixme' && !leafletReasons(b.body).length)
      .sort((a, b) => b.start - a.start);
    if (!blocks.length) continue;
    for (const b of blocks) {
      const lineStart = src.lastIndexOf('\n', b.start) + 1;
      const prevStart = src.lastIndexOf('\n', lineStart - 2) + 1;
      const prevLine = src.slice(prevStart, lineStart);
      const cut = /^\s*\/\/ TODO\(cross-port\): Leaflet-only/.test(prevLine)
        ? prevStart
        : lineStart;
      src =
        src.slice(0, cut) +
        src.slice(lineStart, b.start) +
        'test(' +
        src.slice(b.start + 'test.fixme('.length);
      restored++;
    }
    touched++;
    console.log(`  ${blocks.length}  ${relative(E2E, abs)}`);
    if (apply) writeFileSync(abs, src);
  }
  console.log(
    `${apply ? 'Restored' : 'Would restore'} ${restored} tests across ${touched} files.`
  );
  if (!apply) console.log('Re-run with --apply to write the changes.');
  process.exit(0);
}

let changed = 0;
let files = 0;
for (const [rel, entry] of classify()) {
  if (mixedOnly && entry.leaflet.length === entry.total) continue;
  const targets = entry.leaflet.filter((t) => statuses.has(t.status));
  if (!targets.length) continue;

  const abs = join(E2E, rel);
  let src = readFileSync(abs, 'utf8');
  // Rewrite from the end so earlier offsets stay valid.
  const edits = targets
    .filter((t) => !t.alreadyFixme)
    .sort((a, b) => b.start - a.start);
  for (const t of edits) {
    const lineStart = src.lastIndexOf('\n', t.start) + 1;
    const indent = src.slice(lineStart, t.start).match(/^\s*/)[0];
    const todo = `${indent}// TODO(cross-port): Leaflet-only (${t.reasons.join(', ')}) — rewrite against OpenLayers state.\n`;
    src =
      src.slice(0, lineStart) +
      todo +
      src.slice(lineStart, t.start) +
      'test.fixme(' +
      src.slice(t.start + 'test('.length);
    changed++;
  }
  if (edits.length) {
    files++;
    if (apply) writeFileSync(abs, src);
  }
}

console.log(
  `${apply ? 'Quarantined' : 'Would quarantine'} ${changed} tests across ${files} files (statuses: ${[...statuses].join(', ')}).`
);
if (!apply) console.log('Re-run with --apply to write the changes.');
