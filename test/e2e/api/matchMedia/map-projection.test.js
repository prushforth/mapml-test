// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/api/matchMedia/map-projection.test.js. The fixture has an
// OSMTILE and a CBMTILE layer and a (map-projection: OSMTILE) matcher; on
// load and on every change event it hides the layer that doesn't match the
// map's projection. Two buttons set the viewer's projection property.
// Upstream ran in a headed persistent context shared across the file and
// slept 500ms after each click. Here the test loads its own page (D4) and
// waits for whenLayersReady() plus a macrotask, so the fixture's initial
// evaluation (itself in a whenLayersReady() callback) has run; the sleeps are
// gone because the attribute assertions retry. It also checks the initial
// state and that the matching layer is shown, not only that the other is
// hidden. Tagged @CBMTILE (D3): it is about switching to CBMTILE.
import { test, expect } from '@playwright/test';
import { requires } from '../../../helpers/capabilities.js';

test.describe('matchMedia map-projection tests', { tag: '@CBMTILE' }, () => {
  requires(test, 'CBMTILE');

  test.beforeEach(async ({ page }) => {
    await page.goto('map-projection.html');
    await page.evaluate(async () => {
      await document.querySelector('mapml-viewer').whenLayersReady();
      await new Promise((resolve) => setTimeout(resolve));
    });
  });

  test('matchMedia API shows maps based on projections selected by user', async ({
    page
  }) => {
    const map = page.locator('mapml-viewer');
    const osmLayer = page.locator('#OSMTILE');
    const cbmtLayer = page.locator('#CBMTILE');
    const switchOSM = page.locator('.switchOSM');
    const switchCBMT = page.locator('.switchCBMT');

    // the map starts in OSMTILE, so the query matches
    await expect(cbmtLayer).toHaveAttribute('hidden');
    await expect(osmLayer).not.toHaveAttribute('hidden');

    await switchCBMT.click();
    await expect(map).toHaveAttribute('projection', 'CBMTILE');
    await expect(osmLayer).toHaveAttribute('hidden');
    await expect(cbmtLayer).not.toHaveAttribute('hidden');

    await switchOSM.click();
    await expect(map).toHaveAttribute('projection', 'OSMTILE');
    await expect(cbmtLayer).toHaveAttribute('hidden');
    await expect(osmLayer).not.toHaveAttribute('hidden');
  });
});
