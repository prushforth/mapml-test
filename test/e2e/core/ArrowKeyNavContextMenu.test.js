// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/core/ArrowKeyNavContextMenu.test.js. Upstream ran in one
// headed persistent context (slowMo 250) where each test built on the last,
// reached the layer control by a fixed number of Tab presses (MapML.js's tab
// order of controls), read the focused item's innerHTML (MapML.js's label
// markup) and checked menus' `hidden` through `viewer._map.contextMenu`. Here
// each test loads its own page (D4), in CBMTILE as upstream and again in
// OSMTILE (D3); menu items are identified by their contract data-id and menus
// by their contract classes (docs/CONTRACT.md); a menu is judged closed by
// visibility. Layer and extent rows are found in the layer control by role
// and name, opened as a user does, and the menu is opened from the focused
// row's checkbox with Shift+F10, which is what upstream's Tab presses led up
// to.
import { test, expect } from '@playwright/test';
import { requires } from '../../helpers/capabilities.js';

// Per projection: the fixture, the name of its first (remote) layer in the
// layer control, and the label of its inline layer, which has one extent.
const PROJECTIONS = {
  CBMTILE: {
    file: 'ArrowKeyNavContextMenu.html',
    layer: 'Canada Base Map - Transportation (CBMT)',
    inline: 'CBMT - INLINE'
  },
  OSMTILE: {
    file: 'ArrowKeyNavContextMenuOSMTILE.html',
    layer: 'OpenStreetMap (test tiles, zoom 0-18)',
    inline: 'OSMTILE - INLINE'
  }
};

const MENUS = {
  map: '.mapml-contextmenu:not(.mapml-layer-menu):not(.mapml-extent-menu):not(#mapml-copy-submenu)',
  copy: '#mapml-copy-submenu',
  layer: '.mapml-layer-menu',
  extent: '.mapml-extent-menu'
};
const menu = (page, name) => page.locator(MENUS[name]);
const item = (page, name, id) =>
  page.locator(`${MENUS[name]} [data-id="${id}"]`);

// Press `key` (if given), then expect `id` in menu `name` to have focus.
async function expectFocus(page, name, id, key) {
  if (key) await page.keyboard.press(key);
  await expect(item(page, name, id), `${key ?? ''} -> ${id}`).toBeFocused();
}

// Load the page and wait for its layers.
async function open(page, file) {
  await page.goto(file);
  await page
    .locator('mapml-viewer')
    .evaluate((viewer) => viewer.whenLayersReady());
}

// The map's centre, to check that keys used in a menu don't move the map.
const center = (page) =>
  page
    .locator('mapml-viewer')
    .evaluate((viewer) => [parseFloat(viewer.lat), parseFloat(viewer.lon)]);
async function expectNotMoved(page, [lat, lon]) {
  const [lat2, lon2] = await center(page);
  expect(lat2).toBeCloseTo(lat, 6);
  expect(lon2).toBeCloseTo(lon, 6);
}

// Press `key` and wait for the map to have moved. The listener is in place
// before the key is pressed.
async function moveMap(page, key) {
  await page.locator('mapml-viewer').evaluate((viewer) => {
    window.moved = new Promise((resolve) =>
      viewer.addEventListener('map-moveend', resolve, { once: true })
    );
  });
  await page.keyboard.press(key);
  await page.evaluate(() => window.moved);
}

