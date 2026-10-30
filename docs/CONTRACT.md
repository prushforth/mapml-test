# The test contract

What every MapML implementation must provide so that one suite can test them
all without knowing which one it is testing ([PLAN.md](PLAN.md), D2). It lives
here, in mapml-test, and nowhere else; the implementations implement it on
their `cross-port-tests` branches.

When a spec needs something that isn't here, add it here in the same change
that implements it in every implementation, committed as
`cross-port: contract — <what>`.

## Controls: `data-testid`

Each control's outermost element carries a `data-testid`. It is the element
whose `hidden` attribute reflects the control's visibility.

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

### Control lifecycle

As in MapML.js (`_createControls`, `_toggleControls`):

- A map creates its controls once. Whether one exists depends only on the
  space available: at the default 300×150 size there is room for zoom and
  reload, but not fullscreen. `controls`, `controlslist` and layer changes
  never create or remove a control.
- `controls` and `controlslist` only show or hide controls, by setting or
  removing the `hidden` attribute on the control element **and on each of its
  children**.
- The layer control is hidden while it has no layers to list, even when
  `controls` is on.

| Implementation   | Conforms?                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MapML.js         | yes (the reference)                                                                                                                                          |
| MapML-OpenLayers | yes                                                                                                                                                          |
| MapML-MapLibre   | **no**: turning `controls` off removes the controls instead of hiding them, and controls are created according to `controlslist` rather than the size budget |

## Context menus: `data-id`

Each menu item is a `<button>` with a `data-id`. The menus keep MapML.js's
class names: `.mapml-contextmenu` (map), `.mapml-layer-menu` (layer),
`.mapml-extent-menu` (extent), and `#mapml-copy-submenu`.

- **Map menu:** `back`, `forward`, `reload`, `fullscreen`, `copy` (opens the
  submenu), `paste`, `toggle-controls`, `toggle-debug`, `view-source`.
- **Copy submenu:** `copy-map`, `copy-extent`, `copy-location`.
- **Layer menu:** `zoom-to-layer`, `copy-layer`.
- **Extent menu:** `zoom-to-extent`, `copy-extent`.

## Public API that specs may use

The elements' documented API: attributes and properties (`lat`, `lon`,
`zoom`, `projection`, `controls`, `controlsList`, `width`, `height`,
`extent`, `layers`, `label`, `checked`, `hidden`, `opacity`, ...), methods
(`zoomTo`, `back`, `forward`, `reload`, `defineCustomProjection`,
`matchMedia`, `whenReady`, `mapml2geojson`, ...) and events (`map-moveend`,
`map-change`, `loadedmetadata`, ...).

Anything else a spec relies on must be added to this document first.
