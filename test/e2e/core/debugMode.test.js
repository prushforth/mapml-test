// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/core/debugMode.test.js. Upstream ran in one headed
// persistent context (slowMo 350), slept after loading and moving, and judged
// the tile grid and each layer's bounds rectangle by Leaflet's DOM
// (.leaflet-layer.mapml-debug-grid, SVG paths classed .mapml-debug-vectors).
// Here each test loads its own page (D4), in CBMTILE as upstream and again in
// OSMTILE on a counterpart, debugModeOSMTILE.html (D3). The coordinate panel
// is DOM in every implementation and is read through the contract
// (docs/CONTRACT.md, "Debug mode"); what the overlay draws on the map is
// judged by pixels (D5).
//
// Pixels are captured from the upper middle of the map, clear of the control
// corners and of the panel. In both fixtures each layer's bounds rectangle has
// an edge there that no other rectangle shares. The tests that uncheck layers
// load the page without its tiles, so a change in those pixels can only come
// from the overlay. The beyond-range layer's rectangle lies outside the view
// (as upstream's did); unchecking it shrinks the total bounds rectangle, which
// the overlay draws as the union of the layers'.
import { test, expect } from '@playwright/test';
import { requires } from '../../helpers/capabilities.js';

// Per projection: the fixture, its layers (data-testid), the inline layer's
// label, a view outside the inline layer, what the panel reads with the
// pointer at the centre of the map, and one pixel at the fixture's zoom in
// degrees.
const PROJECTIONS = {
  CBMTILE: {
    file: 'debugMode.html',
    layers: ['cbmt-inline-layer', 'cbmt-large-layer', 'cbmt-beyond-layer'],
    inline: 'CBMT - INLINE',
    outside: [-51, 170, 0],
    // upstream's values, measured on MapML.js
    panel: {
      tile: 'tile: i: 141, j: 6',
      tilematrix: 'tilematrix: column: 3, row: 4',
      map: 'map: i: 250, j: 250',
      tcrs: 'tcrs: x: 909, y: 1030'
    },
    pixel: { lon: 0.5, lat: 0.35 }
  },
  OSMTILE: {
    file: 'debugModeOSMTILE.html',
    layers: ['osm-inline-layer', 'osm-large-layer', 'osm-beyond-layer'],
    inline: 'OSM - INLINE',
    outside: [-51, 170, 3],
    // measured on MapML.js
    panel: {
      tile: 'tile: i: 250, j: 103',
      tilematrix: 'tilematrix: column: 0, row: 1',
      map: 'map: i: 250, j: 250',
      tcrs: 'tcrs: x: 250, y: 359'
    },
    pixel: { lon: 0.36, lat: 0.25 }
  }
};

const viewer = (page) => page.locator('body > mapml-viewer');
const panel = (page) =>
  viewer(page).locator('table.mapml-debug > tbody.mapml-debug-panel');
const banner = (page) =>
  viewer(page).locator('table.mapml-debug > caption.mapml-debug-banner');
const row = (page, n) =>
  panel(page).locator(':scope > tr.mapml-debug-coordinates').nth(n);

const toggleDebug = (page) =>
  viewer(page).evaluate((viewer) => viewer.toggleDebug());

// Run `action` on the viewer and wait for the map to have moved. The listener
// is in place before the action runs.
const moveMap = (page, action, ...args) =>
  viewer(page).evaluate(
    (viewer, [action, args]) =>
      new Promise((resolve) => {
        viewer.addEventListener('map-moveend', resolve, { once: true });
        viewer[action](...args);
      }),
    [action, args]
  );

const setChecked = (page, testid, checked) =>
  page
    .getByTestId(testid)
    .evaluate((layer, checked) => (layer.checked = checked), checked);

// The upper middle of the map: clear of the controls in its corners and of
// the debug panel at its bottom left.
async function overlayPixels(page) {
  const box = await viewer(page).boundingBox();
  return page.screenshot({
    clip: { x: box.x + 60, y: box.y + 10, width: box.width - 120, height: 320 }
  });
}

