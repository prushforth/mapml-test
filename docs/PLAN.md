# Plan: one MapML e2e suite for every implementation

This is the plan of record for turning MapML.js's e2e suite into a single
suite that runs against every MapML.js-derived implementation. It is canon:
follow it, and change it (in a commit) rather than working around it.

- **Where things stand:** [PORTING.md](../PORTING.md), generated from
  [porting.json](../porting.json).
- **What implementations must provide:** [CONTRACT.md](CONTRACT.md).

## Goal

Every behaviour MapML defines is tested once, here, against MapML.js,
MapML-OpenLayers and MapML-MapLibre. Each implementation's own test directory
keeps only tests that are truly about that implementation (its renderer
internals, its unit tests), and every one it keeps has a recorded reason.

## Repositories and branches

| Repo               | Branch             | What goes there                                               |
| ------------------ | ------------------ | ------------------------------------------------------------- |
| `mapml-test`       | `main`             | the suite, the harness, these documents                       |
| `MapML.js`         | `cross-port-tests` | contract changes; `MOVED` headers on converted upstream specs |
| `MapML-OpenLayers` | `cross-port-tests` | contract changes and fixes; deleted port-specific tests       |
| `MapML-MapLibre`   | `cross-port-tests` | contract changes and fixes; deleted port-specific tests       |

All four are sibling checkouts in one folder; `scripts/run.mjs` builds
whatever each sibling has checked out.

Commit messages for work on one spec use the same prefix in every repo, so a
conversion can be followed across them: `cross-port: <spec path>`, e.g.
`cross-port: api/domApi-mapml-viewer`. Contract-only changes use
`cross-port: contract — <what>`.

### Picking this up on another workstation

```bash
cd <parent folder>
git clone https://github.com/prushforth/mapml-test.git
for r in MapML.js MapML-OpenLayers MapML-MapLibre; do
  git clone https://github.com/prushforth/$r.git
  git -C $r switch cross-port-tests
  (cd $r && npm ci)
done
cd mapml-test && npm ci
node scripts/run.mjs all --build-only   # build all three
node tools/status.mjs                   # refresh PORTING.md
```

Then open [PORTING.md](../PORTING.md) and take the next spec, in the order
below, that isn't `converted`. A spec marked `in-progress` has its notes in
`porting.json`.

## Decisions

These were made deliberately. The reasons are recorded so they can be revisited
with the trade-offs in view, not lost.

### D1. One suite; port-specific tests are the exception

A MapML behaviour is tested in `test/e2e`, for all implementations. A
port-specific test survives only if it tests that port's internals (e.g.
MapML-OpenLayers' style probe, MapML-MapLibre's worker setup) or is a unit
test. It then lives in that port's own test directory, never in `test/e2e`,
and is recorded as `kept` in `porting.json` with the reason.

### D2. Test behaviour through the contract, never through internals

Specs assert what a user or author can observe: the DOM the contract defines,
the public element APIs, events, network requests and rendered pixels. They
never read private state (`_map`, `_layerControl`, `_groupEl`, ...) and never
select by one renderer's DOM (`.leaflet-*`, `.ol-*`, `.maplibregl-*`). When a
test needs something it can't observe that way, the answer is to add it to
[CONTRACT.md](CONTRACT.md) and implement it in every implementation, not to
peek.

Leaflet-specific upstream tests are **rewritten** to test what they meant, for
all three implementations. The current quarantine (`test.fixme` with a
`// TODO(cross-port): Leaflet-only (...)` comment, and whole files renamed to
`*-leaflet.test.js`) is temporary bookkeeping. The target is zero.

### D3. Capabilities, not concessions

Some behaviour depends on what an implementation can do at all, chiefly
projections: MapML-MapLibre draws only OSMTILE. This is declared, not hidden:

- `implementations.js` lists each implementation's `capabilities`
  (`OSMTILE`, `CBMTILE`, `WGS84`, `APSTILE`, `custom-projection`).
- A test that needs one is tagged with it and calls `requires()` from
  [test/helpers/capabilities.js](../test/helpers/capabilities.js). An
  implementation without it reports the test as **skipped, with the reason**,
  never as failed and never silently left out.

General API and behaviour specs (DOM API, controls, events, context menu, ...)
are **parameterised over projections**: the same tests run in OSMTILE, which
every implementation supports, and again in a non-OSMTILE projection
(CBMTILE), which is skipped where unsupported. Moving a test to OSMTILE alone
would quietly stop vetting the non-Web-Mercator code paths in the
implementations that have them; running both keeps that coverage and still
tests the API everywhere.

Tests that are about a projection (TCRS/tilematrix arithmetic, alternate
projection negotiation, custom TCRS, projection change) stay in their
projection and are tagged.

### D4. Each test sets up its own state

Many upstream specs open one page in `beforeAll` and let each test build on
what the previous one left behind. When one of those tests fails, Playwright
discards the worker and starts a new one for the rest of the file, which runs
`beforeAll` again and gets a fresh, empty page. Every later test then fails
too, with errors (null elements, timeouts) that have nothing to do with the
real problem. One bug looks like fifteen.

A converted spec gives every test its own setup (`beforeEach`, or helpers that
create the viewer and layers it needs), so tests pass or fail on their own.
Where a file can't be made independent yet, it gets
`test.describe.configure({ mode: 'serial' })`, so that after a failure the
remaining tests are reported as not run instead of failing misleadingly.

### D5. Rendering is checked without naming the renderer

