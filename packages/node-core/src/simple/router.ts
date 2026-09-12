/**
 * Matching a path against a pattern — as much as this API needs.
 *
 * No routing library: the patterns here are simple (`/api/thing/:id`), and
 * every dependency in the server layer is one more thing to keep updated. A
 * separate, pure function, so it can be checked by a test without standing up
 * a server.
 */

export type Params = Record<string, string>;

/** Returns the parameters when the path matches the pattern; `null` when it does not. */
export function match(pattern: string, path: string): Params | null {
    const p = split(pattern);
    const s = split(path);
    if (p.length !== s.length) return null;

    const params: Params = {};
    for (let i = 0; i < p.length; i++) {
        if (p[i].startsWith(':')) {
            // An empty segment is not a value: `/transactions/` would look like
            // an identifier equal to the empty string and reach the store.
            if (!s[i]) return null;
            try {
                params[p[i].slice(1)] = decodeURIComponent(s[i]);
            } catch {
                return null; // malformed percent-encoding
            }
        } else if (p[i] !== s[i]) {
            return null;
        }
    }
    return params;
}

function split(path: string): string[] {
    return path.split('/').filter((x, i, a) => x !== '' || (i !== 0 && i !== a.length - 1));
}
