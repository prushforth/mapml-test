// Build viewers and layers the way an author's script does, and read control
// state through the contract (docs/CONTRACT.md), for specs that give each test
// its own setup (docs/PLAN.md, D4).
import { expect } from '@playwright/test';

// The viewer elements a spec can build: how to create each one, and how to
// find it again. `<map is="web-map">` is a customized built-in, so it is
// created with `{ is }` and also given the `is` attribute, as upstream does,
// which is what its selector matches.
export const VIEWERS = {
  'mapml-viewer': { selector: 'mapml-viewer', nodeName: 'MAPML-VIEWER' },
  'web-map': { selector: 'map[is="web-map"]', nodeName: 'MAP' }
};
// Matches whichever viewer the page has.
export const ANY_VIEWER = Object.values(VIEWERS)
  .map((v) => v.selector)
  .join(', ');

/**
 * Create a viewer (`<mapml-viewer>`, or `<map is="web-map">` when `is` is
 * 'web-map') with document.createElement, set `attrs` in order, append it to
 * <body> and wait until it is ready. Returns its locator.
 */
export async function createViewer(
  page,
  attrs = {},
  { is = 'mapml-viewer' } = {}
) {
  await page.evaluate(
    async ({ attrs, is }) => {
      let viewer;
      if (is === 'web-map') {
        viewer = document.createElement('map', { is });
        viewer.setAttribute('is', is);
      } else {
        viewer = document.createElement(is);
      }
      for (const [name, value] of Object.entries(attrs)) {
        viewer.setAttribute(name, value);
      }
      document.body.appendChild(viewer);
      await viewer.whenReady();
    },
    { attrs, is }
  );
  return page.locator(VIEWERS[is].selector);
}

/**
 * Create a <map-layer> with document.createElement, set `attrs` in order and
 * append it to the (only) viewer. Waits for it to be ready unless
 * `wait` is false.
 */
export async function addLayer(page, attrs = {}, { wait = true } = {}) {
  await page.evaluate(
    async ({ attrs, wait, viewer }) => {
      const layer = document.createElement('map-layer');
      for (const [name, value] of Object.entries(attrs)) {
        layer.setAttribute(name, value);
      }
      document.querySelector(viewer).appendChild(layer);
      if (wait) await layer.whenReady();
    },
    { attrs, wait, viewer: ANY_VIEWER }
  );
  return page.locator('map-layer');
}

// Contract data-testids, by the short names specs use.
export const CONTROLS = {
  zoom: 'zoom-control',
  reload: 'reload-control',
  fullscreen: 'fullscreen-control',
  search: 'search-control',
  layer: 'layer-control',
  scale: 'scale-control',
  locate: 'locate-control',
  static: 'static-control',
  attribution: 'attribution-control'
};

/**
 * The state of the named controls, as a user would see them: 'shown' (visible),
 * 'hidden' (present but not visible) or 'absent' (no element, e.g. no room for
 * it). Visibility is Playwright's: a non-empty box and not `visibility:hidden`,
 * the same check as upstream's `toBeHidden()`. It is deliberately not any one
 * attribute: MapML.js, for one, hides a control by setting `hidden` on it and
 * on its children, and can leave the container without `hidden` while the
 * control is still invisible (docs/PLAN.md, D9).
 */
export async function controlState(page, names) {
  const state = {};
  for (const name of names) {
    const control = page.locator(`[data-testid="${CONTROLS[name]}"]`);
    const count = await control.count();
    if (count > 1) state[name] = `duplicated (${count})`;
    else if (count === 0) state[name] = 'absent';
    else state[name] = (await control.isVisible()) ? 'shown' : 'hidden';
  }
  return state;
}

/**
 * Wait (up to the expect timeout) for the named controls to reach `expected`,
 * e.g. `{ zoom: 'shown', layer: 'hidden' }`. A mismatch reports every named
 * control at once.
 */
export async function expectControls(page, expected) {
  await expect
    .poll(() => controlState(page, Object.keys(expected)))
    .toEqual(expected);
}
