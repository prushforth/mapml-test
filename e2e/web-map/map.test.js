import { test, expect, chromium } from '@playwright/test';

test.describe('Playwright web-map Element Tests', () => {
  let page;
  let context;
  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    page =
      context.pages().find((page) => page.url() === 'about:blank') ||
      (await context.newPage());
    page = await context.newPage();
    await page.goto('map.html');
  });

  test.afterAll(async function () {
    await context.close();
  });

  test('Paste geojson Layer to map using ctrl+v', async () => {
    await page.click('body > textarea#copyGeoJSON');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');

    await page.click('body > map');
    await page.keyboard.press('Control+v');
    const layerCount = await page.$eval(
      'body > map',
      (map) => map.layers.length
    );
    expect(layerCount).toEqual(2);
  });

  test('Paste Link to map using ctrl+v', async () => {
    await page.click('body > textarea#copyLink');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');

    await page.click('body > map');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    const layerCount = await page.$eval(
      'body > map',
      (map) => map.layers.length
    );
    expect(layerCount).toEqual(3);
  });

  test('Paste Invalid text to map using ctrl+v', async () => {
    await page.click('body > textarea#invalidText');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');

    await page.click('body > map');
    await page.keyboard.press('Control+v');
    const layerCount = await page.$eval(
      'body > map',
      (map) => map.layers.length
    );
    expect(layerCount).toEqual(3);
  });

  test('Paste Invalid link to map using ctrl+v', async () => {
    await page.click('body > textarea#invalidLink');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');

    await page.click('body > map');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    const layerCount = await page.$eval(
      'body > map',
      (map) => map.layers.length
    );
    expect(layerCount).toEqual(3);
  });

  test('Paste links with GeoJSON content-type to map using ctrl+v', async () => {
    await page.click('body > textarea#linkGeoJSONContentType');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');

    await page.click('body > map');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    const layerCount = await page.$eval(
      'body > map',
      (map) => map.layers.length
    );
    expect(layerCount).toEqual(4);
  });

  test('Paste links with JSON content-type to map using ctrl+v', async () => {
    await page.click('body > textarea#linkJSONContentType');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');

    await page.click('body > map');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    const layerCount = await page.$eval(
      'body > map',
      (map) => map.layers.length
    );
    expect(layerCount).toEqual(5);
  });

  test('Paste links with GeoJSON extension to map using ctrl+v', async () => {
    await page.click('body > textarea#linkGeoJSONExt');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');

    await page.click('body > map');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    const layerCount = await page.$eval(
      'body > map',
      (map) => map.layers.length
    );
    expect(layerCount).toEqual(6);
  });

  test('Paste links with JSON extension to map using ctrl+v', async () => {
    await page.click('body > textarea#linkJSONExt');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');

    await page.click('body > map');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    const layerCount = await page.$eval(
      'body > map',
      (map) => map.layers.length
    );
    expect(layerCount).toEqual(7);
  });

  test('Press spacebar when focus is on map', async () => {
    //  scroll to the top
    await page.mouse.wheel(0, -1000);
    await page.waitForTimeout(300);
    await page.click('body > map');
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const currPos = await page.$eval('body > map', () => window.pageYOffset);
    expect(currPos).toEqual(0);
  });

  test('zoomToExtent fits the map to the given bounds', async () => {
    await page.$eval('body > map', (map) => map.zoomToExtent(-80, 43, -70, 48));
    await page.waitForTimeout(500);
    const result = await page.$eval('body > map', (map) => ({
      lat: map.lat,
      lon: map.lon,
      zoom: map.zoom
    }));
    // center should be approximately (45.5, -75) — the midpoint of the bbox
    expect(result.lat).toBeCloseTo(45.5, 0);
    expect(result.lon).toBeCloseTo(-75, 0);
    // zoom should have increased from the initial zoom level
    expect(result.zoom).toBeGreaterThan(1);
  });

  test.describe('Controls List search Attribute Tests', () => {
    test('controlslist=search shows search control', async () => {
      await page.$eval('body > map', (map) =>
        map.setAttribute('controlslist', 'search')
      );
      let searchControl = await page.locator('.mapml-search-control');
      await expect(searchControl).toBeVisible();
    });
    test('search control hidden when controlslist does not contain search', async () => {
      await page.$eval('body > map', (map) =>
        map.setAttribute('controlslist', 'noreload')
      );
      let searchControl = await page.locator('.mapml-search-control');
      await expect(searchControl).toBeHidden();
    });
    test('search control persists after toggling controls', async () => {
      await page.$eval('body > map', (map) =>
        map.setAttribute('controlslist', 'search')
      );
      // toggle controls off
      await page.click('body > map', { button: 'right' });
      await page.click('.mapml-contextmenu > button:nth-of-type(6)');
      // toggle controls on
      await page.click('body > map', { button: 'right' });
      await page.click('.mapml-contextmenu > button:nth-of-type(6)');

      let searchControl = await page.locator('.mapml-search-control');
      await expect(searchControl).toBeVisible();
    });
    test('controlsList property reflects search token', async () => {
      let contains = await page.$eval('body > map', (map) =>
        map.controlsList.contains('search')
      );
      expect(contains).toEqual(true);

      // clean up
      await page.$eval('body > map', (map) =>
        map.removeAttribute('controlslist')
      );
    });
    test('search control inserted between zoom and reload when controlslist="search" is added at runtime', async () => {
      // Regression test: previously the search button was created
      // lazily when controlslist="search" was observed, which meant
      // Leaflet's Control.addTo() appended its container at the END of
      // the topleft control corner (after fullscreen) instead of in
      // its correct slot between zoom and reload. The fix creates the
      // search button up-front in _createControls() and merely toggles
      // its visibility via controlslist, mirroring the reload control
      // pattern.

      // Make sure we start without controlslist.
      await page.$eval('body > map', (map) =>
        map.removeAttribute('controlslist')
      );
      await page.waitForTimeout(200);

      // Add controlslist="search" at runtime.
      await page.$eval('body > map', (map) =>
        map.setAttribute('controlslist', 'search')
      );
      await page.waitForTimeout(200);

      // Read the DOM order of the topleft control corner and find the
      // indexes of zoom, search and reload. The search button must
      // appear AFTER zoom and BEFORE reload.
      const order = await page.$eval('body > map', (map) => {
        // The Leaflet control container lives inside web-map's shadow
        // root; reach it via the live Leaflet map instance.
        const leafletContainer = map._map.getContainer();
        const corner = leafletContainer.querySelector(
          '.leaflet-control-container > .leaflet-top.leaflet-left'
        );
        if (!corner) return [];
        const result = [];
        for (let i = 0; i < corner.children.length; i++) {
          result.push(corner.children[i].className);
        }
        return result;
      });

      const zoomIndex = order.findIndex((cn) =>
        cn.includes('leaflet-control-zoom')
      );
      const searchIndex = order.findIndex((cn) =>
        cn.includes('mapml-search-control')
      );
      const reloadIndex = order.findIndex((cn) =>
        cn.includes('mapml-reload-button')
      );

      expect(zoomIndex).toBeGreaterThanOrEqual(0);
      expect(searchIndex).toBeGreaterThanOrEqual(0);
      expect(reloadIndex).toBeGreaterThanOrEqual(0);

      expect(searchIndex).toBeGreaterThan(zoomIndex);
      expect(searchIndex).toBeLessThan(reloadIndex);

      // clean up
      await page.$eval('body > map', (map) =>
        map.removeAttribute('controlslist')
      );
    });
  });
});
