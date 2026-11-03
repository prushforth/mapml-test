// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/api/events/map-change-event.test.js. `map-change` fires
// on a <map-layer> or <map-extent> only when a user toggles its checkbox in
// the layer control, never when a script changes `checked`. Upstream found
// the layer checkbox by Leaflet's `.leaflet-control-layers-selector` class
// and reached the checkboxes by keyboard with a fixed number of Tab presses
// (one renderer's tab order), in a headed persistent browser where every
// test built on the last one. Here each test builds its own viewer (D4), in
// OSMTILE and again in CBMTILE (D3), and finds the checkboxes where a user
// meets them: in the layer control (docs/CONTRACT.md), by role and by the
// layer's or extent's name. The keyboard tests focus the checkbox and toggle
// it with Space, which is what upstream's Tab presses led up to.
import { test, expect } from '@playwright/test';
import { requires } from '../../../helpers/capabilities.js';

const LAYER = 'Tiles';
const EXTENT = 'Tile extent';

// Per projection: the initial view, and an inline layer the local tiles
// cover there (as tiles/osmtile/osmtile.mapml and tiles/cbmt/cbmt.mapml).
const PROJECTIONS = {
  OSMTILE: {
    zoom: 1,
    extent: `
      <map-input name="z" type="zoom" value="1" min="0" max="1"></map-input>
      <map-input name="x" type="location" units="tilematrix" axis="column" min="0" max="2"></map-input>
      <map-input name="y" type="location" units="tilematrix" axis="row" min="0" max="2"></map-input>
      <map-link rel="tile" tref="/tiles/osmtile/{z}/{x}/{y}.png"></map-link>`
  },
  CBMTILE: {
    zoom: 2,
    extent: `
      <map-input name="z" type="zoom" value="17" min="0" max="17"></map-input>
      <map-input name="y" type="location" units="tilematrix" axis="row" min="29750" max="34475"></map-input>
      <map-input name="x" type="location" units="tilematrix" axis="column" min="26484" max="32463"></map-input>
      <map-link rel="tile" tref="/tiles/cbmt/{z}/c{x}_r{y}.png"></map-link>`
  }
};

// Count the `map-change` events `selector` receives.
async function countMapChange(page, selector) {
  await page.$eval(selector, (el) => {
    el._mapChangeCount = 0;
    el.addEventListener('map-change', () => el._mapChangeCount++);
  });
  return () => page.$eval(selector, (el) => el._mapChangeCount);
}

for (const [projection, { zoom, extent }] of Object.entries(PROJECTIONS)) {
  test.describe(
    `Map-change events are only fired when layers/extents are checked or unchecked in the layer menu (${projection})`,
    { tag: `@${projection}` },
    () => {
      requires(test, projection);

      let layerControl;
      test.beforeEach(async ({ page }) => {
        await page.goto('events/map-change-event.html', {
          waitUntil: 'networkidle'
        });
        await page.evaluate(
          async ({ projection, zoom, extent, LAYER, EXTENT }) => {
            const viewer = document.createElement('mapml-viewer');
            for (const [name, value] of Object.entries({
              projection,
              zoom,
              lat: 45,
              lon: -90,
              controls: ''
            })) {
              viewer.setAttribute(name, value);
            }
            viewer.innerHTML = `
              <map-layer label="${LAYER}" checked>
                <map-extent label="${EXTENT}" units="${projection}" checked>${extent}
                </map-extent>
              </map-layer>`;
            document.body.appendChild(viewer);
            await viewer.whenReady();
            await viewer.whenLayersReady();
          },
          { projection, zoom, extent, LAYER, EXTENT }
        );
        layerControl = page.getByTestId('layer-control');
        await layerControl.hover();
      });

      const layerGroup = () =>
        layerControl.getByRole('group', { name: LAYER, exact: true });
      const layerCheckbox = () =>
        layerGroup().getByRole('checkbox', { name: LAYER, exact: true });
      // The extent's checkbox is in the layer's settings, which start closed.
      // The settings button is found by its aria-expanded, not its
      // (localized) title.
      const extentCheckbox = async () => {
        await layerGroup().getByRole('button', { expanded: false }).click();
        return layerGroup().getByRole('checkbox', {
          name: EXTENT,
          exact: true
        });
      };

      test('Setting map-layer checked from script does not fire map-change', async ({
        page
      }) => {
        const count = await countMapChange(page, 'map-layer');
        await page.$eval('map-layer', (layer) => {
          layer.checked = false;
          layer.checked = true;
        });
        await page.$eval('map-layer', (layer) => {
          layer.removeAttribute('checked');
          layer.setAttribute('checked', '');
        });
        // The checkbox follows the script, but that isn't a user's change.
        await expect(layerCheckbox()).toBeChecked();
        expect(await count()).toBe(0);
      });

      test('Clicking the layer checkbox fires map-change', async ({ page }) => {
        const count = await countMapChange(page, 'map-layer');
        const checkbox = layerCheckbox();
        await checkbox.click();
        await expect(checkbox).not.toBeChecked();
        await expect(page.locator('map-layer')).not.toHaveAttribute(
          'checked'
        );
        await checkbox.click();
        await expect(checkbox).toBeChecked();
        expect(await count()).toBe(2);
      });

      test('Toggling the layer checkbox from the keyboard fires map-change', async ({
        page
      }) => {
        const count = await countMapChange(page, 'map-layer');
        const checkbox = layerCheckbox();
        await checkbox.focus();
        await page.keyboard.press('Space');
        await expect(checkbox).not.toBeChecked();
        await page.keyboard.press('Space');
        await expect(checkbox).toBeChecked();
        expect(await count()).toBe(2);
      });

      test('Setting map-extent checked from script does not fire map-change', async ({
        page
      }) => {
        const count = await countMapChange(page, 'map-extent');
        await page.$eval('map-extent', (extent) => {
          extent.checked = false;
          extent.checked = true;
        });
        await page.$eval('map-extent', (extent) => {
          extent.removeAttribute('checked');
          extent.setAttribute('checked', '');
        });
        await expect(await extentCheckbox()).toBeChecked();
        expect(await count()).toBe(0);
      });

      test('Clicking the extent checkbox fires map-change', async ({
        page
      }) => {
        const count = await countMapChange(page, 'map-extent');
        const checkbox = await extentCheckbox();
        await checkbox.click();
        await expect(checkbox).not.toBeChecked();
        await expect(page.locator('map-extent')).not.toHaveAttribute(
          'checked'
        );
        await checkbox.click();
        await expect(checkbox).toBeChecked();
        expect(await count()).toBe(2);
      });

      test('Toggling the extent checkbox from the keyboard fires map-change', async ({
        page
      }) => {
        const count = await countMapChange(page, 'map-extent');
        const checkbox = await extentCheckbox();
        await checkbox.focus();
        await page.keyboard.press('Space');
        await expect(checkbox).not.toBeChecked();
        await page.keyboard.press('Space');
        await expect(checkbox).toBeChecked();
        expect(await count()).toBe(2);
      });
    }
  );
}
