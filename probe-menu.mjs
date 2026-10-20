// throwaway: context menu child order + disabled state
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173/domApi-mapml-viewer.html');
await page.evaluate(async () => {
  const v = document.createElement('mapml-viewer');
  for (const [k, val] of Object.entries({
    lat: 45, lon: -90, zoom: 2, width: '600', height: '600', projection: 'CBMTILE'
  })) v.setAttribute(k, val);
  document.body.appendChild(v);
  await v.whenReady();
});
await page.waitForTimeout(500);
console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const menu = document
        .querySelector('mapml-viewer')
        .renderRoot.querySelector('.mapml-contextmenu');
      return [...menu.children].map((c, i) => ({
        nth: i + 1,
        tag: c.tagName.toLowerCase(),
        dataId: c.dataset.id ?? null,
        disabled: c.disabled ?? null
      }));
    }),
    null,
    0
  ).replace(/},/g, '},\n')
);
await browser.close();
