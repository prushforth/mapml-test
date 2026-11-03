// Build one or all MapML.js-derived implementations, copy their build output
// into dist/<name>/, and run the e2e suite against each.
//
// Usage:
//   node scripts/run.mjs [<impl>... | all] [options] [-- <playwright args>]
//
//   <impl>         MapML.js | MapML-OpenLayers | MapML-MapLibre, or an alias
//                  (leaflet, openlayers/ol, maplibre/ml). Default: all.
//   --no-build     Don't build; copy the sibling's existing dist/ instead.
//   --no-copy      Don't build or copy; test what is already in dist/<name>/.
//   --build-only   Build and copy, but don't run the tests.
//   --converted    Run only the specs marked "converted" in the committed
//                  porting.json (HEAD), i.e. conversions that have been
//                  committed. Any spec files after -- are run as well.
//   --siblings DIR Where the sibling checkouts live (default: this repo's
//                  parent; or set MAPML_SIBLINGS).
//
// Examples:
//   node scripts/run.mjs ol -- test/e2e/core/mapElement.test.js
//   node scripts/run.mjs all --no-build -- --workers=2
//   node scripts/run.mjs all --converted
//   node scripts/run.mjs maplibre --build-only
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMPLEMENTATIONS, findImpl } from '../implementations.js';
import { updateStatus } from '../tools/status.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const dashdash = argv.indexOf('--');
  const own = dashdash === -1 ? argv : argv.slice(0, dashdash);
  const opts = {
    impls: [],
    build: true,
    copy: true,
    test: true,
    converted: false,
    siblings: process.env.MAPML_SIBLINGS || resolve(ROOT, '..'),
    playwrightArgs: dashdash === -1 ? [] : argv.slice(dashdash + 1)
  };
  for (let i = 0; i < own.length; i++) {
    const a = own[i];
    if (a === '--no-build') opts.build = false;
    else if (a === '--no-copy') opts.build = opts.copy = false;
    else if (a === '--build-only') opts.test = false;
    else if (a === '--converted') opts.converted = true;
    else if (a === '--siblings') opts.siblings = resolve(own[++i]);
    else if (a === '-h' || a === '--help') usage(0);
    else if (a.startsWith('-')) usage(1, `Unknown option ${a}`);
    else if (a === 'all') opts.impls.push(...IMPLEMENTATIONS);
    else {
      const impl = findImpl(a);
      if (!impl) usage(1, `Unknown implementation "${a}"`);
      opts.impls.push(impl);
    }
  }
  if (!opts.impls.length) opts.impls = [...IMPLEMENTATIONS];
  opts.impls = [...new Set(opts.impls)];
  return opts;
}

function usage(code, msg) {
  if (msg) console.error(msg + '\n');
  const header = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('\n')
    .filter((l, i, all) => all.slice(0, i + 1).every((x) => x.startsWith('//')))
    .map((l) => l.replace(/^\/\/ ?/, ''));
  console.log(header.join('\n'));
  process.exit(code);
}

function run(cmd, args, { cwd, env } = {}) {
  console.log(`\n$ ${[cmd, ...args].join(' ')}${cwd ? `   (in ${cwd})` : ''}`);
  const r = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit'
  });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// The spec files porting.json marks "converted", read from HEAD so that only
// committed conversions count.
function convertedSpecs() {
  const committed = git(ROOT, 'show', 'HEAD:porting.json');
  if (committed === null) {
    throw new Error('--converted: cannot read porting.json from HEAD.');
  }
  const specs = Object.entries(JSON.parse(committed).specs)
    .filter(([, s]) => s.status === 'converted')
    .map(([file]) => `test/e2e/${file}`);
  if (!specs.length) {
    throw new Error('--converted: no spec is marked converted at HEAD.');
  }
  return specs;
}

function siblingDir(impl, siblings) {
  const dir = impl.dirs
    .map((d) => join(siblings, d))
    .find((d) => existsSync(join(d, 'package.json')));
  if (!dir) {
    throw new Error(
      `${impl.name}: no checkout in ${siblings} (looked for ${impl.dirs.join(', ')}). Use --siblings DIR.`
    );
  }
  return dir;
}

