import { describe, expect, it } from 'vitest';
import { hashForPage, pageFromHash, DEFAULT_PAGE, PAGES } from './pages';

describe('pageFromHash', () => {
  it('reads the subpage out of the fragment', () => {
    expect(pageFromHash('#/notes')).toBe('notes');
  });

  it('tolerates a missing slash', () => {
    expect(pageFromHash('#notes')).toBe('notes');
  });

  // An address is sometimes assembled by hand or by somebody else's link — an
  // unknown name should show the first subpage, not a blank screen with no
  // explanation.
  it('replaces an unknown name with the default', () => {
    expect(pageFromHash('#/no-such-thing')).toBe(DEFAULT_PAGE);
  });

  it('an empty address gives the default', () => {
    expect(pageFromHash('')).toBe(DEFAULT_PAGE);
  });

  it('ignores parameters appended to the fragment', () => {
    expect(pageFromHash('#/notes?file=a')).toBe('notes');
  });

  it('knows every subpage', () => {
    expect(pageFromHash('#/cad2d')).toBe('cad2d');
    expect(pageFromHash('#/cad3d')).toBe('cad3d');
  });
});

describe('hashForPage', () => {
  it('builds the subpage address', () => {
    expect(hashForPage('notes')).toBe('#/notes');
  });

  it('is the inverse of reading it back', () => {
    for (const page of PAGES) expect(pageFromHash(hashForPage(page))).toBe(page);
  });
});
