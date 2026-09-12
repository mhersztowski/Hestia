/**
 * Reads a knowledge document shipped with this package, for the tests.
 *
 * The path is resolved against **this file**, not against the process's working
 * directory. The tests used to read `documents/…` relative to the cwd, which is
 * this package only when vitest is started here: run from the repository root
 * (`pnpm test`), the same 47 files each reported a missing document, and what
 * looks like 50 absent fixtures is one wrong path.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The `documents/` directory beside `src/`. */
export const documentsDir = resolve(__dirname, '../../documents');

export function readDocument(name: string): string {
  return readFileSync(resolve(documentsDir, name), 'utf8');
}
