# mapml-test

MapML.js's end-to-end test suite, run against any MapML.js-derived
implementation:

| Implementation                     | Sibling checkout      | Built with                          |
| ---------------------------------- | --------------------- | ----------------------------------- |
| `MapML.js` (the Leaflet reference) | `../MapML.js`         | `grunt` (without its `format` step) |
| `MapML-OpenLayers`                 | `../MapML-OpenLayers` | `npm run build`                     |
| `MapML-MapLibre`                   | `../MapML-MapLibre`   | `npm run build`                     |

The specs and fixtures in [test/e2e](test/e2e) are MapML.js's own
(`test/e2e` upstream). They are kept as close to byte-identical to upstream as
possible so they diff 1:1, and are excluded from Prettier.

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

## Conventions

- `*-leaflet.test.js` specs assert Leaflet internals throughout. They run only
  against `MapML.js` and are ignored for the other implementations.
- Individual Leaflet-bound tests in mixed files are quarantined as
  `test.fixme(...)` with a `// TODO(cross-port): Leaflet-only (...)` comment
  naming the blocking API (see [tools/quarantine-leaflet.js](tools/quarantine-leaflet.js)).
  To bring one back, rewrite it against renderer-agnostic state and drop both.
  Note that `fixme` also skips them for `MapML.js`.
- [test/helpers/render.js](test/helpers/render.js) has renderer-agnostic
  "did it render" probes: `trackRequests` (layer resources fetched) and
  `mapPixels`/`settledMapPixels` (centre-of-map screenshots, only ever
  compared with another capture from the same run).
- Where upstream asserts a Leaflet class or DOM detail, prefer an assertion
  that holds in every implementation (e.g. the `data-testid` control contract,
  see [tools/retestid.js](tools/retestid.js)) over per-implementation branches.

## Syncing upstream test changes

To bring a MapML.js commit's test changes over while keeping local edits:

```bash
git -C ../MapML.js show <sha> -- test/e2e > /tmp/upstream.patch
# rename paths for any spec quarantined here as *-leaflet.test.js, e.g.
sed -i 's#e2e/layers/queryLink.test.js#e2e/layers/queryLink-leaflet.test.js#g' /tmp/upstream.patch
git apply --check -v /tmp/upstream.patch
git apply --reject /tmp/upstream.patch   # then merge any *.rej by hand
```

The paths line up (`test/e2e/...` in both repos), so no `-p`/`--directory`
is needed.

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
