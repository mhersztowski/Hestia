/** An in-memory `CodemapStore` for tests — the whole store is a `Map`. */
import type { CodemapStore } from './store';

export function memoryStore(
  files: Record<string, string> = {},
  opts: { rename?: boolean; remove?: boolean | 'fails' } = { remove: true },
): CodemapStore & { files: Map<string, string> } {
  const map = new Map(Object.entries(files));
  return {
    files: map,
    codemapDir: 'devtools/codemaps',
    async list(dir) {
      const prefix = dir ? `${dir}/` : '';
      const names = new Map<string, boolean>();
      for (const p of map.keys()) {
        if (!p.startsWith(prefix)) continue;
        const [head, ...rest] = p.slice(prefix.length).split('/');
        names.set(head, rest.length > 0 || names.get(head) === true);
      }
      return [...names].map(([name, directory]) => ({ name, directory }));
    },
    async read(path) {
      const v = map.get(path);
      if (v === undefined) throw new Error(`no such file: ${path}`);
      return v;
    },
    async write(path, content) { map.set(path, content); },
    ...(opts.remove ? {
      async remove(path: string) {
        if (opts.remove === 'fails') throw new Error('permission denied');
        map.delete(path);
      },
    } : {}),
    ...(opts.rename ? {
      async rename(from: string, to: string) {
        const v = map.get(from);
        if (v === undefined) throw new Error(`no such file: ${from}`);
        map.set(to, v); map.delete(from);
      },
    } : {}),
  };
}
