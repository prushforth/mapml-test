// The porting manifest: porting.json is the record of where every spec and
// every port-specific test stands (docs/PLAN.md); PORTING.md is rendered from
// it. Run after editing porting.json by hand, and (automatically, via
// scripts/run.mjs) after every unfiltered test run.
//
// Usage:
//   node tools/status.mjs                     sync + render
//   node tools/status.mjs --report FILE...    also record those runs' results
//
// "Sync" adds any new spec under test/e2e and any new port-specific test in a
// sibling checkout as not-started / pending, and flags entries whose file has
// gone. It never changes a status you set by hand.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMPLEMENTATIONS } from '../implementations.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const E2E = join(ROOT, 'test', 'e2e');
const MANIFEST = join(ROOT, 'porting.json');
const RENDERED = join(ROOT, 'PORTING.md');
const SIBLINGS = process.env.MAPML_SIBLINGS || resolve(ROOT, '..');

export const SPEC_STATUSES = ['not-started', 'in-progress', 'converted'];
export const PORT_TEST_STATUSES = ['pending', 'deleted', 'kept'];

function walk(dir, match, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) {
      return d.name === 'node_modules' ? [] : walk(p, match, base);
    }
    return match.test(d.name) ? [relative(base, p).split('\\').join('/')] : [];
  });
}

function siblingDir(impl) {
  return impl.dirs
    .map((d) => join(SIBLINGS, d))
    .find((d) => existsSync(join(d, 'package.json')));
}

