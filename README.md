# mapml-test

MapML.js's end-to-end test suite, run against any MapML.js-derived
implementation:

| Implementation                     | Sibling checkout      | Built with                          |
| ---------------------------------- | --------------------- | ----------------------------------- |
| `MapML.js` (the Leaflet reference) | `../MapML.js`         | `grunt` (without its `format` step) |
| `MapML-OpenLayers`                 | `../MapML-OpenLayers` | `npm run build`                     |
| `MapML-MapLibre`                   | `../MapML-MapLibre`   | `npm run build`                     |

The specs and fixtures in [test/e2e](test/e2e) started as MapML.js's own
(`test/e2e` upstream) and are being converted, one spec at a time, into a
single suite that tests all three implementations. They are excluded from
Prettier, to keep diffs against upstream readable.

- [docs/PLAN.md](docs/PLAN.md): the plan of record: decisions, the routine
  for converting a spec, the order of work, and how to pick it up on another
  workstation.
- [docs/CONTRACT.md](docs/CONTRACT.md): what implementations must provide for
  the specs (control `data-testid`s, menu `data-id`s, control lifecycle,
  usable API).
- [PORTING.md](PORTING.md): status of every spec and every port-specific
  test, with the latest results, generated from [porting.json](porting.json).

## Setup

```bash
npm ci   # or npm install
```

Each sibling checkout needs its own `node_modules` (`npm ci` there). This
project uses the Chromium that comes with Playwright 1.64.x, the same version
upstream uses.

## Running

```bash
npm test                               # build, copy and test all three
npm run test:openlayers                # ...or one of them
node scripts/run.mjs ol maplibre       # aliases: leaflet, ol, maplibre
node scripts/run.mjs ol -- test/e2e/core/mapElement.test.js -g "extent"
node scripts/run.mjs all --no-build    # copy the siblings' existing dist/
node scripts/run.mjs ol --no-copy      # test what is already in dist/
npm run build                          # build + copy all, no tests
node scripts/run.mjs --help
```

For each implementation, [scripts/run.mjs](scripts/run.mjs):

1. builds it in its sibling checkout,
2. copies its build output into `dist/<name>/` with a `build-info.json`
   recording the branch, commit and whether the checkout was dirty,
3. runs Playwright with `MAPML_IMPL=<name>`, writing `reports/<name>.json`
   and `test-results/<name>/`,

and finally prints a pass/fail summary table. Arguments after `--` go to
`playwright test`. Use `--siblings DIR` (or `MAPML_SIBLINGS`) if the checkouts
aren't next to this one.

Running `npx playwright test` directly (or from the VS Code Playwright
extension) tests `MAPML_IMPL`, or, when that is unset, whichever
implementation was built most recently.

### Debugging one test against one implementation

Name the implementation before `--`; everything after `--` goes to
`playwright test`, so pick the test there (by `file:line`, or by title with
`-g`) and add `--debug`:

```bash
node scripts/run.mjs ol --no-copy -- test/e2e/core/mapElement.test.js:38 --debug
node scripts/run.mjs leaflet --no-copy -- test/e2e/core/mapElement.test.js -g "Initial map element extent" --debug

# the same through npm (the first -- is npm's own)
npm run test:openlayers -- --no-copy -- test/e2e/core/mapElement.test.js:38 --debug

# or bypass the runner: MAPML_IMPL picks the implementation
MAPML_IMPL=ol npx playwright test test/e2e/core/mapElement.test.js:38 --debug
```

- `--no-copy` debugs what is already in `dist/<name>/`. Use `--no-build` to
  re-copy the sibling's current `dist/` first, or neither to rebuild it.
