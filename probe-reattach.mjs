// throwaway: what does detach/re-attach actually refetch?
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
let seen = [];
page.on('response', (r) => seen.push(`${r.status()} ${r.url().replace('http://localhost:5173', '')}`));
await page.goto('http://localhost:5173/domApi-mapml-viewer.html');
await page.evaluate(async () => {
  const v = document.createElement('mapml-viewer');
  for (const [k, val] of Object.entries({
    lat: 45, lon: -90, zoom: 2, controls: '',
    width: '600', height: '600', projection: 'CBMTILE'
  })) v.setAttribute(k, val);
  document.body.appendChild(v);
  const l = document.createElement('map-layer');
  l.setAttribute('label', 'CBMT');
  l.setAttribute('src', 'tiles/cbmt/cbmt.mapml');
  l.setAttribute('checked', '');
  v.appendChild(l);
  await l.whenReady();
});
await page.waitForTimeout(2000);
seen = [];
await page.locator('mapml-viewer').screenshot({ path: '/tmp/reattach-before.png' });
await page.evaluate(async () => {
  const m = document.querySelector('mapml-viewer');
  document.body.removeChild(m);
  document.body.appendChild(m);
  await m.querySelector('map-layer').whenReady();
});
await page.waitForTimeout(2000);
await page.locator('mapml-viewer').screenshot({ path: '/tmp/reattach-after.png' });
console.log('--- requests after detach/re-attach ---');
console.log(seen.filter((s) => !s.includes('/node_modules/') && !s.includes('/src/')).join('\n') || '(none)');
await browser.close();
