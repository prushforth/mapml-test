// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/api/matchMedia/map-bounding-box.test.js. The fixture
// gives the viewer a layer shown only while one media query matches:
// (map-projection: OSMTILE) and (map-zoom < 14) and the viewer's initial
// extent overlapping its current one. The viewer starts at zoom 14, so the
// query doesn't match until the map zooms out; the layer is only hidden or
// shown by the query's change events.
// Was quarantined as map-bounding-box-leaflet.test.js: it clicked Leaflet's
// .leaflet-control-zoom-in/-out and ran in a headed persistent context. Now
// the zoom buttons are found by their data-testid (docs/CONTRACT.md), the
// test loads its own page (D4), and fixed sleeps are replaced by waiting for
// the viewer's zoom. OSMTILE only, as upstream: the query and the layer are
// written for OSMTILE.
import { test, expect } from '@playwright/test';

test.describe('matchMedia map-bounding-box tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('map-bounding-box.html', { waitUntil: 'networkidle' });
    await page.evaluate(() =>
      document.querySelector('mapml-viewer').whenLayersReady()
    );
  });

  test('matchMedia API detects changes in map-extents', async ({ page }) => {
    const map = page.locator('mapml-viewer');
    const zoomIn = map.getByTestId('zoom-in-button');
    const zoomOut = map.getByTestId('zoom-out-button');
    const zoom = () => map.evaluate((map) => map.zoom);

    const layer = page.locator('map-layer[label="test media query"]');

    // upon creation, the test query layer should not be hidden
    await expect(layer).not.toHaveAttribute('hidden');

    // the test query layer should be hidden as map-zoom is no longer less than 14
    await zoomOut.click();
    await expect.poll(zoom).toBe(13);
    await zoomIn.click();
    await expect.poll(zoom).toBe(14);
    await expect(layer).toHaveAttribute('hidden');

    // the layer should be shown as we zoom out again
    await zoomOut.click();
    await expect.poll(zoom).toBe(13);
    await expect(layer).not.toHaveAttribute('hidden');

    // move the map so that the layer is out of the map's extent
    await page.evaluate(() => {
      const map = document.querySelector('mapml-viewer');
      map.zoomTo(0, 0, 13);
    });
    await expect(layer).toHaveAttribute('hidden');

    // move the map back so that the layer is within of the map's extent
    await page.evaluate(() => {
      const map = document.querySelector('mapml-viewer');
      map.zoomTo(45.406314, -75.6883335, 13);
    });
    await expect(layer).not.toHaveAttribute('hidden');
  });
});
