// throwaway: eyeball what the domApi fixture actually renders
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
const seen = [];
page.on('response', (r) => /\.png/.test(r.url()) && seen.push([r.status(), r.url()]));
await page.goto('http://localhost:5173/domApi-mapml-viewer.html');
await page.evaluate(async () => {
  const v = document.createElement('mapml-viewer');
  for (const [k, val] of Object.entries({
    lat: 45,
    lon: -90,
    zoom: 2,
    controls: '',
    width: '600',
    height: '600',
    projection: 'CBMTILE'
  }))
    v.setAttribute(k, val);
  document.body.appendChild(v);
  const l = document.createElement('map-layer');
  l.setAttribute('label', 'CBMT');
  l.setAttribute('src', 'tiles/cbmt/cbmt.mapml');
  l.setAttribute('checked', '');
  v.appendChild(l);
  await l.whenReady();
});
await page.waitForTimeout(2000);
console.log(seen.map(([s, u]) => `${s} ${u}`).join('\n'));
await page.locator('mapml-viewer').screenshot({ path: '/tmp/domapi-map.png' });
await browser.close();