- `--debug` opens a headed browser and the Playwright Inspector, and turns off
  the test timeout, so it needs a display (WSL2's WSLg provides one).
- Many upstream specs share one page across a `describe` block, so a test can
  depend on what the tests before it did to that page. If a test fails only
  when run on its own, debug the whole file and step through to it in the
  Inspector.

## How it works

- [test/server.js](test/server.js) is a port of MapML.js's `test/server.js`:
  the same port (30001), directory flattening, content-type routes and search
  mocks. The difference is that upstream serves its own `dist/` at the root,
  and here that is `dist/<MAPML_IMPL>/`. `GET /__impl` reports which
  implementation is being served. Playwright starts a fresh server for every
  run and never reuses one: if port 30001 is already taken (say by MapML.js's
  own `npm run test-serve`), the run stops straight away with a clear error.
- Fixtures load `mapml.js` exactly as upstream does. MapML.js builds one; for
  the other implementations `run.mjs` writes a one-line `mapml.js` shim that
  imports the real bundle.
- [implementations.js](implementations.js) is the registry: sibling folder,
  build command, which build files to copy, and the entry module. Add an
  implementation by adding an entry there.
- [playwright.config.js](playwright.config.js) mirrors MapML.js's config, so
  screenshot baselines under `*.test.js-snapshots/` are upstream's (i.e.
  Leaflet renderings).
- Each implementation's `capabilities` in `implementations.js` decide which
  capability-tagged tests it runs (the rest are skipped, with a reason).

## Conventions

The rules for writing and converting specs are in
[docs/PLAN.md](docs/PLAN.md) (decisions D1 to D9) and
[docs/CONTRACT.md](docs/CONTRACT.md). In brief:

- Assert through the contract and public API, never through one renderer's
  DOM or private state.
- A test needing a capability not every implementation has (e.g. CBMTILE) is
  tagged and calls `requires()` from
  [test/helpers/capabilities.js](test/helpers/capabilities.js), so it is
  skipped, with a reason, where unsupported.
- Each test sets up its own state.
- Rendering is checked with [test/helpers/render.js](test/helpers/render.js):
  `trackRequests` (layer resources fetched) and `mapPixels` /
  `settledMapPixels` (centre-of-map screenshots, only ever compared with
  another capture from the same run).
- Still to be converted: `*-leaflet.test.js` specs (run only against
  MapML.js) and `test.fixme` tests marked `// TODO(cross-port): Leaflet-only`.
  Both are temporary quarantine; the target is none.

## Porting status

`scripts/run.mjs` records each run's per-spec results in
[porting.json](porting.json) and regenerates [PORTING.md](PORTING.md), but
only for unfiltered runs (no `-g`, `--grep`, `file:line`, ...), so partial
runs never overwrite a spec's full results. After editing `porting.json` by
hand (statuses, notes, superseded port-specific tests), run
`node tools/status.mjs`.

## Syncing upstream test changes

See [docs/PLAN.md](docs/PLAN.md), D7. In short:

```bash
git -C ../MapML.js log --oneline <baseline>..main -- test/e2e   # baseline: porting.json
git -C ../MapML.js show <sha> -- test/e2e > /tmp/upstream.patch
# rename paths for any spec quarantined here as *-leaflet.test.js, e.g.
sed -i 's#e2e/layers/queryLink.test.js#e2e/layers/queryLink-leaflet.test.js#g' /tmp/upstream.patch
git apply --check -v /tmp/upstream.patch
git apply --reject /tmp/upstream.patch   # then merge any *.rej by hand
```

Then update `upstream.baseline` and `upstream.synced` in `porting.json`.

## Triage tools

[tools/](tools) holds the scripts used to classify and quarantine failures:
`triage.js reports/<name>.json` summarises a run, `classify-leaflet.js`
finds Leaflet-bound tests, `quarantine-leaflet.js` applies (or `--restore`s)
the `test.fixme` quarantine, and `retestid.js` rewrites Leaflet control
selectors to the `data-testid` contract.

## History

This started as `cross-port-test/` on the `cross-port-tests` branch of
MapML-OpenLayers (history carried over with `git subtree split`), where it ran
upstream's suite against the OpenLayers port through Vite.
