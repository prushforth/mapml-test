// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/api/events/map-projectionchange.test.js. When the
// viewer's projection changes, its layers are rebuilt in the new projection
// and `map-projectionchange` is dispatched once the rebuild has settled: by
// then each <map-extent>'s `disabled` reflects whether it matches the new
// projection, and the opacity authors gave layers and extents has survived.
// Upstream shared one persistent browser across the file, slept for fixed
// times instead of waiting for the event it is named after, and drew the
// OSMTILE extent from an external tile server. Here each test loads its own
// page (D4), the switch waits for `map-projectionchange`, and the OSMTILE
// extent uses the local test tiles (D8). Upstream's skipped history test now
// passes on MapML.js, so it runs, after a move that gives reload something
// to reset. The spec is about the OSMTILE to CBMTILE switch, so it stays in
// those projections and is tagged (D3).
import { test, expect } from '@playwright/test';
import { requires } from '../../../helpers/capabilities.js';

// Set the viewer's projection; resolves when the viewer dispatches
// `map-projectionchange`.
function changeProjection(viewer, projection) {
  return viewer.evaluate(
    (v, projection) =>
      new Promise((resolve) => {
        v.addEventListener('map-projectionchange', () => resolve(), {
          once: true
        });
        v.projection = projection;
      }),
    projection
  );
}

test.describe('map-projectionchange test ', { tag: '@CBMTILE' }, () => {
  requires(test, 'OSMTILE', 'CBMTILE');

  let viewer, osmtileExtent, cbmtileExtent;
  test.beforeEach(async ({ page }) => {
    await page.goto('events/map-projectionchange.html', {
      waitUntil: 'networkidle'
    });
    viewer = page.locator('mapml-viewer');
    osmtileExtent = page.locator('map-extent[units=OSMTILE]');
    cbmtileExtent = page.locator('map-extent[units=CBMTILE]');
    await viewer.evaluate((v) => v.whenLayersReady());
    // `disabled` settles asynchronously after the layers are ready.
    await expect
      .poll(() => cbmtileExtent.evaluate((e) => e.disabled))
      .toBe(true);
  });

  test('Multiple map-extents in different projections adapt to map-projectionchange', async () => {
    expect(await viewer.evaluate((v) => v.projection)).toEqual('OSMTILE');
    expect(await osmtileExtent.evaluate((e) => e.disabled)).toBe(false);
    expect(await cbmtileExtent.evaluate((e) => e.disabled)).toBe(true);
    await changeProjection(viewer, 'CBMTILE');
    // Already settled when the event fires: no waiting.
    expect(await viewer.evaluate((v) => v.projection)).toEqual('CBMTILE');
    expect(await osmtileExtent.evaluate((e) => e.disabled)).toBe(true);
    expect(await cbmtileExtent.evaluate((e) => e.disabled)).toBe(false);
  });
  test('History is empty after map-projectionchange', async ({ page }) => {
    // Upstream skipped this ("history api needs a complete review"), and
    // without a move first it passed vacuously: a fresh map has no history
    // to reload. Move first, so the reset is what's tested.
    const reload = page.getByTestId('reload-control').getByRole('button');
    expect(await viewer.evaluate((v) => v.projection)).toEqual('OSMTILE');
    await viewer.evaluate(
      (v) =>
        new Promise((resolve) => {
          v.addEventListener('map-moveend', () => resolve(), { once: true });
          v.zoomTo(45.411105, -75.703611, 3);
        })
    );
    await expect(reload).toBeEnabled();
    await changeProjection(viewer, 'CBMTILE');
    expect(await viewer.evaluate((v) => v.projection)).toEqual('CBMTILE');
    await expect(reload).toBeDisabled();
  });
  test('Opacity is maintained on map-layer and map-extent after map-projectionchange', async ({
    page
  }) => {
    const layer = page.locator('map-layer');
    await layer.evaluate((layer) => (layer.opacity = 0.5));
    expect(await layer.evaluate((layer) => layer.opacity)).toBe(0.5);
    await osmtileExtent.evaluate((e) => (e.opacity = 0.4));
    await cbmtileExtent.evaluate((e) => (e.opacity = 0.3));
    await changeProjection(viewer, 'CBMTILE');
    expect(await osmtileExtent.evaluate((e) => e.opacity)).toBe(0.4);
    expect(await cbmtileExtent.evaluate((e) => e.opacity)).toBe(0.3);
    expect(await layer.evaluate((layer) => layer.opacity)).toBe(0.5);
  });
});
