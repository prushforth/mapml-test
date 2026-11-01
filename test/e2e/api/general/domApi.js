// The DOM API scenarios shared by api/domApi-mapml-viewer.test.js and
// api/domApi-web-map.test.js. Upstream (MapML.js test/e2e/api/) has the two
// specs as near-copies, because MapML.js duplicates <mapml-viewer> as
// <map is="web-map">; here each spec calls runTests() with its element. Each
// test builds its own viewer (D4), controls are read through the contract
// (docs/CONTRACT.md), and the scenarios run in OSMTILE and again in CBMTILE
// (D3).
import { test, expect } from '@playwright/test';
import {
  trackRequests,
  mapPixels,
  settledMapPixels
} from '../../../helpers/render.js';
import { requires } from '../../../helpers/capabilities.js';
import {
  VIEWERS,
  createViewer,
  addLayer,
  expectControls
} from '../../../helpers/viewer.js';

// Test titles, as upstream words them for each element.
const TITLES = {
  'mapml-viewer': {
    describe: 'mapml-viewer DOM API',
    create: 'Create a map viewer with document.createElement(mapml-viewer)',
    reattach: 'Remove mapml-viewer from DOM, add it back in',
    toggle:
      'Toggle all mapml-viewer controls by adding or removing controls attribute',
    defaultSize:
      'Creating mapml-viewer with the default size hides the fullscreen control and the controls attribute functions properly'
  },
  'web-map': {
    describe: 'web-map DOM API',
    create: 'Create a web map with document.createElement(map)',
    reattach: 'Remove map from DOM, add it back in',
    toggle:
      'Toggle all web map controls by adding or removing controls attribute',
    defaultSize:
      'Creating map with the default size hides the fullscreen control and the controls attribute functions properly'
  }
};

/**
 * Register the DOM API tests for one viewer element.
 * @param {'mapml-viewer'|'web-map'} is - the element under test
 * @param {string} fixture - the (empty) page the viewers are created in
 */
