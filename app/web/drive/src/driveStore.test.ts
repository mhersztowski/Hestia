/**
 * The listing, against the shape the platform actually sends.
 *
 * This is the one place where two applications have to agree on a wire format,
 * and they did not: the page declared the response as a subtree and read
 * `entries.children`, while `/api/vfs/readdir` answers with a flat array and a
 * numeric `type`. Nothing failed — every directory simply came back empty, and
 * the drive said "This folder is empty" over a disk that was not.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DIR_TYPE, FILE_TYPE } from '@hestia/ui-core';
import { platformDrive } from './driveStore';

function answerWith(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
    )
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('the drive over the platform', () => {
  it('lists what readdir sends', async () => {
    answerWith({
      entries: [
        { name: 'notes.md', type: FILE_TYPE },
        { name: 'projects', type: DIR_TYPE },
      ],
    });

    expect(await platformDrive().list('')).toEqual([
      { name: 'notes.md', directory: false },
      { name: 'projects', directory: true },
    ]);
  });

  it('tells a directory from a file by the number, not by a word', async () => {
    answerWith({ entries: [{ name: 'projects', type: DIR_TYPE }] });

    const [entry] = await platformDrive().list('');
    expect(entry.directory).toBe(true);
  });

  it('an empty answer is an empty listing, not a crash', async () => {
    answerWith({ entries: [] });
    expect(await platformDrive().list('nowhere')).toEqual([]);
  });

  /**
   * A signed-out user must not be shown an empty drive: that reads as "the
   * files are gone" rather than "sign in again".
   */
  it('lets an expired token through instead of showing nothing', async () => {
    answerWith({ error: 'No token' }, 401);
    await expect(platformDrive().list('')).rejects.toThrow();
  });
});

/**
 * The platform has no directories of its own: a folder exists once a file is
 * in it, so creating one writes an empty `.keep`. That marker is the server's
 * bookkeeping and has no business in a listing the user reads.
 */
describe("the platform's directory marker", () => {
  it('is not listed', async () => {
    answerWith({
      entries: [
        { name: '.keep', type: FILE_TYPE },
        { name: 'notes.md', type: FILE_TYPE },
      ],
    });

    expect(await platformDrive().list('')).toEqual([{ name: 'notes.md', directory: false }]);
  });

  it('leaves a directory that only holds the marker looking empty', async () => {
    answerWith({ entries: [{ name: '.keep', type: FILE_TYPE }] });
    expect(await platformDrive().list('nowy-katalog')).toEqual([]);
  });

  // A file the user named `.keep.md` is theirs, and stays.
  it('does not touch a name that merely starts the same way', async () => {
    answerWith({ entries: [{ name: '.keep.md', type: FILE_TYPE }] });
    expect(await platformDrive().list('')).toEqual([{ name: '.keep.md', directory: false }]);
  });
});
