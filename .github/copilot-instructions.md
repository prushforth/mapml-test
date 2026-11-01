# mapml-test: instructions for AI coding agents

This repository is MapML.js's e2e suite being turned into one suite for every
MapML.js-derived implementation (MapML.js, MapML-OpenLayers, MapML-MapLibre),
which are sibling checkouts on their `cross-port-tests` branches.

Before changing anything, read and follow:

- [docs/PLAN.md](../docs/PLAN.md): the plan of record. Its decisions (D1–D9)
  and the per-spec routine are canon.
- [docs/CONTRACT.md](../docs/CONTRACT.md): what specs may rely on. Never
  assert on renderer internals or renderer-specific DOM.
- [PORTING.md](../PORTING.md): where things stand. It is generated: edit
  `porting.json`, then run `node tools/status.mjs`.

Running: `node scripts/run.mjs <impl|all> [--no-build|--no-copy] [-- <playwright args>]`
(see [README.md](../README.md)).

## Commits

Ask before making any commit, in this repository and in every repository of
the workspace (MapML.js, MapML-OpenLayers, MapML-MapLibre, ...). That includes
step 9 of the per-spec routine in [docs/PLAN.md](../docs/PLAN.md): prepare the
changes and the commit messages, then wait for approval before committing.
