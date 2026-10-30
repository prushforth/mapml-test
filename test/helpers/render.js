// Renderer-agnostic render probes for the cross-port suite.
//
// The ports disagree about which tiles they ask for, at what scale, and how
// they get them on screen (DOM <img> vs canvas), so a spec must not name any of
// that. Between them these probes cover what the upstream
// `.leaflet-tile-loaded` assertions were really after:
//
//   trackRequests - the layer is ACTIVE: it fetched its content, and it loaded
//   mapPixels     - something RENDERED: the map surface changed
//
// The tiles are the real ones under e2e/data/tiles, so a failing run's
// screenshot still looks like a map.
import { expect } from '@playwright/test';

/** Record every layer resource response. Install before any layer is added. */
export function trackRequests(page, match = /\.(png|jpe?g|webp|mapml)(\?|$)/) {
  const responses = [];
  page.on('response', (res) => {
    if (match.test(res.url())) responses.push([res.url(), res.status()]);
  });
  return {
    get urls() {
      return responses.map(([url]) => url);
    },
    get failed() {
      return responses
        .filter(([, status]) => status >= 400)
        .map(([url]) => url);
    },
    count: (re) => responses.filter(([url]) => re.test(url)).length,
    clear: () => responses.splice(0)
  };
}

/**
 * Screenshot of the middle of the map, clear of every control corner, as a
 * buffer to compare against another call. Not a snapshot assertion: the ports
 * never agree pixel for pixel, only on whether anything was drawn at all.
 */
export async function mapPixels(page, selector = 'mapml-viewer', size = 200) {
  const box = await page.locator(selector).boundingBox();
  return page.screenshot({
    clip: {
      x: box.x + (box.width - size) / 2,
      y: box.y + (box.height - size) / 2,
      width: size,
      height: size
    }
  });
}

/** Same, but waits for two identical captures, so a baseline is never mid-paint. */
export async function settledMapPixels(page, selector, size) {
  let previous = null;
  await expect
    .poll(async () => {
      const current = await mapPixels(page, selector, size);
      const settled = previous !== null && current.equals(previous);
      previous = current;
      return settled;
    })
    .toBe(true);
  return previous;
}
