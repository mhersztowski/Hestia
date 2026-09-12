/**
 * FreeCAD icons (LGPL) — the toolbar, the action bar and the sketch-constraint
 * overlay draw them for tools that MUI has no icon for (constraints, slots,
 * B-splines, chamfers).
 *
 * In `cad-app` the SVGs sat in `src/assets/freecad-icons/` and Vite turned them
 * into hashed URLs with `import.meta.glob`. That does not survive the move into
 * a package: `import.meta.glob` is a Vite transform, not JavaScript, and tsup
 * would leave it in the output for the host's bundler to choke on. Inlining the
 * files instead is worse — they come to nearly a megabyte, which every page
 * that imports one icon would then carry.
 *
 * So the package ships the SVGs in `icons/` and resolves them by URL. The host
 * serves that directory (copy it into the application's `public/`, or point a
 * bundler plugin at it) and says where:
 *
 * ```ts
 * configureFreecadIcons({ baseUrl: '/freecad-icons' });
 * ```
 *
 * Without that the default `/freecad-icons` is used. A host that wants hashed
 * URLs after all can pass its own resolver — `import.meta.glob` on its side:
 *
 * ```ts
 * const urls = import.meta.glob('/node_modules/@hestia/ui-cad/icons/*.svg', { eager: true, query: '?url', import: 'default' });
 * configureFreecadIcons({ resolve: (name) => urls[`…/${name}.svg`] });
 * ```
 *
 * An icon that does not resolve is not an error: every place that uses one
 * falls back to a MUI icon or to the tool's initials.
 */

/** How icon names turn into URLs. */
export interface FreecadIconOptions {
  /** Directory the `icons/` files are served from. Default: `/freecad-icons`. */
  baseUrl?: string;
  /** Full control — takes the name without an extension, returns a URL or `undefined`. */
  resolve?: (name: string) => string | undefined;
}

let baseUrl = '/freecad-icons';
let resolver: ((name: string) => string | undefined) | null = null;

export function configureFreecadIcons(options: FreecadIconOptions): void {
  if (options.baseUrl !== undefined) baseUrl = options.baseUrl.replace(/\/+$/, '');
  resolver = options.resolve ?? null;
}

/** The URL of the icon with this name (no extension), or `undefined` when there is none. */
export function freecadIconUrl(name: string): string | undefined {
  if (resolver) return resolver(name);
  return `${baseUrl}/${name}.svg`;
}
