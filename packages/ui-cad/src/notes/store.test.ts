import { describe, expect, it } from 'vitest';
import { parentDir, sanitiseName, pathIn } from './store';

describe('pathIn', () => {
  it('joins a directory with a name', () => {
    expect(pathIn('projects', 'a.notes.json')).toBe('projects/a.notes.json');
  });

  it('leaves no double slashes', () => {
    expect(pathIn('/projects/', 'a.notes.json')).toBe('projects/a.notes.json');
  });

  it('at the root it returns the bare name', () => {
    expect(pathIn('', 'a.notes.json')).toBe('a.notes.json');
  });
});

describe('parentDir', () => {
  it('steps up one level', () => {
    expect(parentDir('projects/meetings', 'projects')).toBe('projects');
  });

  it('at the root there is nowhere to go', () => {
    expect(parentDir('projects', 'projects')).toBeNull();
  });

  // The root is a boundary, not a hint: without this the "up" button led out
  // of the user's area and the listing ended in a permissions error.
  it('does not go below the root', () => {
    expect(parentDir('projects', 'projects/meetings')).toBeNull();
  });

  it('an empty root allows reaching the top', () => {
    expect(parentDir('projects', '')).toBe('');
  });
});

describe('sanitiseName', () => {
  it('replaces characters that are unsafe in a path', () => {
    expect(sanitiseName('a/b:c*d')).toBe('a_b_c_d');
  });

  it('an empty name gets a replacement value', () => {
    expect(sanitiseName('   ')).toBe('untitled');
  });

  it('leaves an ordinary name alone', () => {
    expect(sanitiseName(' tuesday meeting ')).toBe('tuesday meeting');
  });
});
