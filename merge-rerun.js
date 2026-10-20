// Merges the 30s confirmation rerun over the baseline full run, so the
// classifier works from the most trustworthy status for every test.
import { readFileSync, writeFileSync } from 'node:fs';

const base = JSON.parse(readFileSync('/tmp/fails.json', 'utf8'));
const rerun = JSON.parse(readFileSync('/tmp/rerun30.json', 'utf8'));
const key = (x) => x.file + '::' + x.title;

const rerunByKey = new Map();
for (const r of rerun) rerunByKey.set(key(r), r.status);

// Files covered by the rerun: for those, the 30s status is authoritative.
const rerunFiles = new Set(rerun.map((r) => r.file));

const merged = [];
let promoted = 0;
for (const b of base) {
  const fresh = rerunByKey.get(key(b));
  if (fresh === undefined) {
    merged.push(b);
    continue;
  }
  if (fresh === 'passed' || fresh === 'skipped') {
    promoted++;
    continue; // no longer a failure
  }
  merged.push({ ...b, status: fresh });
}

// Tests that only started failing in the rerun.
let added = 0;
const mergedKeys = new Set(merged.map(key));
for (const r of rerun) {
  if (r.status === 'passed' || r.status === 'skipped') continue;
  if (mergedKeys.has(key(r))) continue;
  merged.push({ file: r.file, title: r.title, status: r.status, err: '' });
  added++;
}

writeFileSync('/tmp/fails.json', JSON.stringify(merged, null, 1));
const tally = {};
merged.forEach((m) => (tally[m.status] = (tally[m.status] || 0) + 1));
console.log(
  `merged: ${merged.length} failing tests ${JSON.stringify(tally)}  ` +
    `(${promoted} now pass at 30s, ${added} newly failing, ${rerunFiles.size} files rerun)`
);
