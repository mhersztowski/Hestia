# `@hestia/ui-sci-blocks`

MyCastle's `packages/sci-blocks`, moved over whole: 145 files, ~18 900 lines —
the React layer over `@hestia/core-sci`. The blocks a knowledge document is
built from (`formula`, `sim`, `plot`, `linalg`, `exercise`, `law`, `figure`,
`table`, `procedure`, `compare`), their parameter panels, the canvases they draw
on, and `ReaderView`, which turns a Markdown document into the lot.

## What it depends on

`@hestia/core-sci` for everything it computes. `katex` for typesetting formulas
and `mathlive` for the formula input field, loaded on demand in `MathField.tsx`.
`three` is an **optional** peer: only `LinAlgStage3D` and `SurfaceStage` reach
for it and both `import('three')` at run time, so a page with no 3D block does
not have to install a renderer. React, MUI and Emotion are peers as everywhere
here.

## Tests render components, and that is the exception

95 of the 145 files are tests, and 77 of them render with
`@testing-library/react` — against this repository's rule. The reason they stay:
each loads a **real** knowledge document from `documents/` (62 files) and
asserts that its formulas resolve, its references point somewhere and its
simulation runs. That is a statement about the document pipeline, not about
markup, and there is no other way to make it.

The documents sit at the package root rather than beside the tests because the
tests read them with paths relative to the working directory, which for vitest
is the package root.

## Where it came from

It lived briefly at `packages/ui-core/src/viewer/sci-blocks/`, importing the
scientific core as `../sci-core`. Both are packages of their own now, and those
108 imports point at `@hestia/core-sci`.

## Debt

- Comments, test names and several filenames are in Polish
  (`wiazanie.ts`, `lamanieStron.ts`, `przewijanie.ts`, `dok35.test.tsx`).
- `export:static` and `build:runtime` did not come over — they are node scripts
  in MyCastle, together with the Vite playground and the static export target.
  `@hestia/core-sci`'s `knowledge/packSite.ts` still tells the user to run
  `pnpm --filter @hestia/ui-core export:static`, and that script does not exist
  here.

## Tests

Verification in the port environment was thin: most files need `mathjs`,
`react`, `@testing-library/react` or `jsdom`, none of which were installed.
`pnpm install && pnpm test` is what settles this package.
