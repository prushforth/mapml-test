// The MapML.js-derived implementations this suite can test. Each is a sibling
// checkout (by default next to this repo). scripts/run.mjs builds it with
// `build`, then copies `include` from its `dist` into `dist/<name>/` here.
//
// Every build must expose `mapml.js` at the root of `dist/<name>/`, because
// that is what the upstream fixtures load. MapML.js builds one; for the others
// run.mjs writes a one-line shim that imports `entry`.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Capabilities a test can require (docs/PLAN.md, "Capabilities"). A test
// tagged with one an implementation lacks is skipped for it, with a reason.
export const CAPABILITIES = [
  'OSMTILE',
  'CBMTILE',
  'WGS84',
  'APSTILE',
  'custom-projection'
];
const ALL_PROJECTIONS = CAPABILITIES;

export const IMPLEMENTATIONS = [
  {
    name: 'MapML.js',
    aliases: ['leaflet', 'mapmljs'],
    // Folder name differs between machines.
    dirs: ['MapML.js', 'mapml.js'],
    // `grunt default` minus its `format` step, which rewrites the sources.
    build: [
      'npx',
      'grunt',
      'clean:dist',
      'copy:main',
      'copy:images',
      'customRollup',
      'cssmin'
    ],
    dist: 'dist',
    include: null, // everything: mapml.css, images/ and pmtilesRules.js too
    entry: 'mapml.js',
    // The reference implementation: *-leaflet.test.js specs only run here.
    leaflet: true,
    capabilities: ALL_PROJECTIONS,
    // Its own e2e suite is the upstream of test/e2e; see docs/PLAN.md.
    portTests: null
  },
  {
    name: 'MapML-OpenLayers',
    aliases: ['openlayers', 'ol'],
    dirs: ['MapML-OpenLayers'],
    build: ['npm', 'run', 'build'],
    dist: 'dist',
    include: ['mapml-ol.js', 'mapml-ol.js.map'],
    entry: 'mapml-ol.js',
    capabilities: ALL_PROJECTIONS,
    // Port-specific tests, to be superseded by test/e2e (docs/PLAN.md).
    // test/unit holds vitest unit tests of OL internals: port-specific by nature.
    portTests: { dir: 'test', match: /\.test\.js$/, exclude: /^test\/unit\// }
  },
  {
    name: 'MapML-MapLibre',
    aliases: ['maplibre', 'ml'],
    dirs: ['MapML-MapLibre'],
    build: ['npm', 'run', 'build'],
    dist: 'dist',
    // The runtime only: the bundle plus its hashed worker chunk. The type
    // declarations (*.d.ts, controls/, core/, ...) are not needed.
    include: ['mapml-maplibre.js', 'mapml-maplibre.js.map', 'assets'],
    entry: 'mapml-maplibre.js',
    // MapLibre GL only accepts Web Mercator tile grids
    // (MapML-MapLibre src/core/projection.ts).
    capabilities: ['OSMTILE'],
    portTests: { dir: 'tests', match: /\.spec\.ts$/ }
  }
];

export function supports(impl, capability) {
  if (!CAPABILITIES.includes(capability)) {
    throw new Error(
      `Unknown capability "${capability}". Known: ${CAPABILITIES.join(', ')}.`
    );
  }
  return impl.capabilities.includes(capability);
}

export function findImpl(name) {
  const key = String(name).toLowerCase();
  return IMPLEMENTATIONS.find(
    (i) => i.name.toLowerCase() === key || i.aliases.includes(key)
  );
}

// The most recently built implementation in dist/, or undefined.
export function lastBuilt(root) {
  const dist = join(root, 'dist');
  if (!existsSync(dist)) return undefined;
  return readdirSync(dist)
    .map((n) => ({ n, f: join(dist, n, 'build-info.json') }))
    .filter(({ n, f }) => findImpl(n) && existsSync(f))
    .sort((a, b) => statSync(b.f).mtimeMs - statSync(a.f).mtimeMs)[0]?.n;
}

// Resolve MAPML_IMPL (or the last build, when unset) to a registry entry with
// its `distDir` inside this repo.
export function resolveImpl(name, { root }) {
  const chosen = name || lastBuilt(root);
  if (!chosen) {
    throw new Error(
      'No implementation selected: set MAPML_IMPL, or build one with `node scripts/run.mjs <name> --build-only`.'
    );
  }
  const impl = findImpl(chosen);
  if (!impl) {
    throw new Error(
      `Unknown implementation "${chosen}". Known: ${IMPLEMENTATIONS.map((i) => i.name).join(', ')}.`
    );
  }
  return { ...impl, distDir: resolve(root, 'dist', impl.name) };
}
