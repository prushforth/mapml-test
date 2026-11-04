// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/api/matchMedia/prefers-color-scheme.test.js. The fixture
// writes 'Prefers dark' or 'Prefers light' into #preferred-color from a
// (prefers-color-scheme: dark) matcher on DOMContentLoaded. Upstream shared
// one page from a persistent context across the file (and opened two pages);
// here each test emulates its colour scheme on its own page before loading
// the fixture (D4). Besides upstream's assertions it checks that the light
// and dark matchers agree, and that a matcher fires change when the colour
// scheme flips (moved from the MapML-OpenLayers and MapML-MapLibre
// match-media tests). Fixture unchanged.
import { test, expect } from '@playwright/test';

test.describe('matchMedia prefers-color-scheme tests', () => {
  const matches = (page) =>
    page.evaluate(() => {
      const map = document.querySelector('mapml-viewer');
      return {
        light: map.matchMedia('(prefers-color-scheme: light)').matches,
        dark: map.matchMedia('(prefers-color-scheme: dark)').matches
      };
    });

  test('matchMedia recognizes light scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('prefers-color-scheme.html');
    await expect(page.locator('#preferred-color')).toHaveText('Prefers light');
    expect(await matches(page)).toEqual({ light: true, dark: false });
  });

  test('matchMedia recognizes dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('prefers-color-scheme.html');
    await expect(page.locator('#preferred-color')).toHaveText('Prefers dark');
    expect(await matches(page)).toEqual({ light: false, dark: true });
  });

  test('matchMedia fires change when the color scheme flips', async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('prefers-color-scheme.html');
    await page.evaluate(() => {
      const mql = document
        .querySelector('mapml-viewer')
        .matchMedia('(prefers-color-scheme: dark)');
      window.colorSchemeChange = { count: 0, matches: mql.matches };
      mql.addEventListener('change', () => {
        window.colorSchemeChange.count++;
        window.colorSchemeChange.matches = mql.matches;
      });
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect
      .poll(() => page.evaluate(() => window.colorSchemeChange))
      .toEqual({ count: 1, matches: true });
  });
});
