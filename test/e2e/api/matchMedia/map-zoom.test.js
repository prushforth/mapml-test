// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/api/matchMedia/map-zoom.test.js. The fixture's script
// finds the zoom N for which (map-zoom: N) matches, on load and on every
// zoomend event, and writes it to #zoom-indicator. The viewer starts at zoom
// 1 and its layer allows zooms 0 to 18.
// Was quarantined as map-zoom-leaflet.test.js: it ran in a persistent context
// shared across the file and slept 500ms after each click. Now the test loads
// its own page (D4) and waits for whenLayersReady(); the sleeps are gone
// because the indicator assertion retries, and the next click waits for it.
// The zoom-in button is found by its data-testid (docs/CONTRACT.md).
import { test, expect } from '@playwright/test';

test.describe('matchMedia map-zoom tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('map-zoom.html');
    await page.evaluate(() =>
      document.querySelector('mapml-viewer').whenLayersReady()
    );
  });

  test('matchMedia API detects changes in zoom', async ({ page }) => {
    // 17 animated zooms: MapLibre's take ~1.2s each.
    test.slow();
    const zoomIn = page.locator('mapml-viewer').getByTestId('zoom-in-button');
    const zoomIndicator = page.locator('#zoom-indicator');

    for (let n = 1; n < 18; n++) {
      await expect(zoomIndicator).toHaveAttribute(
        'data-zoom-level',
        String(n)
      );
      await zoomIn.click();
    }
  });

  // From the map-zoom describes of MapML-OpenLayers test/match-media.test.js
  // and MapML-MapLibre tests/match-media.spec.ts.
  test('map-zoom ranges re-evaluate, with change events, on zoomTo', async ({
    page
  }) => {
    const map = page.locator('mapml-viewer');
    const zoom = () => map.evaluate((map) => map.zoom);
    await page.evaluate(() => {
      const mql = document
        .querySelector('mapml-viewer')
        .matchMedia('(map-zoom < 15)');
      window.zoomState = { changes: 0, matches: mql.matches };
      mql.addEventListener('change', () => {
        window.zoomState.changes++;
        window.zoomState.matches = mql.matches;
      });
    });
    expect(await page.evaluate(() => window.zoomState)).toEqual({
      changes: 0,
      matches: true
    });

    await map.evaluate((map) => map.zoomTo(45.406314, -75.6883335, 14));
    await expect.poll(zoom).toBe(14);
    expect(
      await map.evaluate((map) => ({
        at14: map.matchMedia('(map-zoom: 14)').matches,
        at13: map.matchMedia('(map-zoom: 13)').matches,
        lessThan15: map.matchMedia('(map-zoom < 15)').matches,
        greaterThan10: map.matchMedia('(map-zoom > 10)').matches
      }))
    ).toEqual({ at14: true, at13: false, lessThan15: true, greaterThan10: true });

    await map.evaluate((map) => map.zoomTo(45.406314, -75.6883335, 18));
    await expect.poll(() => page.evaluate(() => window.zoomState.matches)).toBe(
      false
    );
    expect(
      await page.evaluate(() => window.zoomState.changes)
    ).toBeGreaterThanOrEqual(1);
  });

  // From MapML-OpenLayers test/match-media.test.js.
  test('zoomend is dispatched when the zoom changes, not on a pan', async ({
    page
  }) => {
    const map = page.locator('mapml-viewer');
    await map.evaluate((map) => {
      window.events = { zoomend: 0, moveend: 0 };
      map.addEventListener('zoomend', () => window.events.zoomend++);
      map.addEventListener('map-moveend', () => window.events.moveend++);
    });
    const events = () => page.evaluate(() => window.events);

    await map.evaluate((map) => map.zoomTo(45.406314, -75.6883335, 16));
    await expect.poll(events).toEqual({ zoomend: 1, moveend: 1 });

    await map.evaluate((map) => map.zoomTo(45.5, -75.6, 16));
    await expect.poll(events).toEqual({ zoomend: 1, moveend: 2 });
  });
});
