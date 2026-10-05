import { test, expect, chromium } from '@playwright/test';

/**
 * Regression suite for the map-link attribution/legend XSS class.
 *
 * A malicious MapML document fetched via `<map-layer src>` (or, as
 * here, authored inline for reproducibility) can carry:
 *
 *   - `<map-link rel="license">` whose `title` / `href` attributes
 *     break out of the anchor MapML.js used to build via string
 *     concatenation into HTML, leading to `<img onerror>` XSS on
 *     layer check;
 *   - `<map-link rel="legend" href="javascript:…">` which used to
 *     be stored verbatim in the legend anchor's href.
 *
 * Both classes are closed by:
 *   1. `Util.sanitizeUrl` scheme-allowlisting (`http:` / `https:` /
 *      relative-that-resolves-to-those) before the URL is stored on
 *      the layer or rendered.
 *   2. Building the license anchor with `document.createElement` +
 *      property setters so the DOM API escapes attribute values.
 *   3. `noopener noreferrer` on the resulting anchors.
 *
 * A separate regression: several layer-control text sinks used
 * `innerHTML` for author-supplied strings (map-title, map-extent
 * label, map-select option body). Those are now `textContent`.
 */
test.describe('map-link security: XSS via <map-link rel=license|legend>', () => {
  let context;
  let page;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('');
    page =
      context.pages().find((p) => p.url() === 'about:blank') ||
      (await context.newPage());
    await page.goto('map-link-security.html', { waitUntil: 'networkidle' });
    // Give the viewer a beat to attach the malicious layers to the
    // attribution / layer control before we probe.
    await page.waitForSelector('mapml-viewer');
    await page.waitForFunction(() => {
      const v = document.querySelector('mapml-viewer');
      return v && v._map && v._map.attributionControl;
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('malicious license title/href does not execute on layer check', async () => {
    const pwn = await page.evaluate(() => window.__pwn);
    expect(pwn).toBe(0);
  });

  test('malicious license title/href does not execute on attribution click', async () => {
    // Fire a synthetic click on every anchor inside the attribution
    // control, but preventDefault so the browser does not actually
    // navigate away (which would tear down the page and defeat the
    // sentinel check). The pre-patch payload injected an <img onerror>
    // AND an onclick handler; both must remain inert post-patch.
    const pwn = await page.evaluate(() => {
      const container =
        document.querySelector('mapml-viewer')._map.attributionControl
          ._container;
      container.addEventListener('click', (e) => e.preventDefault(), {
        capture: true
      });
      container.querySelectorAll('a').forEach((a) => {
        a.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        a.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true })
        );
      });
      return window.__pwn;
    });
    expect(pwn).toBe(0);
  });

  test('javascript: legend href is dropped, layer row renders as plain text', async () => {
    // The `js_legend` layer's `_legendUrl` must be falsy after
    // Util.sanitizeUrl drops the `javascript:` scheme.
    const legendUrl = await page.evaluate(() => {
      const viewer = document.querySelector('mapml-viewer');
      const layerEl = viewer.querySelector('[data-testid="js_legend"]');
      return layerEl && layerEl._layer && layerEl._layer._legendUrl;
    });
    expect(legendUrl).toBeFalsy();

    // And there must be no `<a href^="javascript:">` in the layer
    // control anywhere.
    const anchorCount = await page.evaluate(() => {
      const viewer = document.querySelector('mapml-viewer');
      const controls = viewer.shadowRoot
        ? viewer.shadowRoot.querySelectorAll('a[href^="javascript:" i]')
        : document.querySelectorAll('a[href^="javascript:" i]');
      return controls.length;
    });
    expect(anchorCount).toBe(0);
  });

  test('legitimate https license still renders as an anchor', async () => {
    // The `good_license` layer must produce a proper anchor in the
    // attribution control, with the sanitised href and escaped title.
    // The good_license layer is initialised asynchronously; on slower
    // CI runners the anchor may not have been added to the attribution
    // control by the time the earlier tests finish, so wait for it
    // explicitly before probing.
    await page.waitForFunction(() => {
      const viewer = document.querySelector('mapml-viewer');
      const container =
        viewer && viewer._map && viewer._map.attributionControl
          ? viewer._map.attributionControl._container
          : null;
      if (!container) return false;
      return Array.from(container.querySelectorAll('a')).some(
        (a) => a.textContent && a.textContent.includes('Terms of service')
      );
    });
    const legit = await page.evaluate(() => {
      const container =
        document.querySelector('mapml-viewer')._map.attributionControl
          ._container;
      const anchors = Array.from(container.querySelectorAll('a')).filter(
        (a) => a.textContent && a.textContent.includes('Terms of service')
      );
      const a = anchors[0];
      if (!a) return null;
      return {
        href: a.getAttribute('href'),
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel'),
        title: a.getAttribute('title')
      };
    });
    expect(legit).not.toBeNull();
    expect(legit.href).toBe('https://example.com/tos');
    expect(legit.target).toBe('_blank');
    expect((legit.rel || '').split(/\s+/)).toEqual(
      expect.arrayContaining(['noopener', 'noreferrer'])
    );
    expect(legit.title).toBe('Terms of service');
  });

  test('final sentinel: nothing executed at any point', async () => {
    const pwn = await page.evaluate(() => window.__pwn);
    expect(pwn).toBe(0);
  });
});

