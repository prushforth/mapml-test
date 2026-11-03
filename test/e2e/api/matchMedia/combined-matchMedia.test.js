// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/api/matchMedia/combined-matchMedia.test.js. The fixture
// gives each viewer a layer shown only while one combined media query
// matches: (not (prefers-color-scheme: dark)) and (prefers-lang: en) and
// (map-projection: OSMTILE) and (map-zoom < 15) and the viewer's initial
// extent overlapping its current one. Each test breaks one condition and
// expects the layer to be hidden.
// Upstream shared one persistent browser context across the file, each test
// undoing its change for the next, and launched a second browser by hand for
// the fr-CA locale. Here each test loads its own page (D4), with the locale
// and colour scheme set through test.use, and waits for the fixture's
// initial evaluation before asserting, so 'All conditions are met' can't
// pass before the query has been evaluated. The projection switch waits for
// map-projectionchange and is tagged @CBMTILE (D3).
import { test, expect } from '@playwright/test';
import { requires } from '../../../helpers/capabilities.js';

const mapTypes = ['mapml-viewer', 'map'];

// Load the fixture and wait until each viewer's layers are ready. The
// fixture sets the layer's initial visibility in a whenLayersReady()
// callback; the macrotask after ours resolves runs after that callback too.
async function load(page) {
  await page.goto('combined-matchMedia.html');
  await page.evaluate(async (mapTypes) => {
    for (const m of mapTypes) {
      await document.querySelector(m).whenLayersReady();
    }
    await new Promise((resolve) => setTimeout(resolve));
  }, mapTypes);
}

test.describe('MatchMedia Query Tests', () => {
  test.use({ locale: 'en-US', colorScheme: 'light' });

  for (const mapType of mapTypes) {
    test.describe(`Tests for ${mapType}`, () => {
      let layer;
      test.beforeEach(async ({ page }) => {
        await load(page);
        layer = page
          .locator(mapType)
          .getByTestId(`test-media-query-${mapType}`);
      });

      test(`${mapType} - ${mapType} - All conditions are met`, async () => {
        await expect(layer).not.toHaveAttribute('hidden');
      });

      test(`${mapType} - Prefers-color-scheme does not match`, async ({
        page
      }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await expect(layer).toHaveAttribute('hidden');
      });

      test(`${mapType} - map-projection does not match`, {
        tag: '@CBMTILE'
      }, async ({ page }) => {
        requires(test, 'CBMTILE');
        await page.evaluate(
          (mapType) =>
            new Promise((resolve) => {
              const map = document.querySelector(mapType);
              map.addEventListener('map-projectionchange', () => resolve(), {
                once: true
              });
              map.projection = 'CBMTILE';
            }),
          mapType
        );
        await expect(layer).toHaveAttribute('hidden');
      });

      test(`${mapType} - map-zoom does not match`, async ({ page }) => {
        await page.evaluate((mapType) => {
          const map = document.querySelector(mapType);
          map.zoomTo(45.406314, -75.6883335, 15);
        }, mapType);
        await expect(layer).toHaveAttribute('hidden');
      });

      test(`${mapType} - Map does not overlap with the bounding box`, async ({
        page
      }) => {
        // move the map so that the layer is out of the map's extent
        await page.evaluate((mapType) => {
          const map = document.querySelector(mapType);
          map.zoomTo(0, 0, 13);
        }, mapType);
        await expect(layer).toHaveAttribute('hidden');

        // move the map back so that the layer is within the map's extent
        await page.evaluate((mapType) => {
          const map = document.querySelector(mapType);
          map.zoomTo(45.406314, -75.6883335, 13);
        }, mapType);
        await expect(layer).not.toHaveAttribute('hidden');
      });
    });

    test.describe(`Tests for ${mapType} in French`, () => {
      test.use({ locale: 'fr-CA' });

      test(`${mapType} - Prefers-lang does not match`, async ({ page }) => {
        await load(page);
        const layer = page
          .locator(mapType)
          .getByTestId(`test-media-query-${mapType}`);
        await expect(layer).toHaveAttribute('hidden');
      });
    });
  }
});
