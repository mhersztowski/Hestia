import { describe, it, expect } from 'vitest';
import { normalize, join, dirname, basename, extname, isAbsolute, segments } from './paths';

describe('paths', () => {
  describe('normalize', () => {
    it('should return / for empty string', () => expect(normalize('')).toBe('/'));
    it('should handle root', () => expect(normalize('/')).toBe('/'));
    it('should remove trailing slashes', () => expect(normalize('/a/b/')).toBe('/a/b'));
    it('should resolve dots', () => expect(normalize('/a/./b')).toBe('/a/b'));
    it('should resolve double dots', () => expect(normalize('/a/b/../c')).toBe('/a/c'));
    it('should not go above root', () => expect(normalize('/../a')).toBe('/a'));
    it('should handle relative paths', () => expect(normalize('a/b')).toBe('a/b'));
  });

  describe('join', () => {
    it('should join parts', () => expect(join('/a', 'b', 'c')).toBe('/a/b/c'));
    it('should normalize result', () => expect(join('/a', '../b')).toBe('/b'));
    it('should return . for no parts', () => expect(join()).toBe('.'));
  });

  describe('dirname', () => {
    it('should return / for root file', () => expect(dirname('/a.txt')).toBe('/'));
    it('should return parent', () => expect(dirname('/a/b/c.txt')).toBe('/a/b'));
    it('should return / for root', () => expect(dirname('/')).toBe('/'));
  });

  describe('basename', () => {
    it('should return filename', () => expect(basename('/a/b/c.txt')).toBe('c.txt'));
    it('should strip extension', () => expect(basename('/a/b/c.txt', '.txt')).toBe('c'));
    it('should handle root children', () => expect(basename('/file')).toBe('file'));
  });

  describe('extname', () => {
    it('should return extension', () => expect(extname('/a/b.ts')).toBe('.ts'));
    it('should return empty for no extension', () => expect(extname('/a/b')).toBe(''));
    it('should return last extension', () => expect(extname('/a/b.test.ts')).toBe('.ts'));
    it('should return empty for dotfiles', () => expect(extname('/a/.gitignore')).toBe(''));
  });

  describe('isAbsolute', () => {
    it('should return true for absolute', () => expect(isAbsolute('/a')).toBe(true));
    it('should return false for relative', () => expect(isAbsolute('a')).toBe(false));
    it('should return false for empty', () => expect(isAbsolute('')).toBe(false));
  });

  describe('segments', () => {
    it('should split path', () => expect(segments('/a/b/c')).toEqual(['a', 'b', 'c']));
    it('should return empty for root', () => expect(segments('/')).toEqual([]));
    it('should handle single segment', () => expect(segments('/foo')).toEqual(['foo']));
  });
});