// Wait for two identical captures, so a capture is never taken mid-paint.
async function settledPixels(page) {
  let previous = null;
  await expect
    .poll(async () => {
      const current = await overlayPixels(page);
      const settled = previous !== null && current.equals(previous);
      previous = current;
      return settled;
    })
    .toBe(true);
  return previous;
}

// Wait for the pixels to differ from `before`, then settle.
async function changedPixels(page, before, message) {
  await expect
    .poll(async () => !(await overlayPixels(page)).equals(before), { message })
    .toBe(true);
  return settledPixels(page);
}

for (const [projection, config] of Object.entries(PROJECTIONS)) {
  test.describe(
    `Debug mode (${projection})`,
    { tag: `@${projection}` },
    () => {
      requires(test, projection);

      // The map as drawn without debug mode, captured before it is turned on.
      let plain;

      // Load the page, capture `plain`, and turn debug mode on. Without
      // tiles, the overlay is all that is drawn, so a pixel change can only
      // come from it (two layers drawing the same semi-transparent tile
      // don't look the same as one, so unchecking a layer changes the
      // tiles' pixels too).
      async function open(page, { tiles = true } = {}) {
        if (!tiles) await page.route(/\.png$/, (route) => route.abort());
        await page.goto(config.file, { waitUntil: 'networkidle' });
        await viewer(page).evaluate((viewer) => viewer.whenLayersReady());
        plain = await settledPixels(page);
        await toggleDebug(page);
      }

      test('Debug elements added to map', async ({ page }) => {
        await open(page);
        await expect(
          panel(page).locator(':scope > tr.mapml-debug-coordinates')
        ).toHaveCount(6);
        // innerText, as upstream: the banner is styled uppercase
        expect(await banner(page).innerText()).toEqual('DEBUG MODE');
        // the tile grid and bounds are drawn over the map
        await changedPixels(page, plain, 'the overlay is drawn on the map');
      });

      test('Reasonable debug layer extent created', async ({ page }) => {
        await open(page, { tiles: false });
        const debug = await changedPixels(page, plain, 'debug mode on');

        // Each layer's bounds are drawn: unchecking it removes them and
        // checking it again draws them again.
        for (const layer of config.layers) {
          await setChecked(page, layer, false);
          await changedPixels(page, debug, `${layer} unchecked`);
          await setChecked(page, layer, true);
          await expect
            .poll(async () => (await overlayPixels(page)).equals(debug), {
              message: `${layer} checked again`
            })
            .toBe(true);
        }
      });

      test('Accurate debug coordinates', async ({ page }) => {
        await open(page);
        await page.hover('body > mapml-viewer');
        const rows = ['tile', 'tilematrix', 'map', 'tcrs', 'pcrs', 'gcrs'];
        await expect(row(page, 0)).toHaveText(/tile:/);
        const text = {};
        for (const [n, name] of rows.entries())
          text[name] = await row(page, n).innerText();

        expect(text.tile).toEqual(config.panel.tile);
        expect(text.tilematrix).toEqual(config.panel.tilematrix);
        expect(text.map).toEqual(config.panel.map);
        expect(text.tcrs).toEqual(config.panel.tcrs);

        // pcrs and gcrs: upstream compared MapML.js's figures to the
        // centimetre, but they depend on where the renderer puts the pixel
        // grid (Leaflet rounds its pixel origin to a whole pixel, so the
        // pointer is up to half a pixel from the exact centre). What every
        // implementation must agree on is that pcrs is where the map's own
        // extent puts the pointer's pixel, and gcrs is that location, the
        // centre of the map to within a pixel.
        const [, i, j] = text.map.match(/i: (\d+), j: (\d+)/).map(Number);
        const expected = await viewer(page).evaluate(
          (viewer, [i, j]) => {
            const { topLeft: tl, bottomRight: br } = viewer.extent;
            return {
              easting:
                tl.pcrs.horizontal +
                (i / viewer.clientWidth) *
                  (br.pcrs.horizontal - tl.pcrs.horizontal),
              northing:
                tl.pcrs.vertical +
                (j / viewer.clientHeight) *
                  (br.pcrs.vertical - tl.pcrs.vertical),
              lon: +viewer.lon,
              lat: +viewer.lat
            };
          },
          [i, j]
        );
        const [, easting, northing] = text.pcrs
          .match(/^pcrs: easting: (-?[\d.]+), northing: (-?[\d.]+)$/)
          .map(Number);
        expect(easting).toBeCloseTo(expected.easting, 0);
        expect(northing).toBeCloseTo(expected.northing, 0);
        const [, lon, lat] = text.gcrs
          .match(/^gcrs: lon: (-?\d+\.\d{6}), lat: (-?\d+\.\d{6})$/)
          .map(Number);
        expect(Math.abs(lon - expected.lon)).toBeLessThan(config.pixel.lon);
        expect(Math.abs(lat - expected.lat)).toBeLessThan(config.pixel.lat);
      });

      test('Layer disabled attribute update when debug is toggled off', async ({
        page
      }) => {
        await open(page);
        await toggleDebug(page);
        await moveMap(page, 'zoomTo', ...config.outside);
        await expect(page.getByTestId(config.layers[0])).toHaveAttribute(
          'disabled'
        );
      });

      test('Debug mode correctly re-enabled after disabling', async ({
        page
      }) => {
        await open(page);
        await toggleDebug(page);
        await moveMap(page, 'zoomTo', ...config.outside);
        await moveMap(page, 'back');
        const before = await settledPixels(page);
        await toggleDebug(page);

        await expect(
          panel(page).locator(':scope > tr.mapml-debug-coordinates')
        ).toHaveCount(6);
        expect(await banner(page).innerText()).toEqual('DEBUG MODE');
        await changedPixels(page, before, 'the overlay is drawn again');
      });

      test('Layer deselected then selected again', async ({ page }) => {
        await open(page, { tiles: false });
        const layerControl = page.getByTestId('layer-control');
        const checkbox = layerControl
          .getByRole('group', { name: config.inline, exact: true })
          .getByRole('checkbox', { name: config.inline, exact: true });
        const layer = page.getByTestId(config.layers[0]);
        // Click the inline layer's checkbox, then move the pointer off the
        // map so the layer control collapses out of the captured pixels.
        const toggle = async () => {
          await layerControl.hover();
          await checkbox.click();
          await page.mouse.move(800, 600);
          await expect(checkbox).toBeHidden();
        };
        const debug = await changedPixels(page, plain, 'debug mode on');

        await toggle();
        await expect(layer).not.toHaveAttribute('checked');
        const unchecked = await changedPixels(page, debug, 'layer unchecked');

        await toggle();
        await expect(layer).toHaveAttribute('checked');
        await changedPixels(page, unchecked, 'layer checked again');
      });

      // Moved in from MapML-OpenLayers test/debug-mode.test.js: debug mode
      // as a user reaches it, from the map's context menu, and off again.
      test('Debug mode toggled from the context menu', async ({ page }) => {
        await open(page);
        await toggleDebug(page);
        await expect(panel(page)).toHaveCount(0);
        const debugItem = page.locator(
          '.mapml-contextmenu:not(.mapml-layer-menu):not(.mapml-extent-menu):not(#mapml-copy-submenu) [data-id="toggle-debug"]'
        );

        await viewer(page).click({ button: 'right' });
        await debugItem.click();
        await expect(
          panel(page).locator(':scope > tr.mapml-debug-coordinates')
        ).toHaveCount(6);
        await changedPixels(page, plain, 'the overlay is drawn');

        await viewer(page).click({ button: 'right' });
        await debugItem.click();
        await expect(panel(page)).toHaveCount(0);
        await expect
          .poll(async () => (await overlayPixels(page)).equals(plain), {
            message: 'the overlay is removed'
          })
          .toBe(true);
      });
    }
  );
}