function build(impl, src) {
  if (!existsSync(join(src, 'node_modules'))) {
    throw new Error(
      `${impl.name}: ${src} has no node_modules; run \`npm ci\` there first.`
    );
  }
  const [cmd, ...args] = impl.build;
  if (run(cmd, args, { cwd: src }) !== 0) {
    throw new Error(`${impl.name}: build failed.`);
  }
}

function copy(impl, src) {
  const from = join(src, impl.dist);
  if (!existsSync(join(from, impl.entry))) {
    throw new Error(
      `${impl.name}: ${join(from, impl.entry)} not found; build it first (drop --no-build).`
    );
  }
  const to = join(ROOT, 'dist', impl.name);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const item of impl.include ?? ['.']) {
    const p = join(from, item);
    if (!existsSync(p)) throw new Error(`${impl.name}: missing ${p}.`);
    cpSync(p, join(to, item), { recursive: true });
  }
  if (impl.entry !== 'mapml.js') {
    writeFileSync(
      join(to, 'mapml.js'),
      `// Generated by mapml-test: the fixtures load mapml.js, as upstream.\nimport './${impl.entry}';\n`
    );
  }
  const info = {
    impl: impl.name,
    source: src,
    branch: git(src, 'rev-parse', '--abbrev-ref', 'HEAD'),
    commit: git(src, 'rev-parse', 'HEAD'),
    dirty: Boolean(git(src, 'status', '--porcelain')),
    builtAt: new Date().toISOString()
  };
  writeFileSync(join(to, 'build-info.json'), JSON.stringify(info, null, 2));
  console.log(
    `Copied ${impl.name} ${info.branch}@${info.commit?.slice(0, 7)}${info.dirty ? ' (dirty)' : ''} -> dist/${impl.name}/`
  );
}

function summarize(impl) {
  const file = join(ROOT, 'reports', `${impl.name}.json`);
  if (!existsSync(file)) return null;
  const { stats } = JSON.parse(readFileSync(file, 'utf8'));
  return {
    passed: stats.expected,
    failed: stats.unexpected,
    flaky: stats.flaky,
    skipped: stats.skipped,
    minutes: +(stats.duration / 60000).toFixed(1)
  };
}

const opts = parseArgs(process.argv.slice(2));
if (opts.converted) {
  try {
    const specs = convertedSpecs();
    console.log(`Converted specs (HEAD):\n  ${specs.join('\n  ')}`);
    opts.playwrightArgs.unshift(...specs);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
// Only a run of whole files may update porting.json: a filtered run's counts
// would overwrite a file's full results with a subset.
const filtered = opts.playwrightArgs.some(
  (a) =>
    /^(-g|--grep|--grep-invert|--last-failed|--only-changed|--repeat-each|--shard)\b/.test(
      a
    ) || /\.test\.js:\d+/.test(a)
);
const results = {};
let worst = 0;

for (const impl of opts.impls) {
  console.log(`\n=== ${impl.name} ===`);
  try {
    if (opts.copy) {
      const src = siblingDir(impl, opts.siblings);
      if (opts.build) build(impl, src);
      copy(impl, src);
    }
    if (opts.test) {
      if (!existsSync(join(ROOT, 'dist', impl.name, 'mapml.js'))) {
        throw new Error(
          `${impl.name}: dist/${impl.name}/ is empty; drop --no-copy.`
        );
      }
      rmSync(join(ROOT, 'reports', `${impl.name}.json`), { force: true });
      const status = run(
        'npx',
        ['playwright', 'test', ...opts.playwrightArgs],
        {
          cwd: ROOT,
          env: { MAPML_IMPL: impl.name }
        }
      );
      worst = Math.max(worst, status);
      results[impl.name] = summarize(impl) ?? { error: `exit ${status}` };
      const report = join(ROOT, 'reports', `${impl.name}.json`);
      if (!filtered && existsSync(report)) updateStatus([report]);
    }
  } catch (e) {
    console.error(`\n${e.message}`);
    results[impl.name] = { error: e.message };
    worst = Math.max(worst, 1);
  }
}

if (Object.keys(results).length) {
  console.log('\n=== Summary ===');
  console.table(results);
}
process.exit(worst);
