# `@hestia/core-sci`

MyCastle's `packages/sci-core`, moved over whole: 145 files, ~22 300 lines of
scientific core — ODE solvers, units and physical constants, the formula graph,
linear algebra, PDE grids, plots, the knowledge base and the model contract.

No React, no Three.js, no DOM. It runs headless and in a Web Worker, because a
model has no business knowing that somebody is drawing it — which is why the
name has no `ui-` prefix, and why `@hestia/ui-sci-blocks` is a separate package
sitting on top rather than the same one.

## What it depends on

`mathjs` (the formula graph, units), `@cortex-js/compute-engine` (parsing and
compiling expressions, and the translation to Python) and `sucrase` (running
model scripts). Together they are used in five source files; everything else is
plain TypeScript.

## Where it came from

It lived briefly at `packages/ui-core/src/viewer/sci-core/`. That put a
computer-algebra engine into the manifest of a package of shared React
components, which a page wanting only a toolbar would then have carried.

## Debt

Comments and test names are in Polish. This is debt, not the intended state:
translation is a pass of its own, kept apart from moving code because mistakes
hide in a diff that does both.

## Tests

506 assertions across 46 of the 78 test files have been run and pass. The other
32 were not run in the port environment — 31 need `mathjs`,
`@cortex-js/compute-engine` or `sucrase`, and `formula/directives.test.ts` uses
`__dirname` to find its fixtures, which needs vitest's own module handling.
`pnpm test` closes that.
