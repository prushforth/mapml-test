// throwaway: inspect the viewer shadow root after detach/re-attach
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173/domApi-mapml-viewer.html');
const probe = () =>
  page.evaluate(() => {
    const v = document.querySelector('mapml-viewer');
    const sr = v.renderRoot;
    return {
      shadowChildren: [...sr.children].map(
        (c) => c.tagName.toLowerCase() + (c.className ? '.' + c.className : '')
      ),
      containers: [...sr.querySelectorAll('.mapml-container')].map((c) => {
        const r = c.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          height: Math.round(r.height),
          hasViewport: !!c.querySelector('.ol-viewport'),
          canvases: c.querySelectorAll('canvas').length
        };
      }),
      targetIsLast: v.map?.getTargetElement() === [...sr.querySelectorAll('.mapml-container')].pop()
    };
  });

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
await page.waitForTimeout(1500);
console.log('BEFORE', JSON.stringify(await probe(), null, 1));

await page.evaluate(async () => {
  const m = document.querySelector('mapml-viewer');
  document.body.removeChild(m);
  document.body.appendChild(m);
  await m.querySelector('map-layer').whenReady();
});
await page.waitForTimeout(1500);
console.log('AFTER', JSON.stringify(await probe(), null, 1));
await browser.close();
