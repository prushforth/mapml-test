// Capability gating for specs (docs/PLAN.md, "Capabilities").
//
// A test that needs something not every implementation has (a projection, a
// custom TCRS, ...) declares it twice: as a tag, so a run can select it with
// `--grep @CBMTILE`, and with `requires()` inside the describe/test body, so an
// implementation without it reports the test as SKIPPED with a reason instead
// of failing it:
//
//   test.describe('... (CBMTILE)', { tag: '@CBMTILE' }, () => {
//     requires(test, 'CBMTILE');
//     ...
//   });
//
// Call it in a describe body (before the hooks run) to skip beforeAll/beforeEach
// too, or inside a single test to skip just that one.
import { resolveImpl, supports } from '../../implementations.js';

const ROOT = new URL('../../', import.meta.url).pathname;

// playwright.config.js resolves MAPML_IMPL (or the last build) and exports it
// to the workers through the environment, so this matches the server.
export const impl = resolveImpl(process.env.MAPML_IMPL, { root: ROOT });

export function implSupports(capability) {
  return supports(impl, capability);
}

export function requires(test, ...capabilities) {
  const missing = capabilities.filter((c) => !supports(impl, c));
  test.skip(
    missing.length > 0,
    `${impl.name} does not support ${missing.join(', ')}`
  );
}