Use [test/helpers/render.js](../test/helpers/render.js): `trackRequests` (the
layer fetched its resources) and `mapPixels` / `settledMapPixels` (the map
changed). Pixels are only compared with another capture from the same run;
the implementations never agree pixel for pixel. Upstream's screenshot
baselines are Leaflet renderings and are not used for the other
implementations.

### D6. Provenance and clean-up

- **Upstream specs in MapML.js** are not deleted. When a spec is converted,
  its MapML.js original gets a first-line header on MapML.js's
  `cross-port-tests` branch:
  `// MOVED to mapml-test: test/e2e/<path> (see mapml-test docs/PLAN.md)`.
  MapML.js keeps running its own copy until it adopts this suite.
- **Port-specific tests in MapML-OpenLayers and MapML-MapLibre** that a
  converted spec makes redundant are **deleted** on that port's
  `cross-port-tests` branch, and recorded in `porting.json` as `deleted` with
  `supersededBy`. Git history keeps them. Behaviour that only a port-specific
  test covered is moved into the converted spec first, so nothing is lost.

### D7. Syncing with upstream

`test/e2e` started as a copy of MapML.js's `test/e2e`. While MapML.js keeps
developing its own suite, its later test changes have to be brought over.
`porting.json` → `upstream.baseline` records the MapML.js commit this suite is
up to date with, so the commits still to bring over can be listed. To sync:

```bash
git -C ../MapML.js log --oneline <baseline>..main -- test/e2e   # what's new
git -C ../MapML.js show <sha> -- test/e2e > /tmp/upstream.patch
git apply --check -v /tmp/upstream.patch && git apply --reject /tmp/upstream.patch
```

Merge any `*.rej` by hand, keeping this suite's conversions, then update
`baseline` and add the commit to `synced`. Converted specs will need more
hand-merging than unconverted ones; that's expected. Syncing stops once
MapML.js runs this suite instead of its own.

### D8. Fixtures

Fixtures stay static HTML with upstream's file names. Tile data is real (the
tiles under `test/e2e/data/tiles`), never synthesised, so a failing run's
screenshot is readable. Add data (e.g. OSMTILE tiles at more zoom levels) when
a conversion needs it.

### D9. A failing test is suspect before the implementation is

MapML.js is the reference, and upstream's own spec passes against it. So when
a converted spec fails on MapML.js, the conversion is presumed wrong: it has
asserted something other than what upstream asserted (e.g. reading an
attribute where upstream checked visibility), or set the scenario up
differently. The same suspicion applies to failures on the other
implementations whenever MapML.js and they disagree with upstream's intent.

An implementation's source is changed only on evidence of misbehaviour that a
user or author would see: reproduce it outside the converted spec (a probe
page, a screenshot, upstream's original assertion), against a build without
the proposed change, and say what was observed in the commit message.
Contract additions (testids, data-ids, a missing public method) are the
exception: they add a way to observe, they don't change behaviour.

Why: an unfounded "fix" makes a wrong test pass and bakes the wrong
assumption into the implementation; later conversions then fail against
behaviour that was correct all along. (This happened once already: a helper
read a container's `hidden` attribute instead of the control's visibility, and
a MapML.js layer-control change was made, then reverted.)

## The routine for each spec

1. Mark it `in-progress` in `porting.json`.
2. Run it on all three: `node scripts/run.mjs all --no-copy -- test/e2e/<spec>`.
3. Sort every failure into one of (D9: on MapML.js, check the conversion
   first):
   - **the conversion asserts something upstream didn't** → fix the test;
   - **test depends on one renderer** → rewrite it against the contract (D2);
   - **an implementation lacks part of the contract** → add it to
     [CONTRACT.md](CONTRACT.md) if it's new, and implement it on that
     implementation's `cross-port-tests` branch;
   - **a real bug in an implementation**, reproduced outside the spec (D9) →
     fix it there, or `test.fixme` it with a comment linking the issue;
   - **an implementation can't do it at all** → tag it and use `requires()`
     (D3).
4. Make the tests independent (D4) and parameterise over projections where it
   applies (D3).
5. Find the port-specific tests covering the same behaviour (MapML-OpenLayers
   `test/`, MapML-MapLibre `tests/`). Move anything they cover that the spec
   doesn't into the spec, then delete them on their port's branch and mark
   them `deleted` with `supersededBy` in `porting.json` (D6).
6. Add the `MOVED` header to the MapML.js original (D6).
7. Mark the spec `converted`, with notes on anything skipped or left to fix.
8. Run the spec unfiltered on all three, so `porting.json` and `PORTING.md`
   record its results (`run.mjs` updates them after every unfiltered run).
9. Commit in each touched repo with `cross-port: <spec path>`, after asking:
   an AI agent never commits, in any repo of the workspace, without approval.

## Order of work

1. API and DOM specs: `api/`, `mapml-viewer/`, `web-map/`, `elements/`. They
   are the most projection-neutral and benefit most from the contract.
   **First: `api/domApi-mapml-viewer.test.js`.**
2. `core/` (context menus, keyboard, features, search, history, ...).
3. Renderer-heavy specs: `layers/`, styling, tiles, `geojson/`.
4. The `*-leaflet.test.js` files, which need full rewrites.
5. The remaining `pending` port-specific tests: by then each is superseded,
   moved into a spec, or `kept` with a reason.

## Status vocabulary (porting.json)

- Specs: `not-started`, `in-progress`, `converted`.
- Port-specific tests: `pending`, `deleted` (with `supersededBy`), `kept`
  (with `notes` giving the reason; `tools/status.mjs` rejects a `kept` entry
  without one).