for (const [projection, { file, layer, inline }] of Object.entries(
  PROJECTIONS
)) {
  test.describe(
    `Using arrow keys to navigate context menu (${projection})`,
    { tag: `@${projection}` },
    () => {
      requires(test, projection);

      test.beforeEach(async ({ page }) => {
        await open(page, file);
      });

      const layerControl = (page) => page.getByTestId('layer-control');
      const layerGroup = (page, name) =>
        layerControl(page).getByRole('group', { name, exact: true });
      const layerCheckbox = (page, name) =>
        layerGroup(page, name).getByRole('checkbox', { name, exact: true });
      // The inline layer's one extent: the checkbox in a group nested in the
      // layer's (its name is the extent's label, which the fixture doesn't
      // give, and implementations name unlabelled extents differently).
      const extentCheckbox = (page) =>
        layerGroup(page, inline).getByRole('group').getByRole('checkbox');
      // The layer's settings, which hold its extents; found by aria-expanded,
      // not by their (localized) title.
      const settings = (page, expanded) =>
        layerGroup(page, inline).getByRole('button', { expanded });

      test('Testing layer contextmenu', async ({ page }) => {
        await layerControl(page).hover();
        await layerCheckbox(page, layer).focus();
        await page.keyboard.press('Shift+F10');
        await expect(menu(page, 'layer')).toBeVisible();
        await expectFocus(page, 'layer', 'zoom-to-layer');

        await expectFocus(page, 'layer', 'copy-layer', 'ArrowDown');
        await expectFocus(page, 'layer', 'zoom-to-layer', 'ArrowDown');
        await expectFocus(page, 'layer', 'copy-layer', 'ArrowDown');
        await expectFocus(page, 'layer', 'zoom-to-layer', 'ArrowDown');
        await expectFocus(page, 'layer', 'copy-layer', 'ArrowUp');
        // Tab and Shift+Tab move like ArrowDown and ArrowUp.
        await expectFocus(page, 'layer', 'zoom-to-layer', 'Tab');
        await expectFocus(page, 'layer', 'copy-layer', 'Shift+Tab');

        await page.locator('mapml-viewer').click();
        await expect(menu(page, 'layer')).toBeHidden();
      });

      test('Testing Extent layer contextmenu', async ({ page }) => {
        // Open the layer control and the inline layer's settings, to reveal
        // its extent.
        await layerControl(page).hover();
        await settings(page, false).press('Enter');
        await extentCheckbox(page).focus();

        await page.keyboard.press('Shift+F10');
        await expect(menu(page, 'extent')).toBeVisible();
        await expectFocus(page, 'extent', 'zoom-to-extent');
        await expectFocus(page, 'extent', 'copy-extent', 'Tab');
        await expectFocus(page, 'extent', 'zoom-to-extent', 'ArrowUp');
        await expectFocus(page, 'extent', 'copy-extent', 'ArrowDown');
        await expectFocus(page, 'extent', 'zoom-to-extent', 'ArrowDown');

        // Escape closes the menu and returns focus to the extent.
        await page.keyboard.press('Escape');
        await expect(menu(page, 'extent')).toBeHidden();
        await expect(extentCheckbox(page)).toBeFocused();

        // A click on the map closes it too.
        await page.keyboard.press('Shift+F10');
        await expect(menu(page, 'extent')).toBeVisible();
        await page.locator('mapml-viewer').click();
        await expect(menu(page, 'extent')).toBeHidden();

        // The extent is still revealed after the layer control was closed
        // and reopened, and its menu still opens.
        await expect(extentCheckbox(page)).toBeHidden();
        await layerControl(page).hover();
        await expect(settings(page, true)).toBeVisible();
        await extentCheckbox(page).focus();
        await page.keyboard.press('Shift+F10');
        await expectFocus(page, 'extent', 'zoom-to-extent');
      });

      test('(partial) Up and Down Arrow keys to navigate the contextmenu', async ({
        page
      }) => {
        // Back, Forward and Reload are disabled (no history yet), so they
        // are skipped.
        const start = await center(page);
        await page.locator('mapml-viewer').click({ button: 'right' });
        await expect(menu(page, 'map')).toBeVisible();
        await expectFocus(page, 'map', 'fullscreen', 'ArrowDown');
        await expectFocus(page, 'map', 'copy', 'ArrowDown');
        await expectFocus(page, 'map', 'paste', 'ArrowDown');
        await expectFocus(page, 'map', 'copy', 'ArrowUp');
        await expectFocus(page, 'map', 'paste', 'ArrowDown');
        await expectFocus(page, 'map', 'toggle-controls', 'ArrowDown');
        await expectFocus(page, 'map', 'toggle-debug', 'ArrowDown');
        await expectFocus(page, 'map', 'view-source', 'ArrowDown');
        await expectFocus(page, 'map', 'fullscreen', 'ArrowDown');
        await expectFocus(page, 'map', 'view-source', 'ArrowUp');
        // The arrow keys moved focus in the menu, not the map.
        await expectNotMoved(page, start);
      });

      test('Right and Left Arrow keys to navigate the contextmenu', async ({
        page
      }) => {
        await page.locator('mapml-viewer').click();
        const start = await center(page);
        await page.keyboard.press('Shift+F10');
        await expect(menu(page, 'map')).toBeVisible();
        await expectFocus(page, 'map', 'fullscreen');
        await expectFocus(page, 'map', 'copy', 'ArrowDown');

        await expectFocus(page, 'copy', 'copy-map', 'ArrowRight');
        await expect(menu(page, 'copy')).toBeVisible();
        await expectFocus(page, 'copy', 'copy-extent', 'ArrowDown');
        await expectFocus(page, 'copy', 'copy-location', 'ArrowDown');
        await expectFocus(page, 'copy', 'copy-map', 'ArrowDown');
        await expectFocus(page, 'copy', 'copy-location', 'ArrowUp');
        await expectFocus(page, 'copy', 'copy-map', 'ArrowDown');
        await expectFocus(page, 'map', 'copy', 'ArrowLeft');
        await expect(menu(page, 'copy')).toBeHidden();

        await expectFocus(page, 'copy', 'copy-map', 'ArrowRight');
        await expectFocus(page, 'copy', 'copy-extent', 'ArrowDown');
        await expectFocus(page, 'copy', 'copy-location', 'ArrowDown');
        await expectFocus(page, 'map', 'copy', 'ArrowLeft');
        await expect(menu(page, 'copy')).toBeHidden();
        // The arrow keys moved focus in the menus, not the map.
        await expectNotMoved(page, start);
      });

      test('(full) Up and Down Arrow keys to navigate the contextmenu', async ({
        page
      }) => {
        // Two moves, then Back (the first item enabled), so that Back,
        // Forward and Reload are all enabled.
        await page.locator('mapml-viewer').click();
        await moveMap(page, 'ArrowRight');
        await moveMap(page, 'ArrowRight');
        await page.keyboard.press('Shift+F10');
        await expectFocus(page, 'map', 'back');
        await moveMap(page, 'Enter');
        await expect(menu(page, 'map')).toBeHidden();

        await page.keyboard.press('Shift+F10');
        await expectFocus(page, 'map', 'back');
        for (const id of [
          'forward',
          'reload',
          'fullscreen',
          'copy',
          'paste',
          'toggle-controls',
          'toggle-debug',
          'view-source',
          'back'
        ]) {
          await expectFocus(page, 'map', id, 'ArrowDown');
        }
        await expectFocus(page, 'map', 'view-source', 'ArrowUp');
      });
    }
  );
}
