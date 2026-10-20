// Triage helper for the cross-port run: summarizes a Playwright JSON report.
// Usage: node cross-port-test/triage.js [report.json]
import { readFileSync, writeFileSync } from 'node:fs';

const reportPath = process.argv[2] || '/tmp/crossport.json';
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const rows = [];
const walk = (suite) => {
  (suite.suites || []).forEach(walk);
  (suite.specs || []).forEach((spec) => {
    const result = spec.tests[0].results[0];
    rows.push({
      file: spec.file,
      title: spec.title,
      status: result.status,
      ok: spec.ok,
      err: ((result.error && result.error.message) || '')
        // eslint-disable-next-line no-control-regex -- strip ANSI colour codes
        .replace(/\u001b\[[0-9;]*m/g, '')
        .split('\n')
        .slice(0, 3)
        .join(' | ')
    });
  });
};
(report.suites || []).forEach(walk);

const tally = {};
rows.forEach((r) => (tally[r.status] = (tally[r.status] || 0) + 1));
console.log('TOTAL', rows.length, JSON.stringify(tally));

const fails = rows.filter((r) => r.ok === false);
writeFileSync('/tmp/fails.json', JSON.stringify(fails, null, 1));

const perFile = {};
rows.forEach((r) => {
  const f = (perFile[r.file] ||= { pass: 0, fail: 0, timeout: 0 });
  if (r.status === 'passed') f.pass++;
  else if (r.status === 'timedOut') f.timeout++;
  else if (r.status !== 'skipped') f.fail++;
});
console.log('\n--- per file: pass / fail / timeout ---');
Object.keys(perFile)
  .sort()
  .forEach((f) => {
    const s = perFile[f];
    console.log(
      `${String(s.pass).padStart(3)} ${String(s.fail).padStart(3)} ${String(s.timeout).padStart(3)}  ${f}`
    );
  });

console.log('\n--- failure message shapes ---');
const shapes = {};
fails.forEach((f) => {
  let k = f.err || `(${f.status})`;
  k = k
    .replace(/\d+/g, 'N')
    .replace(/Received: .*/, 'Received: ...')
    .slice(0, 110);
  shapes[k] = (shapes[k] || 0) + 1;
});
Object.entries(shapes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40)
  .forEach(([k, n]) => console.log(String(n).padStart(4), k));
