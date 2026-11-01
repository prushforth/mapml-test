// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/api/locateApi.test.js. Each test builds its own viewer
// (D4), in OSMTILE and again in CBMTILE (D3), and finds the locate button
// through the contract's `locate-control` (docs/CONTRACT.md). locate() is
// asynchronous (it waits for a geolocation fix), so results are polled for
// rather than read straight after the call.
import { test, expect } from '@playwright/test';
import { requires } from '../../helpers/capabilities.js';
import { createViewer, addLayer } from '../../helpers/viewer.js';

const FIX = { longitude: -73.56766530667056, latitude: 45.5027789304487 };

test.use({
  geolocation: FIX,
  permissions: ['geolocation']
});

// Per projection: the initial view, and a layer the local tiles cover there.
// MapML.js limits the map's zoom range to its layers', and locate() zooms to
// 16, so each layer must allow that (as upstream's cbmt.mapml, 0-17, does).
const PROJECTIONS = {
  OSMTILE: {
    zoom: 1,
    layer: 'tiles/osmtile/osmtile-z18.mapml',
    label: 'OSMTILE'
  },
  CBMTILE: { zoom: 2, layer: 'tiles/cbmt/cbmt.mapml', label: 'CBMT' }
};

// The viewer's centre, rounded as upstream rounds it.
const centre = (page, digits) =>
  page.$eval(
    'body > mapml-viewer',
    (viewer, digits) => [
      parseFloat(viewer.lat).toFixed(digits),
      parseFloat(viewer.lon).toFixed(digits)
    ],
    digits
  );

for (const [projection, { zoom, layer, label }] of Object.entries(
  PROJECTIONS
)) {
  test.describe(
    `Locate API Test (${projection})`,
    { tag: `@${projection}` },
    () => {
      requires(test, projection);

      test.beforeEach(async ({ page }) => {
        await page.goto('locateApi.html', { waitUntil: 'networkidle' });
        await createViewer(page, {
          projection,
          zoom,
          lat: 45,
          lon: -90,
          controls: '',
          controlslist: 'geolocation'
        });
        await addLayer(page, { label, src: layer, checked: '' });
      });

      test('Using locate API to find myself', async ({ page }) => {
        await page.$eval('body > mapml-viewer', (viewer) => viewer.locate());

        //rounding to three decimal places
        await expect
          .poll(() => centre(page, 3))
          .toEqual(['45.503', '-73.568']);
      });

      test('Testing maplocationfound event', async ({ page }) => {
        const latlng = await page.evaluate(() => {
          const viewer = document.querySelector('body > mapml-viewer');
          return new Promise((resolve) => {
            viewer.addEventListener(
              'maplocationfound',
              (e) => {
                resolve(e.detail.latlng);
              },
              { once: true }
            );
            viewer.locate();
          });
        });
        expect(latlng.lat).toEqual(FIX.latitude);
        expect(latlng.lng).toEqual(FIX.longitude);
      });

      // Upstream dispatched a locationerror event itself and listened for it,
      // which exercised no implementation. Here geolocation really fails (the
      // permission is withdrawn), and the viewer must report it, with the
      // browser's reason, and stay where it was. MapML.js words the error as
      // Leaflet does ("Geolocation error: <reason>."), so only the browser's
      // reason is compared.
      test('Testing locationerror event', async ({ page, context }) => {
        await context.clearPermissions();
        const error = await page.evaluate(() => {
          const viewer = document.querySelector('body > mapml-viewer');
          return new Promise((resolve) => {
            viewer.addEventListener(
              'locationerror',
              (e) => {
                resolve(e.detail.error);
              },
              { once: true }
            );
            viewer.locate();
          });
        });
        expect(error).toContain('User denied Geolocation');
        expect(await centre(page, 3)).toEqual(['45.000', '-90.000']);
      });

      // MapML.js's locate() stops the button's location tracking first, so
      // afterwards the button is back in its initial (not tracking) state;
      // its title says so in whatever language the viewer uses.
      test('Testing API when the button is used', async ({ page }) => {
        const button = page.getByTestId('locate-control').getByRole('button');
        const notTracking = await button.getAttribute('title');
        await page.click('body > mapml-viewer');
        await button.click();
        await expect(button).not.toHaveAttribute('title', notTracking);

        await page.mouse.move(600, 300);
        await page.mouse.down();
        await page.mouse.move(1200, 450, { steps: 5 });
        await page.mouse.up();
        await page.$eval('body > mapml-viewer', (viewer) => viewer.locate());

        await expect.poll(() => centre(page, 1)).toEqual(['45.5', '-73.6']);
        await expect(button).toHaveAttribute('title', notTracking);
      });
    }
  );
}
