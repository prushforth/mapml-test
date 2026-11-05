# The test contract

What every MapML implementation must provide so that one suite can test them
all without knowing which one it is testing ([PLAN.md](PLAN.md), D2). It lives
here, in mapml-test, and nowhere else; the implementations implement it on
their `cross-port-tests` branches.

When a spec needs something that isn't here, add it here in the same change
that implements it in every implementation, committed as
`cross-port: contract — <what>`.

## Controls: `data-testid`

Each control's outermost element carries a `data-testid`. Specs judge a
control by whether it is **visible** (Playwright's visibility: a non-empty box,
not `visibility: hidden`), never by a particular attribute; see
`controlState` in [test/helpers/viewer.js](../test/helpers/viewer.js). How an
implementation hides a control is its own business.

| `data-testid`           | Control                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `zoom-control`          | zoom in/out                                                                                        |
| `zoom-in-button`        | the zoom-in button, inside `zoom-control`                                                          |
| `zoom-out-button`       | the zoom-out button, inside `zoom-control`                                                         |
| `reload-control`        | reload (back to the initial view)                                                                  |
| `fullscreen-control`    | fullscreen toggle                                                                                  |
| `search-control`        | search (opt-in: `controlslist="search"`)                                                           |
| `layer-control`         | layer control                                                                                      |
| `scale-control`         | scale bar                                                                                          |
| `locate-control`        | geolocation (opt-in: `controlslist="geolocation"`)                                                 |
| `static-control`        | static toggle (opt-in: `controlslist="static"`)                                                    |
| `attribution-control`   | attribution                                                                                        |
| `feature-index-control` | feature index overlay toggle (opt-in: `controlslist="featureindex"`; MapML.js has no such control) |

### Default object size

A `<mapml-viewer>` with no `width`/`height` attributes and no author CSS size
is 300×150 CSS px (`display: inline-block`, `contain: layout size`, with a
2px inset border that `frameborder="0"` removes), like `<canvas>` or
`<iframe>`. `<map is="web-map">` likewise. The control size budget below
depends on it. Fixtures that want a full-window map must therefore say so in
both dimensions (`width: 100%` as well as `height`).

### Control lifecycle

As in MapML.js (`_createControls`, `_toggleControls`):

- A map creates its controls once. Whether one exists depends only on the
  space available: at the default 300×150 size there is room for zoom and
  reload, but not fullscreen. `controls`, `controlslist` and layer changes
  never create or remove a control.
- `controls` and `controlslist` only show or hide controls. (MapML.js does
  it by setting `hidden` on the control element and on each of its children.
  Its layer control also sets `hidden` on the element alone while it has no
  layers, and clears it when a layer arrives even if controls are off; the
  control stays invisible because its children are still hidden. Hence
  "judge by visibility".)
- The layer control is hidden while it has no layers to list, even when
  `controls` is on.

| Implementation   | Conforms?                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| MapML.js         | yes (the reference)                                                                                                                                   |
| MapML-OpenLayers | yes                                                                                                                                                   |
| MapML-MapLibre   | yes, since its `cross-port: api/domApi-mapml-viewer` commit (it used to remove and re-create controls, and had no size budget or default object size) |

## Context menus: `data-id`

Each menu item is a `<button>` with a `data-id`. The menus keep MapML.js's
class names: `.mapml-contextmenu` (map), `.mapml-layer-menu` (layer),
`.mapml-extent-menu` (extent), and `#mapml-copy-submenu`.

- **Map menu:** `back`, `forward`, `reload`, `fullscreen`, `copy` (opens the
  submenu), `paste`, `toggle-controls`, `toggle-debug`, `view-source`.
- **Copy submenu:** `copy-map`, `copy-extent`, `copy-location`.
- **Layer menu:** `zoom-to-layer`, `copy-layer`.
- **Extent menu:** `zoom-to-extent`, `copy-extent`.

## Movement announcements: `.mapml-screen-reader-output`

With `M.options.announceMovement` on (`<map-options>{"announceMovement":true}</map-options>`
in the `<head>` before the implementation loads), each viewer has a live region,
`<output class="mapml-screen-reader-output" role="status" aria-live="polite"
aria-atomic="true">`, in its shadow root, whose text is MapML.js's
`AnnounceMovement` wording (`zoom level N`, the min/max zoom prefixes, and the
`am*Bound`/`amZoomedOut` messages). Specs find it by that class, excluding the
feature-index overlay's `<output>`, which shares it
(`output.mapml-screen-reader-output:not(.mapml-feature-index)`). As in MapML.js,
when a move leaves the layers' bounds the map goes back, and the live region
gives the bound message first and then, once the map is back, `zoom level N`.

## Public API that specs may use

The elements' documented API: attributes and properties (`lat`, `lon`,
`zoom`, `projection`, `controls`, `controlsList`, `width`, `height`,
`extent`, `layers`, `label`, `checked`, `hidden`, `opacity`, ...), methods
(`zoomTo`, `back`, `forward`, `reload`, `defineCustomProjection`,
`matchMedia`, `whenReady`, `mapml2geojson`, ...) and events (`map-moveend`,
`zoomend`, `map-change`, `loadedmetadata`, ...). `zoomend` is dispatched on
the viewer after the map's zoom has changed, with `zoom` (and so
`matchMedia('(map-zoom: …)')`) already reflecting the new zoom.

Anything else a spec relies on must be added to this document first.
