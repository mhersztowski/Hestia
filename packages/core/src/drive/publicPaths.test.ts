/**
 * Which Drive directories are public — one rule for the backend and for the UI.
 *
 * The rule used to exist in two places at once: the backend checked whether a
 * path began with `drive/public`, and the Drive page had a copy of the same
 * condition. While there was one directory, a drift had no way of coming to
 * light. With three it would have shown at the first one: the backend serving a
 * file the UI did not mark as public (or the other way round — showing a link
 * that leads to a 403).
 */
import { describe, it, expect } from 'vitest';
import { PUBLIC_DRIVE_DIRS, isPublicDrivePath, publicDriveUrl, publicDriveRoot } from './publicPaths';

describe('recognising a public path', () => {
  it('a public directory and everything in it', () => {
    for (const dir of PUBLIC_DRIVE_DIRS) {
      expect(isPublicDrivePath(dir)).toBe(true);
      expect(isPublicDrivePath(`${dir}/file.md`)).toBe(true);
      expect(isPublicDrivePath(`${dir}/deeper/file.md`)).toBe(true);
    }
  });

  it('the knowledge and repository directories are public along with "public"', () => {
    expect(isPublicDrivePath('knowledge/15-1.md')).toBe(true);
    expect(isPublicDrivePath('git/project/README.md')).toBe(true);
  });

  it('the rest of Drive is not', () => {
    expect(isPublicDrivePath('notes/private.md')).toBe(false);
    expect(isPublicDrivePath('automate/script.automate')).toBe(false);
  });

  /**
   * A name beginning with the name of a public directory is **not** public.
   *
   * `public-notes/` begins with "public" and has nothing to do with it. A check
   * by `startsWith` without the slash would let it out into the world.
   */
  it('does not fall for a directory with a similar name', () => {
    expect(isPublicDrivePath('public-notes/x.md')).toBe(false);
    expect(isPublicDrivePath('knowledge-draft/x.md')).toBe(false);
    expect(isPublicDrivePath('github/x.md')).toBe(false);
  });

  it('an attempt to climb out is not public, however well it starts', () => {
    expect(isPublicDrivePath('public/../notes/secret.md')).toBe(false);
    expect(isPublicDrivePath('knowledge/../../etc/passwd')).toBe(false);
  });

  it('a leading slash does not change the answer', () => {
    expect(isPublicDrivePath('/knowledge/15-1.md')).toBe(true);
  });
});

describe('the root of a public path', () => {
  it('gives the directory the publicness comes from', () => {
    expect(publicDriveRoot('knowledge/15-1.md')).toBe('knowledge');
    expect(publicDriveRoot('public/a/b.png')).toBe('public');
    expect(publicDriveRoot('notes/x.md')).toBeUndefined();
  });
});

describe('the public address', () => {
  it('builds an address from the user name and the path', () => {
    expect(publicDriveUrl('https://app.example', 'ala', 'knowledge/15-1.md'))
      .toBe('https://app.example/public/drive/users/ala/knowledge/15-1.md');
  });

  it('encodes special characters in the name and the path', () => {
    const url = publicDriveUrl('https://x', 'jan kowalski', 'knowledge/rozdział 15.md');

    expect(url).toContain('jan%20kowalski');
    expect(url).toContain('rozdzia%C5%82%2015.md');
    // Slashes stay slashes — otherwise the address would stop pointing at a file.
    expect(url).toContain('/knowledge/');
  });

  it('builds no address for a path outside the public directories', () => {
    expect(publicDriveUrl('https://x', 'ala', 'notes/x.md')).toBeUndefined();
  });
});
