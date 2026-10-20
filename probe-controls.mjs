// throwaway: what controls exist, in what order, and which are hidden
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173/test/fixtures/feature-index.html');
await page.waitForFunction(
  () =>
    !!document.querySelector('mapml-viewer')?.shadowRoot?.querySelector('.ol-overlaycontainer-stopevent')
);
await page.waitForTimeout(1000);
console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const v = document.querySelector('mapml-viewer');
      return {
        size: [v.offsetWidth, v.offsetHeight],
        controls: [
          ...v.renderRoot
            .querySelector('.ol-overlaycontainer-stopevent')
            .querySelectorAll(':scope > [data-mapml-corner]')
        ].map((c) => ({
          testid: c.dataset.testid,
          corner: c.dataset.mapmlCorner,
          hidden: c.hidden,
          top: c.style.top
        }))
      };
    }),
    null,
    1
  )
);
await browser.close();
