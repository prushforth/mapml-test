// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/api/matchMedia/prefers-lang.test.js. The fixture has an
// English and a French layer, both checked; once the layers are ready it
// evaluates (prefers-lang: en) and (prefers-lang: fr) matchers and hides and
// unchecks the layer in the language not preferred. Upstream launched a new
// browser by hand for each locale (and never closed it); here each describe
// sets its locale through test.use and each test loads its own page (D4).
// Besides upstream's assertion that the other language's layer is hidden,
// each test checks the preferred layer stays shown and checked, and that the
// en and fr matchers agree with the locale (moved from the MapML-OpenLayers
// and MapML-MapLibre match-media tests). Fixture unchanged: it is CBMTILE, but
// what is tested is DOM state set by the fixture's script, not rendering, so
// it is not tagged and runs on every implementation.
import { test, expect } from '@playwright/test';

const LOCALES = {
  en: { locale: 'en-CA', other: 'fr' },
  fr: { locale: 'fr-CA', other: 'en' }
};

const matches = (page) =>
  page.evaluate(() => {
    const map = document.querySelector('mapml-viewer');
    return {
      en: map.matchMedia('(prefers-lang: en)').matches,
      fr: map.matchMedia('(prefers-lang: fr)').matches
    };
  });

test.describe('mapml-viewer matchMedia API tests', () => {
  for (const [lang, { locale, other }] of Object.entries(LOCALES)) {
    test.describe(`${locale} locale`, () => {
      test.use({ locale });

      test(`Test prefers-lang: ${lang} media feature`, async ({ page }) => {
        await page.goto('prefers-lang.html');
        const preferred = page.locator(`map-layer[lang=${lang}]`);
        const notPreferred = page.locator(`map-layer[lang=${other}]`);
        await expect(notPreferred).toHaveAttribute('hidden');
        await expect(notPreferred).not.toHaveAttribute('checked');
        await expect(preferred).not.toHaveAttribute('hidden');
        await expect(preferred).toHaveAttribute('checked');
        expect(await matches(page)).toEqual({
          en: lang === 'en',
          fr: lang === 'fr'
        });
      });
    });
  }
});
