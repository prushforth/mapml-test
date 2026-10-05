// The single indirection point the cross-port fixtures link to. Upstream
// MapML.js fixtures load the built Leaflet bundle as `mapml.js`; here they load
// this module, which pulls in the OpenLayers implementation from source so the
// Vite dev server serves it with no build step.
//
// To run the cross-port suite against the built bundle instead, swap the import
// for `/dist/mapml-ol.js` (after `npm run build`).
import '/src/index.js';
