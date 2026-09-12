/**
 * The browser-safe entry has to stay browser-safe.
 *
 * Nothing breaks at the moment somebody imports `node:fs` into a module that
 * `format.ts` reaches — the Node tests still pass. It breaks later, in a web
 * page's build, far from the change that caused it. So this test walks the
 * import graph from `format.ts` and fails on anything that is not a relative
 * import of plain TypeScript.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Static `import … from` / `export … from`, and dynamic `import('…')`.
const IMPORT = /^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm;

function reachable(entry: string): { files: Set<string>; external: Set<string> } {
  const files = new Set<string>();
  const external = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    for (const [, fromSpec, dynamicSpec] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const spec = fromSpec ?? dynamicSpec;
      if (spec.startsWith('.')) visit(path.resolve(path.dirname(file), spec.replace(/\.js$/, '.ts')));
      else external.add(spec);
    }
  };
  visit(entry);
  return { files, external };
}

describe('@hestia/node-devtools/format', () => {
  it('imports nothing outside the package — no node:*, no parsers', () => {
    const { external } = reachable(path.join(here, 'format.ts'));
    expect([...external]).toEqual([]);
  });

  it('does not reach the parsers, the service or git', () => {
    const { files } = reachable(path.join(here, 'format.ts'));
    const rel = [...files].map((f) => path.relative(here, f).split(path.sep).join('/'));
    expect(rel.some((f) => f.startsWith('codemap/parsers/') || f.startsWith('git/') || f.endsWith('CodemapService.ts'))).toBe(false);
  });
});
