import { test, expect, chromium } from '@playwright/test';

test.describe('controlslist="static" control', () => {
  let page;
  let context;
  test.beforeAll(async function () {
    context = await chromium.launchPersistentContext('');
    page =
      context.pages().find((page) => page.url() === 'about:blank') ||
      (await context.newPage());
    await page.goto('staticControl.html');
  });
  test.afterAll(async function () {
    await context.close();
  });

  test('Static button is shown when controlslist includes "static"', async () => {
    // reset to the opted-in state
    await page.$eval(
      'body > mapml-viewer',
      (viewer) => (viewer.controlsList = 'static')
    );
    let hidden = await page.$eval('.mapml-static-button', (btn) =>
      btn.hasAttribute('hidden')
    );
    expect(hidden).toBe(false);
  });

  test('Static button is hidden when controlslist omits "static"', async () => {
    await page.$eval(
      'body > mapml-viewer',
      (viewer) => (viewer.controlsList = '')
    );
    let hidden = await page.$eval('.mapml-static-button', (btn) =>
      btn.hasAttribute('hidden')
    );
    expect(hidden).toBe(true);
  });

  test('Clicking the button toggles the static attribute and interaction', async () => {
    await page.$eval(
      'body > mapml-viewer',
      (viewer) => (viewer.controlsList = 'static')
    );

    // starts non-static
    let isStatic = await page.$eval('body > mapml-viewer', (viewer) =>
      viewer.hasAttribute('static')
    );
    expect(isStatic).toBe(false);

    await page.click('.mapml-static-button');

    isStatic = await page.$eval('body > mapml-viewer', (viewer) =>
      viewer.hasAttribute('static')
    );
    let dragging = await page.$eval(
      'body > mapml-viewer',
      (viewer) => viewer._map.dragging._enabled
    );
    let pressed = await page.$eval('.mapml-static-button', (btn) =>
      btn.getAttribute('aria-pressed')
    );
    expect(isStatic).toBe(true);
    expect(dragging).toBe(false);
    expect(pressed).toBe('true');

    await page.click('.mapml-static-button');

    isStatic = await page.$eval('body > mapml-viewer', (viewer) =>
      viewer.hasAttribute('static')
    );
    dragging = await page.$eval(
      'body > mapml-viewer',
      (viewer) => viewer._map.dragging._enabled
    );
    pressed = await page.$eval('.mapml-static-button', (btn) =>
      btn.getAttribute('aria-pressed')
    );
    expect(isStatic).toBe(false);
    expect(dragging).toBe(true);
    expect(pressed).toBe('false');
  });

  test('Button pressed state reflects programmatic attribute changes', async () => {
    let pressed = await page.$eval('.mapml-static-button', (btn) =>
      btn.getAttribute('aria-pressed')
    );
    expect(pressed).toBe('false');

    await page.$eval('body > mapml-viewer', (viewer) => (viewer.static = true));

    pressed = await page.$eval('.mapml-static-button', (btn) =>
      btn.getAttribute('aria-pressed')
    );
    expect(pressed).toBe('true');

    // restore
    await page.$eval(
      'body > mapml-viewer',
      (viewer) => (viewer.static = false)
    );
  });
});
