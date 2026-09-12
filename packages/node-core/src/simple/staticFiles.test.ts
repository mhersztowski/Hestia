import { describe, it, expect } from 'vitest';
import { resolvePath, mimeType } from './staticFiles';

/**
 * Serving files is where a mistake means leaking the contents of the disk — so
 * path resolution is a separate, pure function with tests of its own.
 */
describe('resolvePath', () => {
    const dir = '/srv/public';

    it('an ordinary file lands below the public directory', () => {
        expect(resolvePath(dir, '/assets/app.js')).toBe('/srv/public/assets/app.js');
    });

    it('the root is index.html', () => {
        expect(resolvePath(dir, '/')).toBe('/srv/public/index.html');
    });

    it('escaping upwards is clamped to the public directory, not let out onto the disk', () => {
        // Normalisation **before** joining: `/../../etc/passwd` becomes
        // `/etc/passwd` and lands below the public directory (where there is
        // usually nothing, so a 404 comes out). What matters is what is NOT
        // here: `/etc/passwd` from the server's disk.
        expect(resolvePath(dir, '/../../etc/passwd')).toBe('/srv/public/etc/passwd');
        expect(resolvePath(dir, '/assets/../../../etc/passwd')).toBe('/srv/public/etc/passwd');
    });

    it('the same when the escape is percent-encoded', () => {
        // `%2e%2e` is the same two dots; checking the raw text before decoding
        // lets them through without a trace.
        expect(resolvePath(dir, '/%2e%2e/%2e%2e/etc/passwd')).toBe('/srv/public/etc/passwd');
    });

    it('a directory whose name merely starts the same way is out of reach', () => {
        // `/srv/public-secret` starts with `/srv/public`, so comparing plain
        // text prefixes would let that directory in — here the path stays inside.
        expect(resolvePath('/srv/public', '/../public-secret/file')).toBe('/srv/public/public-secret/file');
    });

    it('malformed percent-encoding is a refusal, not a guess', () => {
        expect(resolvePath(dir, '/%zz')).toBeNull();
    });

    it('strips the query string and the fragment', () => {
        expect(resolvePath(dir, '/app.js?v=2')).toBe('/srv/public/app.js');
    });
});

describe('mimeType', () => {
    it('knows the types the application actually sends', () => {
        expect(mimeType('/a/app.js')).toBe('text/javascript; charset=utf-8');
        expect(mimeType('/a/index.html')).toBe('text/html; charset=utf-8');
        expect(mimeType('/a/style.css')).toBe('text/css; charset=utf-8');
        expect(mimeType('/a/data.json')).toBe('application/json; charset=utf-8');
        expect(mimeType('/a/logo.svg')).toBe('image/svg+xml');
    });

    it('an unknown extension is a byte stream, not a guess', () => {
        expect(mimeType('/a/file.weird')).toBe('application/octet-stream');
    });
});
