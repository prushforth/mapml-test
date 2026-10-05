// Vite dev-server middleware that makes the cross-port fixtures under
// `cross-port-test/e2e/` reachable at the same URLs MapML.js's own e2e suite
// uses, so the ported specs can `page.goto('someFixture.html')` unchanged.
// Ported from MapML.js `test/server.js` (Express): same directory flattening,
// same hard-coded content-type routes, same search mocks. Only the bundle is
// different — fixtures link `/cross-port-test/mapml-ol.js` instead of
// `mapml.js`.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const E2E = join(here, 'e2e');

// URL prefixes owned by the project itself; never resolved against fixtures.
const RESERVED = [
  '/@',
  '/src/',
  '/test/',
  '/dist/',
  '/demo/',
  '/node_modules/',
  '/cross-port-test/'
];

// [url prefix, directory under e2e/] — tried in order, first existing file
// wins. Mirrors the `app.use(...)` order in MapML.js test/server.js.
const MOUNTS = [
  ['/data/cbmt', 'data/tiles/cbmt'],
  ['/data/wgs84', 'data/tiles/wgs84'],
  ['/data/osmtile', 'data/tiles/osmtile'],
  ['/data', 'data/tiles/cbmt'],
  ['/data', 'data/tiles/wgs84'],
  ['/data', 'data/tiles/osmtile'],
  ['/images', 'data/images'],
  ['/features', 'features'],
  ['/', 'core'],
  ['/', 'elements/map-extent'],
  ['/', 'elements/mapml-viewer'],
  ['/', 'elements/map'],
  ['/', 'elements/map-feature'],
  ['/', 'elements/map-a'],
  ['/', 'elements/map-input'],
  ['/', 'elements/map-link'],
  ['/', 'elements/map-style'],
  ['/', 'elements/map-tile'],
  ['/', 'elements/map-layer'],
  ['/', 'elements/layer-'],
  ['/', 'api'],
  ['/', 'api/matchMedia'],
  ['/', 'data'],
  ['/', 'geojson'],
  ['/', 'layers'],
  ['/', 'mapml-viewer'],
  ['/', 'web-map']
];

// Query endpoints whose response content-type matters more than their filename.
const EXACT = {
  '/data/query/us_map_query': [
    'data/tiles/cbmt/us_map_query.mapml',
    'text/mapml'
  ],
  '/data/query-response-fallback-cs-meta.mapml': [
    'data/tiles/cbmt/query-response-fallback-cs-meta.mapml',
    'text/mapml'
  ],
  '/data/query-response-fallback-cs-no-meta.mapml': [
    'data/tiles/cbmt/query-response-fallback-cs-no-meta.mapml',
    'text/mapml'
  ],
  '/layers/queryableMapExtent.mapml': [
    'layers/queryableMapExtent.mapml',
    'text/mapml'
  ],
  '/data/query/html_query_response': [
    'data/tiles/cbmt/html_query_response.html',
    'text/html'
  ],
  '/data/query/DouglasFir': ['data/tiles/cbmt/DouglasFir.mapml', 'text/mapml'],
  '/data/noMapMeta': ['data/noMapMeta.mapml', 'text/mapml'],
  '/data/query/geojsonFeature': [
    'data/geojson/geojsonFeature.geojson',
    'application/geo+json'
  ],
  '/data/query/geojsonPoint': [
    'data/geojson/geojsonPoint.json',
    'application/json'
  ],
  '/data/query/geojsonProjectedWithCrs': [
    'data/geojson/geojsonProjectedWithCrs.json',
    'application/json'
  ],
  '/data/query/geojsonProjectedNoCrs': [
    'data/geojson/geojsonProjectedNoCrs.json',
    'application/json'
  ],
  '/data/query/geojsonNullGeometry': [
    'data/geojson/geojsonNullGeometry.json',
    'application/geo+json'
  ],
  // deliberately wrong media type, to test the error path
  '/data/query/geojsonErroneousMediaType': [
    'data/geojson/geojsonPoint.json',
    'application/geojson'
  ],
  '/data/query/geojsonFeature.geojson': [
    'data/geojson/geojsonFeature.geojson',
    'text/html'
  ],
  '/data/query/geojsonPoint.json': [
    'data/geojson/geojsonPoint.json',
    'text/html'
  ]
};