export default function runTests(is, fixture) {
  const titles = TITLES[is];

  // Per projection: a viewer position whose view the layer's local tiles cover,
  // and that layer.
  const PROJECTIONS = {
    OSMTILE: {
      zoom: 1,
      layer: 'tiles/osmtile/osmtile.mapml',
      title: 'OpenStreetMap (test tiles)'
    },
    CBMTILE: {
      zoom: 2,
      layer: 'tiles/cbmt/cbmt.mapml',
      title: 'Canada Base Map - Transportation (CBMT)'
    }
  };

  // The controls a 600x600 viewer has room for, all shown / all hidden.
  const ALL = ['zoom', 'reload', 'fullscreen', 'layer', 'scale', 'locate'];
  const all = (state) => Object.fromEntries(ALL.map((c) => [c, state]));

  let requests;
  let pageErrors;
  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    requests = trackRequests(page);
    await page.goto(fixture, { waitUntil: 'networkidle' });
  });

  for (const [projection, { zoom, layer, title }] of Object.entries(
    PROJECTIONS
  )) {
    // The upstream scenarios, in an order-independent form.
    const viewer = (page, attrs = {}) =>
      createViewer(
        page,
        {
          lat: 45,
          lon: -90,
          zoom,
          width: 600,
          height: 600,
          projection,
          ...attrs
        },
        { is }
      );
    const tileLayer = (page, attrs = {}) =>
      addLayer(page, { label: projection, src: layer, checked: '', ...attrs });

    test.describe(
      `${titles.describe} (${projection})`,
      { tag: `@${projection}` },
      () => {
        requires(test, projection);

        test(titles.create, async ({ page }) => {
          const v = await viewer(page, { controls: '' });
          expect(await v.evaluate((v) => v.nodeName)).toBe(
            VIEWERS[is].nodeName
          );
          // It upgraded to the custom element.
          expect(
            await v.evaluate((v, is) => v instanceof customElements.get(is), is)
          ).toBe(true);
          expect(pageErrors).toEqual([]);
          // With no layers there is no layer control, despite `controls`.
          await expectControls(page, { layer: 'hidden' });
        });

        test('Create a layer with document.createElement(map-layer)', async ({
          page
        }) => {
          await viewer(page, { controls: '' });
          const blankMap = await settledMapPixels(page);
          requests.clear();

          const l = await tileLayer(page);
          expect(await l.evaluate((l) => l.nodeName)).toBe('MAP-LAYER');
          await expectControls(page, { layer: 'shown' });

          // A hidden layer is left out of the layer control (but stays on the
          // map), leaving it empty, so it disappears.
          await l.evaluate((l) => l.setAttribute('hidden', ''));
          await expectControls(page, { layer: 'hidden' });

          // The layer is active: it went to the network for tiles. Which tiles,
          // how many, and at what scale is the renderer's business.
          await expect.poll(() => requests.count(/\.png$/)).toBeGreaterThan(0);
          // And something was drawn: the middle of the map no longer looks blank.
          await expect
            .poll(async () => (await mapPixels(page)).equals(blankMap))
            .toBe(false);
          expect(requests.failed).toEqual([]);
        });

        test(titles.reattach, async ({ page }) => {
          const v = await viewer(page, { controls: '' });
          await tileLayer(page);
          const paintedMap = await settledMapPixels(page);
          requests.clear();

          await v.evaluate((v) => {
            document.body.removeChild(v);
            document.body.appendChild(v);
          });
          await v.evaluate((v) => v.querySelector('map-layer').whenReady());
          // The label comes from the document's <map-title>, so this reads
          // right only once the layer has reloaded its document.
          expect(
            await v.evaluate((v) => v.querySelector('map-layer').label)
          ).toEqual(title);
          expect(pageErrors).toEqual([]);

          // The layer is live again: it re-read its MapML document. The tiles
          // are not refetched; they are already in the browser cache.
          await expect
            .poll(() => requests.count(/\.mapml$/))
            .toBeGreaterThan(0);
          // And the map is back to normal: it repainted what it had before.
          await expect
            .poll(async () => (await mapPixels(page)).equals(paintedMap))
            .toBe(true);
          expect(requests.failed).toEqual([]);
        });

        test(titles.toggle, async ({ page }) => {
          const v = await viewer(page, { controls: '' });
          await tileLayer(page);
          await expectControls(page, { ...all('shown'), locate: 'hidden' });

          await v.evaluate((v) => v.removeAttribute('controls'));
          expect(await v.evaluate((v) => v.hasAttribute('controls'))).toBe(
            false
          );
          // ALL the controls displayed on the map should have disappeared
          await expectControls(page, all('hidden'));
        });

        test('Removing layer removes layer control', async ({ page }) => {
          await viewer(page, { controls: '' });
          const l = await tileLayer(page);
          await expectControls(page, { layer: 'shown' });

          await l.evaluate((l) => l.remove());
          await expectControls(page, { layer: 'hidden' });
        });

        test('Create map without controls', async ({ page }) => {
          await viewer(page);
          await expectControls(page, all('hidden'));
        });

        test('Adding a layer to a map without controls does not add controls', async ({
          page
        }) => {
          await viewer(page);
          await tileLayer(page);
          await expectControls(page, all('hidden'));
        });

        test('Adding controls to a map which was created without controls', async ({
          page
        }) => {
          const v = await viewer(page);
          await tileLayer(page);
          await v.evaluate((v) => (v.controls = true));
          await expectControls(page, { ...all('shown'), locate: 'hidden' });
        });

        test(titles.defaultSize, async ({ page }) => {
          // No width/height: the default 300x150 object size.
          const v = await createViewer(
            page,
            { lat: 45, lon: -90, zoom, projection, controls: '' },
            { is }
          );
          // Fullscreen is squeezed out by the size budget at the default size;
          // zoom and reload fit, and the opt-in search control is not shown.
          await expectControls(page, {
            zoom: 'shown',
            reload: 'shown',
            fullscreen: 'absent',
            search: 'hidden'
          });

          await v.evaluate((v) => v.removeAttribute('controls'));
          await expectControls(page, { zoom: 'hidden', reload: 'hidden' });

          await v.evaluate((v) => v.setAttribute('controls', ''));
          await expectControls(page, { zoom: 'shown', reload: 'shown' });
        });

        test.describe('controlslist', () => {
          test('map created with controlslist', async ({ page }) => {
            await viewer(page, {
              controls: '',
              controlslist: 'nozoom nofullscreen noscale'
            });
            await expectControls(page, {
              ...all('hidden'),
              reload: 'shown'
            });
          });

          test('Adding controlslist using setAttribute and controlsList setter', async ({
            page
          }) => {
            const v = await viewer(page, { controls: '' });

            await v.evaluate((v) => v.setAttribute('controlslist', 'noreload'));
            expect(
              await v.evaluate((v) => v.getAttribute('controlslist'))
            ).toBe('noreload');
            await expectControls(page, {
              zoom: 'shown',
              reload: 'hidden',
              fullscreen: 'shown',
              layer: 'hidden', // no layers
              scale: 'shown',
              locate: 'hidden'
            });

            await v.evaluate((v) => (v.controlsList = 'noreload nozoom'));
            expect(
              await v.evaluate((v) => v.getAttribute('controlslist'))
            ).toBe('noreload nozoom');
            await expectControls(page, {
              zoom: 'hidden',
              reload: 'hidden',
              fullscreen: 'shown',
              layer: 'hidden',
              scale: 'shown',
              locate: 'hidden'
            });
          });

          test('Turning controls off and on to see if controlslist is preserved', async ({
            page
          }) => {
            const v = await viewer(page, {
              controls: '',
              controlslist: 'noreload nozoom'
            });

            await v.evaluate((v) => v.removeAttribute('controls'));
            await expectControls(page, all('hidden'));

            await v.evaluate((v) => v.setAttribute('controls', ''));
            await expectControls(page, {
              zoom: 'hidden',
              reload: 'hidden',
              fullscreen: 'shown',
              layer: 'hidden', // no layers
              scale: 'shown',
              locate: 'hidden'
            });
          });

          test('controlslist geolocation', async ({ page }) => {
            const v = await viewer(page, { controls: '' });

            await v.evaluate((v) =>
              v.setAttribute('controlslist', 'geolocation')
            );
            await expectControls(page, { locate: 'shown' });

            await v.evaluate((v) => (v.controlsList = 'noreload'));
            expect(
              await v.evaluate((v) => v.getAttribute('controlslist'))
            ).toBe('noreload');
            await expectControls(page, { locate: 'hidden', reload: 'hidden' });

            // the DOMTokenList methods reflect to the attribute, and show/hide
            await v.evaluate((v) => v.controlsList.add('geolocation'));
            expect(
              await v.evaluate((v) => v.getAttribute('controlslist'))
            ).toBe('noreload geolocation');
            await expectControls(page, { locate: 'shown', reload: 'hidden' });
            await v.evaluate((v) => v.controlsList.remove('geolocation'));
            expect(
              await v.evaluate((v) => v.getAttribute('controlslist'))
            ).toBe('noreload');
            await expectControls(page, { locate: 'hidden' });
          });

          test('controlslist search', async ({ page }) => {
            const v = await viewer(page, { controls: '' });
            // Search is opt-in: hidden until controlslist asks for it.
            await expectControls(page, { search: 'hidden' });

            await v.evaluate((v) => v.setAttribute('controlslist', 'search'));
            await expectControls(page, { search: 'shown' });

            await v.evaluate((v) => (v.controlsList = 'noreload'));
            await expectControls(page, { search: 'hidden' });

            await v.evaluate((v) => (v.controlsList = 'search'));
            await expectControls(page, { search: 'shown' });
            expect(
              await v.evaluate((v) => v.controlsList.supports('search'))
            ).toBe(true);

            // the DOMTokenList methods reflect to the attribute, and show/hide
            await v.evaluate((v) => v.controlsList.remove('search'));
            expect(
              await v.evaluate((v) => v.getAttribute('controlslist'))
            ).toBe('');
            await expectControls(page, { search: 'hidden' });
            await v.evaluate((v) => v.controlsList.add('search'));
            expect(
              await v.evaluate((v) => v.getAttribute('controlslist'))
            ).toBe('search');
            await expectControls(page, { search: 'shown' });
          });

          test('controlslist removeAttribute', async ({ page }) => {
            const v = await viewer(page, {
              controls: '',
              controlslist: 'noreload nozoom'
            });
            await expectControls(page, { zoom: 'hidden', reload: 'hidden' });

            await v.evaluate((v) => v.removeAttribute('controlslist'));
            expect(
              await v.evaluate((v) => v.hasAttribute('controlslist'))
            ).toBe(false);
            await expectControls(page, {
              zoom: 'shown',
              reload: 'shown',
              fullscreen: 'shown',
              scale: 'shown'
            });
            expect(await v.evaluate((v) => v.controlsList.length)).toBe(0);
          });

          test('controlsList .value, .add(), .replace() and .toggle()', async ({
            page
          }) => {
            const v = await viewer(page, { controls: '' });
            const list = () =>
              v.evaluate((v) => ({
                attribute: v.getAttribute('controlslist'),
                value: v.controlsList.value,
                length: v.controlsList.length
              }));
            expect((await list()).length).toBe(0);

            await v.evaluate((v) => (v.controlsList.value = 'nozoom nolayer'));
            expect(await list()).toEqual({
              attribute: 'nozoom nolayer',
              value: 'nozoom nolayer',
              length: 2
            });

            await v.evaluate((v) => v.controlsList.add('nofullscreen'));
            expect(await list()).toEqual({
              attribute: 'nozoom nolayer nofullscreen',
              value: 'nozoom nolayer nofullscreen',
              length: 3
            });

            await v.evaluate((v) =>
              v.controlsList.replace('nolayer', 'noreload')
            );
            expect(await list()).toEqual({
              attribute: 'nozoom noreload nofullscreen',
              value: 'nozoom noreload nofullscreen',
              length: 3
            });

            await v.evaluate((v) => v.controlsList.toggle('nofullscreen'));
            expect(await list()).toEqual({
              attribute: 'nozoom noreload',
              value: 'nozoom noreload',
              length: 2
            });
          });

          test('controlsList .contains(), .item(), .remove() and .supports()', async ({
            page
          }) => {
            const v = await viewer(page, {
              controls: '',
              controlslist: 'nozoom noreload'
            });
            const call = (method, ...args) =>
              v.evaluate(
                (v, [method, args]) => v.controlsList[method](...args),
                [method, args]
              );

            expect(await call('contains', 'nozoom')).toBe(true);
            expect(await call('contains', 'nofullscreen')).toBe(false);

            expect(await call('item', 1)).toBe('noreload');
            expect(await call('item', 2)).toBe(null);

            await call('remove', 'noreload');
            expect(
              await v.evaluate((v) => ({
                attribute: v.getAttribute('controlslist'),
                value: v.controlsList.value,
                length: v.controlsList.length
              }))
            ).toEqual({ attribute: 'nozoom', value: 'nozoom', length: 1 });

            for (const token of [
              'noreload',
              'nofullscreen',
              'nozoom',
              'nolayer',
              'noscale'
            ]) {
              expect(await call('supports', token), token).toBe(true);
            }
            // not supported, or invalid
            for (const token of ['nogeolocation', 'nocode']) {
              expect(await call('supports', token), token).toBe(false);
            }
          });
        });
      }
    );
  }

  test.describe(
    `${titles.describe} (custom projection)`,
    { tag: '@custom-projection' },
    () => {
      requires(test, 'custom-projection');

      test('controls disabled for empty custom projection map', async ({
        page
      }) => {
        const projection = await page.evaluate(async (is) => {
          let viewer;
          if (is === 'web-map') {
            viewer = document.createElement('map', { is });
            viewer.setAttribute('is', is);
          } else {
            viewer = document.createElement(is);
          }
          for (const [name, value] of Object.entries({
            lat: 45,
            lon: -90,
            zoom: 2,
            width: 600,
            height: 600
          })) {
            viewer.setAttribute(name, value);
          }
          // `template` is defined by the fixture page
          const name = viewer.defineCustomProjection(template);
          viewer.setAttribute('projection', 'basic');
          document.body.appendChild(viewer);
          viewer.projection = 'basic';
          await viewer.whenReady();
          return name;
        }, is);
        expect(projection).toBe('basic');

        // The map has no `controls` attribute, so its context menu's Toggle
        // Controls (T) item is disabled. (MapML.js's _toggleControls disables
        // it whenever controls are off; the projection is incidental.)
        await expect(
          page.locator('.mapml-contextmenu > button[data-id="toggle-controls"]')
        ).toBeDisabled();
      });
    }
  );
}
