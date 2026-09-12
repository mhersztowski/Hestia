// WikiLink — the standard TipTap Link mark extended with a boolean `wikilink`
// attribute. Internal links inserted from the "Link wewnętrzny" dialog set it to
// true, which lets the markdown converter serialize them as Obsidian-style
// `[[target]]` / `[[target#heading]]` / `[[target#^block]]` instead of the plain
// `[text](href)` form, while regular links keep the standard syntax.
//
// The mark name stays `link`, so all existing link commands / bubble-menu code
// (setLink, getAttributes('link'), …) keep working unchanged.

import Link from '@tiptap/extension-link';

export const WikiLink = Link.extend({
  addAttributes() {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(this.parent?.() as any),
      wikilink: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-wikilink') === 'true',
        renderHTML: (attrs: { wikilink?: boolean }) =>
          (attrs.wikilink ? { 'data-wikilink': 'true' } : {}),
      },
    };
  },
});

export default WikiLink;
