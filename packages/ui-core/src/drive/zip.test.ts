import { describe, it, expect } from 'vitest';
import { archiveNameFor, folderNameFor, isArchive } from './zip';

describe('recognising an archive', () => {
  it('takes .zip whatever the case', () => {
    expect(isArchive('kopia.zip')).toBe(true);
    expect(isArchive('KOPIA.ZIP')).toBe(true);
  });

  it('offers nothing for anything else', () => {
    expect(isArchive('notatka.md')).toBe(false);
    expect(isArchive('paczka.tar.gz')).toBe(false);
    // The name merely containing "zip" is not an archive.
    expect(isArchive('zipper.txt')).toBe(false);
  });
});

describe('the folder an archive unpacks into', () => {
  it('drops the extension', () => {
    expect(folderNameFor('projekt.zip')).toBe('projekt');
  });

  it('keeps everything but the extension when the name has dots', () => {
    expect(folderNameFor('kopia.2026-09.zip')).toBe('kopia.2026-09');
  });

  // `.zip` as the whole name would leave nothing to call the directory.
  it('falls back when the name is only the extension', () => {
    expect(folderNameFor('.zip')).toBe('archiwum');
  });
});

describe('the archive made of a folder', () => {
  it('appends the extension', () => {
    expect(archiveNameFor('projekt')).toBe('projekt.zip');
  });

  it('appends it to a folder whose name has a dot, so it still unpacks', () => {
    expect(archiveNameFor('kopia.2026')).toBe('kopia.2026.zip');
  });

  it('does not carry a trailing slash into the file name', () => {
    expect(archiveNameFor('projekt/')).toBe('projekt.zip');
  });

  it('falls back on an empty name', () => {
    expect(archiveNameFor('  ')).toBe('archiwum.zip');
  });
});