/**
 * Regression suite for the paste XSS class in `Util._pasteLayer` and
 * `Util.geojson2mapml`.
 *
 * A victim who pastes attacker-supplied clipboard/drag-drop content
 * (ctrl+v, drag/drop, or the context-menu Paste item, all of which
 * funnel through `Util._pasteLayer`) must not be able to inject
 * executable markup into the page:
 *
 *   - URL paste: `Util._pasteLayer` used to string-concatenate the
 *     pasted URL into a `<map-layer src="…">` HTML string. A pasted
 *     URL such as `https://host/"><img src=x onerror=…>` parses as a
 *     valid URL yet breaks out of the `src="…"` attribute when
 *     inserted via `insertAdjacentHTML`. Now the URL is
 *     scheme-allowlisted with `Util.sanitizeUrl` and the element is
 *     built with DOM APIs that escape attribute values.
 *   - GeoJSON paste: a pasted GeoJSON Feature whose `id` (or caption
 *     property) is `<img src=x onerror=…>` used to be assigned to the
 *     `<map-featurecaption>` via `innerHTML`. Now it is `textContent`.
 */
test.describe('paste security: XSS via Util._pasteLayer / geojson2mapml', () => {
  let context;
  let page;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('');
    page =
      context.pages().find((p) => p.url() === 'about:blank') ||
      (await context.newPage());
    await page.goto('map-link-security.html');
    await page.waitForSelector('mapml-viewer');
    await page.waitForFunction(() => {
      const v = document.querySelector('mapml-viewer');
      return v && v._map;
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('pasted URL cannot break out of the map-layer src attribute', async () => {
    await page.evaluate(async () => {
      const viewer = document.querySelector('mapml-viewer');
      // Same-origin URL so the internal fetch resolves (404 is fine —
      // fetch resolves for any HTTP status) and control reaches the
      // `<map-layer src>` branch. The payload rides in the path.
      const payload =
        location.origin +
        '/does-not-exist"><img src=x onerror="window.__mark()">';
      await M.Util._pasteLayer(viewer, payload);
    });
    // Give any (regressed) injected <img> a chance to fire onerror.
    await page.waitForTimeout(300);

    const pwn = await page.evaluate(() => window.__pwn);
    expect(pwn).toBe(0);

    // No stray <img> injected into the viewer's light DOM, and any
    // map-layer that was appended must carry an http(s) src only.
    const result = await page.evaluate(() => {
      const viewer = document.querySelector('mapml-viewer');
      const imgs = viewer.querySelectorAll('img').length;
      const badSrc = Array.from(viewer.querySelectorAll('map-layer[src]')).some(
        (l) => !/^https?:/i.test(l.getAttribute('src') || '')
      );
      return { imgs, badSrc };
    });
    expect(result.imgs).toBe(0);
    expect(result.badSrc).toBe(false);
  });

  test('pasted URL with a javascript: scheme is dropped', async () => {
    const appended = await page.evaluate(async () => {
      const viewer = document.querySelector('mapml-viewer');
      const before = viewer.querySelectorAll('map-layer[src]').length;
      await M.Util._pasteLayer(
        viewer,
        'javascript:window.__mark()//https://example.com/x.json'
      );
      const after = viewer.querySelectorAll('map-layer[src]').length;
      return { before, after };
    });
    await page.waitForTimeout(100);
    const pwn = await page.evaluate(() => window.__pwn);
    expect(pwn).toBe(0);
    // Nothing with a javascript: src was appended.
    expect(appended.after).toBe(appended.before);
  });

  test('pasted GeoJSON id cannot inject markup into the featurecaption', async () => {
    await page.evaluate(() => {
      const viewer = document.querySelector('mapml-viewer');
      // Route through the same public entry point paste uses for
      // GeoJSON text (`mapEl.geojson2mapml(JSON.parse(text))`).
      viewer.geojson2mapml({
        type: 'Feature',
        id: '<img src=x onerror="window.__mark()">',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {}
      });
    });
    await page.waitForTimeout(300);

    const pwn = await page.evaluate(() => window.__pwn);
    expect(pwn).toBe(0);

    // The caption element must contain the payload as inert text, not
    // as a parsed <img> element.
    const caption = await page.evaluate(() => {
      const viewer = document.querySelector('mapml-viewer');
      const cap = viewer.querySelector('map-feature > map-featurecaption');
      if (!cap) return null;
      return { hasImg: !!cap.querySelector('img'), text: cap.textContent };
    });
    expect(caption).not.toBeNull();
    expect(caption.hasImg).toBe(false);
    expect(caption.text).toContain('<img');
  });

  test('final sentinel: no paste payload executed', async () => {
    const pwn = await page.evaluate(() => window.__pwn);
    expect(pwn).toBe(0);
  });
});

/**
 * Attack surface 4: `<map-a href="javascript:…">` inside a feature.
 *
 * A <map-feature> can be pasted/loaded verbatim, and its geometry may
 * wrap coordinates in a `<map-a href>`. Clicking the rendered feature
 * calls `Util._handleLink`, whose branches navigate with the raw href
 * — `window.location.href = link.url` (target `_top`), `window.open`
 * (target `_blank`, text/html), or a `<map-layer src>`. A
 * `javascript:` href therefore executes on click. The guard resolves
 * the href against the document base (relative and #hash links pass)
 * and rejects any non-http(s) scheme before navigating.
 */
test.describe('map-a security: XSS via Util._handleLink', () => {
  let context;
  let page;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('');
    page =
      context.pages().find((p) => p.url() === 'about:blank') ||
      (await context.newPage());
    await page.goto('map-link-security.html');
    await page.waitForSelector('mapml-viewer');
    await page.waitForFunction(() => {
      const v = document.querySelector('mapml-viewer');
      return v && v._map;
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('javascript: href is dropped at the _top (window.location) sink', async () => {
    await page.evaluate(() => {
      const viewer = document.querySelector('mapml-viewer');
      // type=text/html + non-_blank target routes to the `_top` branch,
      // whose sink is `window.location.href = link.url`.
      M.Util._handleLink(
        { url: 'javascript:window.__mark()//', type: 'text/html' },
        { _map: viewer._map }
      );
    });
    await page.waitForTimeout(200);
    const pwn = await page.evaluate(() => window.__pwn);
    expect(pwn).toBe(0);
    // The page must not have navigated to the javascript: URL.
    expect(page.url()).toContain('map-link-security.html');
  });

  test('javascript: href is dropped at the _blank (window.open) sink', async () => {
    const opened = await page.evaluate(() => {
      const viewer = document.querySelector('mapml-viewer');
      let openedUrl = null;
      const realOpen = window.open;
      window.open = (u) => {
        openedUrl = u;
        return null;
      };
      try {
        M.Util._handleLink(
          {
            url: 'javascript:window.__mark()//',
            type: 'text/html',
            target: '_blank'
          },
          { _map: viewer._map }
        );
      } finally {
        window.open = realOpen;
      }
      return openedUrl;
    });
    await page.waitForTimeout(200);
    const pwn = await page.evaluate(() => window.__pwn);
    expect(pwn).toBe(0);
    // window.open must never have been reached with the payload.
    expect(opened).toBeNull();
  });

  test('legitimate #hash pan link is not blocked by the scheme guard', async () => {
    const rejected = await page.evaluate(() => {
      const viewer = document.querySelector('mapml-viewer');
      const warns = [];
      const realWarn = console.warn;
      console.warn = (...a) => {
        warns.push(a.join(' '));
        realWarn.apply(console, a);
      };
      try {
        // A pan-only hash link: no scheme, resolves to http(s) against
        // the document base, so the guard must let it through.
        M.Util._handleLink({ url: '#5,-70,50' }, { _map: viewer._map });
      } finally {
        console.warn = realWarn;
      }
      return warns.some((w) => w.includes('unsafe URL'));
    });
    // The guard did not reject the legitimate relative/hash link.
    expect(rejected).toBe(false);
  });

  test('final sentinel: no map-a payload executed', async () => {
    const pwn = await page.evaluate(() => window.__pwn);
    expect(pwn).toBe(0);
  });
});
