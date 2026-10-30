// The MapML.js-derived implementations this suite can test. Each is a sibling
// checkout (by default next to this repo). scripts/run.mjs builds it with
// `build`, then copies `include` from its `dist` into `dist/<name>/` here.
//
// Every build must expose `mapml.js` at the root of `dist/<name>/`, because
// that is what the upstream fixtures load. MapML.js builds one; for the others
// run.mjs writes a one-line shim that imports `entry`.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
    leaflet: true
  },
  {
    name: 'MapML-OpenLayers',
    aliases: ['openlayers', 'ol'],
    dirs: ['MapML-OpenLayers'],
    build: ['npm', 'run', 'build'],
    dist: 'dist',
    include: ['mapml-ol.js', 'mapml-ol.js.map'],
    entry: 'mapml-ol.js'
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
    entry: 'mapml-maplibre.js'
  }
];

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