function load() {
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

function sync(m) {
  for (const file of walk(E2E, /\.test\.js$/)) {
    m.specs[file] ??= { status: 'not-started' };
  }
  for (const [file, entry] of Object.entries(m.specs)) {
    if (!existsSync(join(E2E, file))) entry.missing = true;
    else delete entry.missing;
  }
  for (const impl of IMPLEMENTATIONS.filter((i) => i.portTests)) {
    const dir = siblingDir(impl);
    // Another workstation may not have every sibling; keep what is recorded.
    if (!dir) continue;
    const tests = (m.portTests[impl.name] ??= {});
    const root = join(dir, impl.portTests.dir);
    const { match, exclude } = impl.portTests;
    for (const file of walk(root, match, dir)) {
      if (exclude?.test(file)) continue;
      tests[file] ??= { status: 'pending' };
    }
    for (const [file, entry] of Object.entries(tests)) {
      const gone = !existsSync(join(dir, file));
      if (gone && entry.status !== 'deleted') entry.missing = true;
      else delete entry.missing;
    }
  }
}

// Per-file results of one Playwright JSON report. A test is counted against
// the spec file that ran it (the report's root suite), not `spec.file`, which
// names the file that declared it: a shared scenario module such as
// api/general/domApi.js or layers/general/isVisible.js.
function resultsByFile(report) {
  const files = {};
  const visit = (suite, file) => {
    for (const spec of suite.specs ?? []) {
      const r = (files[file] ??= {
        passed: 0,
        failed: 0,
        flaky: 0,
        skipped: 0
      });
      for (const t of spec.tests) {
        if (t.status === 'expected') r.passed++;
        else if (t.status === 'unexpected') r.failed++;
        else if (t.status === 'flaky') r.flaky++;
        else r.skipped++;
      }
    }
    (suite.suites ?? []).forEach((child) => visit(child, file));
  };
  (report.suites ?? []).forEach((root) => visit(root, root.file));
  return files;
}

function record(m, reportPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const impl = IMPLEMENTATIONS.find(
    (i) => i.name === report.config?.metadata?.impl
  );
  if (!impl) {
    throw new Error(`${reportPath}: no implementation in report metadata.`);
  }
  const infoPath = join(ROOT, 'dist', impl.name, 'build-info.json');
  const info = existsSync(infoPath)
    ? JSON.parse(readFileSync(infoPath, 'utf8'))
    : {};
  const build = info.commit
    ? `${info.branch}@${info.commit.slice(0, 7)}${info.dirty ? '+dirty' : ''}`
    : 'unknown';
  const date = report.stats.startTime.slice(0, 10);
  for (const [file, r] of Object.entries(resultsByFile(report))) {
    const entry = (m.specs[file] ??= { status: 'not-started' });
    (entry.results ??= {})[impl.name] = { ...r, build, date };
  }
}

const cell = (r) => {
  if (!r) return '';
  const parts = [`${r.passed}✓`];
  if (r.failed) parts.push(`${r.failed}✗`);
  if (r.flaky) parts.push(`${r.flaky}~`);
  if (r.skipped) parts.push(`${r.skipped}⊘`);
  return parts.join(' ');
};

function render(m) {
  const impls = IMPLEMENTATIONS.map((i) => i.name);
  const specs = Object.entries(m.specs).sort(([a], [b]) => a.localeCompare(b));
  const count = (s) => specs.filter(([, e]) => e.status === s).length;
  const lines = [
    '# Porting status',
    '',
    '<!-- Generated by tools/status.mjs from porting.json. Do not edit by',
    '     hand: edit porting.json, then run `node tools/status.mjs`. -->',
    '',
    `How to use this: [docs/PLAN.md](docs/PLAN.md). Upstream baseline:`,
    `MapML.js \`${m.upstream.baseline.slice(0, 8)}\` (${m.upstream.baselineSubject}).`,
    '',
    `Specs: ${count('converted')} converted, ${count('in-progress')} in progress, ` +
      `${count('not-started')} not started, of ${specs.length}.`,
    '',
    'Results are from the latest unfiltered run of each file: ✓ passed,',
    '✗ failed, ~ flaky, ⊘ skipped (unsupported capability or quarantined).',
    '',
    '## Specs (test/e2e)',
    '',
    `| Spec | Status | ${impls.join(' | ')} | Notes |`,
    `|---|---|${impls.map(() => '---').join('|')}|---|`
  ];
  for (const [file, e] of specs) {
    const notes = [e.missing ? '**file missing**' : '', e.notes ?? '']
      .filter(Boolean)
      .join(' ');
    lines.push(
      `| ${file} | ${e.status} | ${impls.map((i) => cell(e.results?.[i])).join(' | ')} | ${notes} |`
    );
  }
  for (const [impl, tests] of Object.entries(m.portTests)) {
    const rows = Object.entries(tests).sort(([a], [b]) => a.localeCompare(b));
    const n = (s) => rows.filter(([, t]) => t.status === s).length;
    lines.push(
      '',
      `## ${impl} port-specific tests`,
      '',
      `${n('pending')} pending, ${n('deleted')} deleted, ${n('kept')} kept, of ${rows.length}.`,
      '',
      '| Test | Status | Superseded by / reason |',
      '|---|---|---|'
    );
    for (const [file, t] of rows) {
      const why = [
        t.missing ? '**file missing, mark it deleted**' : '',
        t.supersededBy ?? '',
        t.notes ?? ''
      ]
        .filter(Boolean)
        .join(' ');
      lines.push(`| ${file} | ${t.status} | ${why} |`);
    }
  }
  return lines.join('\n') + '\n';
}

function validate(m) {
  for (const [file, e] of Object.entries(m.specs)) {
    if (!SPEC_STATUSES.includes(e.status)) {
      throw new Error(
        `porting.json: ${file} has unknown status "${e.status}".`
      );
    }
  }
  for (const [impl, tests] of Object.entries(m.portTests)) {
    for (const [file, t] of Object.entries(tests)) {
      if (!PORT_TEST_STATUSES.includes(t.status)) {
        throw new Error(
          `porting.json: ${impl} ${file} has unknown status "${t.status}".`
        );
      }
      if (t.status === 'kept' && !t.notes) {
        throw new Error(
          `porting.json: ${impl} ${file} is kept without a reason.`
        );
      }
    }
  }
}

export function updateStatus(reports = []) {
  const m = load();
  sync(m);
  for (const r of reports) record(m, r);
  validate(m);
  m.specs = Object.fromEntries(
    Object.entries(m.specs).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
  writeFileSync(RENDERED, render(m));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--report');
  const reports = i === -1 ? [] : process.argv.slice(i + 1);
  updateStatus(reports);
  console.log(
    `Updated ${relative(ROOT, MANIFEST)} and ${relative(ROOT, RENDERED)}.`
  );
}
