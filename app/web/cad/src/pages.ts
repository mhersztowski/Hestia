/**
 * The CAD application's subpages.
 *
 * The address lives in the **fragment** (`#/notes`) rather than the path,
 * because the platform serves this application as a plain directory of static
 * files — with a `/cad/notes` path, refreshing the page would end in a 404 until
 * somebody taught the server to rewrite onto `index.html`. A fragment never
 * reaches the server, so a link to a subpage works from day one and comes back
 * to the same place after a refresh.
 *
 * A file of its own, because this is the only part of the navigation that can be
 * checked without a browser — the rest is drawing tabs.
 */

/** Subpage identifiers. The order here is the order of the tabs. */
export const PAGES = ['notes', 'cad2d', 'cad3d'] as const;

export type Page = (typeof PAGES)[number];

/** The first subpage — used when the address says nothing sensible. */
export const DEFAULT_PAGE: Page = 'notes';

export const PAGE_NAMES: Record<Page, string> = {
    notes: 'Notes',
    cad2d: 'Cad2d',
    cad3d: 'Cad3d',
};

/** The subpage named by the address fragment; the default when it is unknown. */
export function pageFromHash(hash: string): Page {
    const name = (hash ?? '').replace(/^#\/?/, '').split('?')[0].trim();
    return (PAGES as readonly string[]).includes(name)
        ? (name as Page)
        : DEFAULT_PAGE;
}

/** The address fragment for a subpage — for a tab's `href` and for `location.hash`. */
export function hashForPage(page: Page): string {
    return `#/${page}`;
}
