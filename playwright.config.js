// Mirrors MapML.js's playwright.config.js (no `projects`, same timeout, same
// port and baseURL) so screenshot snapshot filenames and browser defaults line
// up with the upstream baselines committed under `*.test.js-snapshots/`.
//
// The implementation under test is MAPML_IMPL (see implementations.js); when
// unset, the most recently built one in dist/. scripts/run.mjs sets it.
import { defineConfig } from '@playwright/test';
import { resolveImpl } from './implementations.js';

const impl = resolveImpl(process.env.MAPML_IMPL, {
  root: import.meta.dirname
});
// Workers re-load this config; exporting the resolved name keeps them, and
// test/helpers/capabilities.js, on the same implementation as the server.
process.env.MAPML_IMPL = impl.name;
if (!process.env.TEST_WORKER_INDEX) {
  console.log(`mapml-test: testing ${impl.name} (dist/${impl.name}/)`);
}

export default defineConfig({
  timeout: 30000,
  testDir: './test/e2e',
  testMatch: /.*\.test\.js$/,
  // `*-leaflet.test.js` specs assert Leaflet internals, so only the reference
  // implementation can pass them.
  testIgnore: impl.leaflet ? [] : '**/*-leaflet.test.js',
  outputDir: `test-results/${impl.name}`,
  // Read by tools/status.mjs to attribute a JSON report to its implementation.
  metadata: { impl: impl.name },
  reporter: [['list'], ['json', { outputFile: `reports/${impl.name}.json` }]],
  webServer: {
    command: 'node test/server.js',
    // Wait for the server's own "Serving" line rather than giving a `url` or
    // `port`: with either, Playwright first probes the port BEFORE launching,
    // and on a host whose firewall drops loopback SYNs to closed ports that
    // probe hangs for the full SYN-retry timeout (~2 minutes; the "2 min
    // pause" noted in MapML.js's playwright.config.js). Without a probe there
    // is no reuse either, so a server already on the port (possibly serving
    // another implementation) makes ours fail with EADDRINUSE instead.
    wait: { stdout: /^Serving / },
    env: { MAPML_IMPL: impl.name },
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 10_000
  },
  use: {
    headless: true,
    browserName: 'chromium',
    baseURL: 'http://localhost:30001/',
    ignoreHTTPSErrors: true
  }
});
