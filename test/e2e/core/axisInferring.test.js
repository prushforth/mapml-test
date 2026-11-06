// Converted for all implementations (mapml-test docs/PLAN.md). Upstream:
// MapML.js test/e2e/core/axisInferring.test.js. Upstream's scenario runs
// unchanged in CBMTILE on upstream's fixture, and again in OSMTILE on a
// counterpart, axisInferringOSMTILE.html (D3). Each test loads its own page
// (D4) and polls the layer's extent instead of sleeping. Upstream compared
// tilematrix, tcrs and pcrs exactly; the implementations agree only to the
// last few bits in OSMTILE (MapML-OpenLayers goes through its resolutions
// table), so every coordinate is compared to six decimal places.
//
// The point of the spec is that a layer's <map-meta name="extent"> is read in
// the coordinate system its axis names imply (column/row: tilematrix, x/y:
// tcrs, easting/northing: pcrs, longitude/latitude: gcrs), and that the
// layer's extent is that extent unioned with the layer's content (one
// map-feature, Arizona, in every layer). The expected values were measured
// on MapML.js, as upstream's were.
import { test, expect } from '@playwright/test';
import { requires } from '../../helpers/capabilities.js';

// Per projection: the fixture, the zoom whose tilematrix/tcrs the metas are
// written in, and each layer's expected corners.
const PROJECTIONS = {
  CBMTILE: {
    file: 'axisInferring.html',
    zoom: 0,
    tilematrix: {
      topLeft: { horizontal: 0, vertical: 1 },
      bottomRight: { horizontal: 4, vertical: 5 }
    },
    // the top left corner is the meta's, the bottom right the feature's
    tcrs: {
      topLeft: { horizontal: 0, vertical: 256 },
      bottomRight: {
        horizontal: 868.9331277338575,
        vertical: 1069.7755295390994
      }
    },
    pcrs: {
      topLeft: { horizontal: -6601973, vertical: 1569758 },
      bottomRight: {
        horizontal: -1319475.9373123178,
        vertical: -1731574.5341126453
      }
    },
    // the feature's west and south, the meta's north and east
    gcrs: {
      topLeft: { horizontal: -114.815198, vertical: 53 },
      bottomRight: { horizontal: -62, vertical: 31.331629 }
    }
  },
  OSMTILE: {
    file: 'axisInferringOSMTILE.html',
    zoom: 2,
    tilematrix: {
      topLeft: { horizontal: 0, vertical: 1 },
      bottomRight: { horizontal: 2, vertical: 3 }
    },
    tcrs: {
      topLeft: { horizontal: 0, vertical: 256 },
      bottomRight: {
        horizontal: 201.8346581333334,
        vertical: 418.0732963563216
      }
    },
    pcrs: {
      topLeft: { horizontal: -13000000, vertical: 5000000 },
      bottomRight: {
        horizontal: -12138555.908784006,
        vertical: 3675892.7888103505
      }
    },
    gcrs: {
      topLeft: { horizontal: -114.815198, vertical: 53 },
      bottomRight: { horizontal: -62, vertical: 31.331629 }
    }
  }
};

// Wait for the nth layer's extent to have `expected` corners in `cs` (at
// `zoom` for the zoom-dependent tilematrix and tcrs).
async function expectExtent(page, nth, cs, zoom, expected) {
  const layer = page.locator(`body > map > map-layer:nth-child(${nth})`);
  for (const corner of ['topLeft', 'bottomRight']) {
    for (const axis of ['horizontal', 'vertical']) {
      await expect
        .poll(() =>
          layer.evaluate(
            (layer, { corner, cs, zoom, axis }) => {
              const value = layer.extent?.[corner][cs];
              return (zoom === null ? value : value?.[zoom])?.[axis];
            },
            { corner, cs, zoom, axis }
          )
        )
        .toBeCloseTo(expected[corner][axis], 6);
    }
  }
}

for (const [projection, p] of Object.entries(PROJECTIONS)) {
  test.describe(
    `Inferring the extent's cs from its axis names (${projection})`,
    { tag: `@${projection}` },
    () => {
      requires(test, projection);

      test.beforeEach(async ({ page }) => {
        await page.goto(p.file, { waitUntil: 'networkidle' });
      });

      test('TileMatrix inferring', async ({ page }) => {
        await expectExtent(page, 1, 'tilematrix', p.zoom, p.tilematrix);
      });

      test('TCRS inferring', async ({ page }) => {
        await expectExtent(page, 2, 'tcrs', p.zoom, p.tcrs);
      });

      test('PCRS inferring', async ({ page }) => {
        await expectExtent(page, 3, 'pcrs', null, p.pcrs);
      });

      test('GCRS inferring', async ({ page }) => {
        await expectExtent(page, 4, 'gcrs', null, p.gcrs);
      });
    }
  );
}
