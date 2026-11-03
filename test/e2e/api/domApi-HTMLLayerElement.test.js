// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/api/domApi-HTMLLayerElement.test.js. Upstream read each
// layer's name from Leaflet's MapLayer (`layer._layer.getName()`); here it is
// read where a user meets it: the layer's group in the layer control, which
// is named by the layer's name (aria-labelledby, as in MapML.js). The fixture
// sets the labels once the layers are ready, so the checks wait for them
// instead of sleeping.
import { test, expect } from '@playwright/test';

test.describe('HTMLLayerElement DOM API Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('domApi-HTMLLayerElement.html');
    await page
      .locator('mapml-viewer')
      .evaluate((viewer) => viewer.whenLayersReady());
  });

  test('Setting HTMLLayerElement.label sets the layer name per spec', async ({
    page
  }) => {
    // A layer's name comes from its <map-title> when it has one; otherwise
    // HTMLLayerElement.label sets it.
    const expected = {
      '#remote-with-title': 'MapML author-controlled name - unsettable',
      '#remote-no-title': 'Bedtime For Bonzo',
      '#local-with-title':
        'Layer name set via local map-title element - unsettable via HTMLLayerelement.label',
      '#local-no-title': 'Go ahead, make my day!'
    };
    const layerControl = page.getByTestId('layer-control');
    await layerControl.hover();
    for (const [id, name] of Object.entries(expected)) {
      await expect
        .poll(() => page.$eval(id, (layer) => layer.label), { message: id })
        .toEqual(name);
      await expect(
        layerControl.getByRole('group', { name, exact: true }),
        id
      ).toBeVisible();
    }
  });

  // From MapML-OpenLayers test/domApi-HTMLLayerElement.test.js: a layer named
  // by its <map-title> never shows the label it was given, neither the label
  // attribute nor one set later through HTMLLayerElement.label.
  test('the layer control shows the author-controlled titles, not the label attribute', async ({
    page
  }) => {
    const layerControl = page.getByTestId('layer-control');
    await layerControl.hover();
    // Wait until the fixture has set the labels (the settable layers' names
    // change), so the absences below aren't checked too early.
    await expect(
      layerControl.getByRole('group', { name: 'Go ahead, make my day!' })
    ).toBeVisible();
    for (const rejected of [
      'This should not appear in layer control',
      'Unforsettable in every way',
      'No dice, buddy!'
    ]) {
      await expect(
        layerControl.getByRole('group', { name: rejected, exact: true })
      ).toHaveCount(0);
    }
  });
  // add other tests here for HTMLLayerElement
});
