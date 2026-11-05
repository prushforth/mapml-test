// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/core/announceMovement.test.js. Upstream's scenario runs
// unchanged in CBMTILE on upstream's fixtures, and again in OSMTILE on
// counterpart fixtures (D3). Each test loads its own page (D4): the second
// test used to start where the first left off, so it now replays those moves.
// The live region is found by the class MapML.js gives it
// (docs/CONTRACT.md), not as the first <output> in a shadow root, and every
// announcement is recorded, so a key press is followed until the map settles
// instead of for a fixed second, and transient messages (overwritten when
// the map bounces back into bounds) are checked deterministically.
import { test, expect } from '@playwright/test';
import { requires } from '../../helpers/capabilities.js';

const OUTPUT = 'output.mapml-screen-reader-output:not(.mapml-feature-index)';

// Per projection: the fixture for each viewer element, and the minimum zoom
// of its layer (and so of the map).
const PROJECTIONS = {
  CBMTILE: {
    files: { 'web-map': 'web-map.html', 'mapml-viewer': 'mapml-viewer.html' },
    minZoom: 0
  },
  OSMTILE: {
    files: {
      'web-map': 'announceMovementWebMap.html',
      'mapml-viewer': 'announceMovementMapmlViewer.html'
    },
    minZoom: 2
  }
};

const AM_WEST = 'Reached west bound, panning west disabled';
const AM_ZOOMED_OUT = 'Zoomed out of bounds, returning to';
const zoomLevel = (z) => `zoom level ${z}`;
const atMinZoom = (z) =>
  `At minimum zoom level, zoom out disabled ${zoomLevel(z)}`;
// An announcement that the map has come to rest (in bounds).
const SETTLED = /zoom level \d+$/;

// Load the page, wait for its layer, and focus the map as upstream does.
async function open(page, file) {
  await page.goto(file);
  await page.getByTestId('testlayer').evaluate((l) => l.whenReady());
  await page.keyboard.press('Tab');
  // Record every text the live region takes from now on.
  await page.locator(OUTPUT).evaluate((out) => {
    const log = [];
    new MutationObserver(() => log.push(out.textContent)).observe(out, {
      childList: true,
      characterData: true,
      subtree: true
    });
    window.announcements = log;
  });
}

// Press a key and wait for the map to settle; returns what was announced.
async function press(page, key) {
  await page.evaluate(() => (window.announcements.length = 0));
  await page.keyboard.press(key);
  await expect
    .poll(() => page.evaluate(() => window.announcements.at(-1) ?? ''))
    .toMatch(SETTLED);
  return page.evaluate(() => window.announcements);
}

const lon = (page) =>
  page.getByTestId('testviewer').evaluate((v) => parseFloat(v.lon));

for (const [projection, { files, minZoom }] of Object.entries(PROJECTIONS)) {
  test.describe(
    `Announce movement test (${projection})`,
    { tag: `@${projection}` },
    () => {
      requires(test, projection);

      for (const file of Object.values(files)) {
        test(`${file}: The live region is a polite status`, async ({
          page
        }) => {
          await open(page, file);
          const output = page.locator(OUTPUT);
          await expect(output).toHaveAttribute('role', 'status');
          await expect(output).toHaveAttribute('aria-live', 'polite');
          await expect(output).toHaveAttribute('aria-atomic', 'true');
        });

        test(`${file}: Output values are correct during regular movement`, async ({
          page
        }) => {
          await open(page, file);
          expect((await press(page, 'ArrowUp')).at(-1)).toEqual(
            zoomLevel(minZoom)
          );

          await press(page, 'ArrowLeft');
          expect((await press(page, 'ArrowLeft')).at(-1)).toEqual(
            zoomLevel(minZoom)
          );

          expect((await press(page, 'Equal')).at(-1)).toEqual(
            zoomLevel(minZoom + 1)
          );

          expect((await press(page, 'Minus')).at(-1)).toEqual(
            atMinZoom(minZoom)
          );

          // testing + button
          await page.keyboard.press('Tab');
          await expect(page.getByTestId('zoom-in-button')).toBeFocused();
          expect((await press(page, 'Enter')).at(-1)).toEqual(
            zoomLevel(minZoom + 1)
          );
        });

        test(`${file}: Output values are correct at bounds and bounces back`, async ({
          page
        }) => {
          // Where upstream's first test left the map (D4).
          await open(page, file);
          for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowLeft', 'Equal']) {
            await press(page, key);
          }

          //Zoom out to min layer bound
          expect((await press(page, 'Minus')).at(-1)).toEqual(
            atMinZoom(minZoom)
          );

          //Pan out of west bounds, expect the map to bounce back
          const said = [];
          for (let i = 0; i < 4; i++) {
            const before = await lon(page);
            const log = await press(page, 'ArrowLeft');
            said.push(...log);
            if (log.includes(AM_WEST)) {
              // It went back to where it was before the key press.
              expect(await lon(page)).toBeCloseTo(before, 4);
            }
            expect(log.at(-1)).toEqual(zoomLevel(minZoom));
          }
          expect(said).toContain(AM_WEST);

          //Zoom in out of bounds, expect the map to zoom back
          const log = await press(page, 'Equal');
          expect(log).toContain(AM_ZOOMED_OUT);
          expect(log.at(-1)).toEqual(zoomLevel(minZoom));
          await expect(page.getByTestId('testviewer')).toHaveAttribute(
            'zoom',
            String(minZoom)
          );
        });
      }
    }
  );
}