const ottawa = {
  type: 'Feature',
  properties: { display_name: 'Ottawa, Ontario, Canada', name: 'Ottawa' },
  geometry: { type: 'Point', coordinates: [-75.6972, 45.4215] },
  bbox: [-75.9, 45.2, -75.4, 45.6]
};
const tokyo = {
  type: 'Feature',
  properties: { display_name: '東京都, 日本', name: '東京' },
  geometry: { type: 'Point', coordinates: [139.6917, 35.6895] },
  bbox: [138.9428, 35.5187, 139.9219, 35.8984]
};
const geonamesOttawa = {
  id: 'FEVNT',
  name: 'Ottawa',
  latitude: 45.33339,
  longitude: -75.58429,
  bbox: [-76.3631149, 44.9445516, -75.2324963, 45.544859],
  concise: { code: 'CITY' },
  province: { code: '35' }
};
const geonamesToronto = {
  id: 'TRNTO',
  name: 'Toronto',
  latitude: 43.65107,
  longitude: -79.347015,
  bbox: [-79.6393, 43.4034, -79.1153, 43.8554],
  concise: { code: 'CITY' },
  province: { code: '35' }
};

// Mock geocoding endpoints for the search control tests.
const MOCKS = {
  '/search/suggestions': {
    type: 'FeatureCollection',
    features: [
      ottawa,
      {
        type: 'Feature',
        properties: {
          display_name: 'Ottawa River, Canada',
          name: 'Ottawa River'
        },
        geometry: { type: 'Point', coordinates: [-75.5, 45.5] }
      },
      {
        type: 'Feature',
        properties: {
          display_name: 'Gatineau, Quebec, Canada',
          name: 'Gatineau'
        },
        geometry: { type: 'Point', coordinates: [-75.7, 45.48] }
      }
    ]
  },
  '/search/results': { type: 'FeatureCollection', features: [ottawa] },
  '/geonames/suggestions': {
    items: [
      geonamesOttawa,
      {
        id: 'NAABK',
        name: 'Arctic Ocean',
        latitude: 80,
        longitude: -140,
        bbox: [-140.02, 79.98, -139.98, 80.02],
        concise: { code: 'SEA' },
        province: { code: '73' }
      },
      {
        id: 'NAABI',
        name: 'Atlantic Ocean',
        latitude: 43,
        longitude: -63,
        bbox: [-63.02, 42.98, -62.98, 43.02],
        concise: { code: 'SEA' },
        province: { code: '73' }
      }
    ]
  },
  '/geonames/search': { items: [geonamesOttawa] },
  '/geonames2/suggestions': {
    items: [
      geonamesToronto,
      {
        id: 'MNTRL',
        name: 'Montreal',
        latitude: 45.50884,
        longitude: -73.58781,
        bbox: [-73.9726, 45.4104, -73.4742, 45.7047],
        concise: { code: 'CITY' },
        province: { code: '24' }
      }
    ]
  },
  '/geonames2/search': { items: [geonamesToronto] },
  '/search/ja/suggestions': {
    type: 'FeatureCollection',
    features: [
      tokyo,
      {
        type: 'Feature',
        properties: {
          display_name: '東京タワー, 東京都, 日本',
          name: '東京タワー'
        },
        geometry: { type: 'Point', coordinates: [139.7454, 35.6586] }
      },
      {
        type: 'Feature',
        properties: { display_name: '東京駅, 東京都, 日本', name: '東京駅' },
        geometry: { type: 'Point', coordinates: [139.7671, 35.6812] }
      }
    ]
  },
  '/search/ja/results': { type: 'FeatureCollection', features: [tokyo] }
};

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// Resolve a flattened fixture URL to a file inside e2e/, refusing anything that
// escapes that directory.
function resolveFixture(pathname) {
  for (const [prefix, dir] of MOUNTS) {
    const rest =
      prefix === '/'
        ? pathname.slice(1)
        : pathname.startsWith(prefix + '/')
          ? pathname.slice(prefix.length + 1)
          : null;
    if (rest === null || rest === '') continue;
    const candidate = resolve(E2E, dir, rest);
    if (!candidate.startsWith(E2E + sep)) continue;
    if (isFile(candidate)) return candidate;
  }
  return null;
}

function send(res, body, type) {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-cache');
  res.end(body);
}

export default function crossPortFixtures() {
  return {
    name: 'cross-port-fixtures',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.url === '/') return next();
        const [rawPath, query] = req.url.split('?');
        if (RESERVED.some((p) => rawPath.startsWith(p))) return next();

        let pathname;
        try {
          pathname = decodeURIComponent(rawPath);
        } catch {
          return next();
        }

        const mock = MOCKS[pathname];
        if (mock) return send(res, JSON.stringify(mock), 'application/json');

        const exact = EXACT[pathname];
        if (exact) {
          const file = join(E2E, exact[0]);
          if (isFile(file)) return send(res, readFileSync(file), exact[1]);
          return next();
        }

        const file = resolveFixture(pathname);
        if (!file) return next();

        // Vite's static middleware has no mapping for .mapml; everything else
        // (including byte-range requests for .pmtiles) it handles correctly, so
        // just point it at the real file.
        if (file.endsWith('.mapml'))
          return send(res, readFileSync(file), 'text/mapml');
        req.url =
          '/' +
          relative(ROOT, file).split(sep).join('/') +
          (query ? '?' + query : '');
        next();
      });
    }
  };
}
