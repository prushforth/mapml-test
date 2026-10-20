// throwaway: dump the requests a map-layer makes in the domApi fixture
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
const seen = [];
page.on('response', (r) => seen.push([r.status(), r.url()]));
await page.goto('http://localhost:5173/domApi-mapml-viewer.html');
await page.evaluate(async () => {
  const v = document.createElement('mapml-viewer');
  v.setAttribute('lat', 45);
  v.setAttribute('lon', -90);
  v.setAttribute('zoom', 2);
  v.setAttribute('controls', '');
  v.setAttribute('width', '600');
  v.setAttribute('height', '600');
  v.setAttribute('projection', 'CBMTILE');
  document.body.appendChild(v);
  const l = document.createElement('map-layer');
  l.setAttribute('label', 'CBMT');
  l.setAttribute('src', 'tiles/cbmt/cbmt.mapml');
  l.setAttribute('checked', '');
  v.appendChild(l);
  await l.whenReady();
});
await page.waitForTimeout(3000);
for (const [s, u] of seen) if (!u.includes('/src/') && !u.includes('/@')) console.log(s, u);
await browser.close();
