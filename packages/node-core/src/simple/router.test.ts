import { describe, it, expect } from 'vitest';
import { match } from './router';

describe('match', () => {
    it('a path without parameters matches exactly', () => {
        expect(match('/api/transactions', '/api/transactions')).toEqual({});
        expect(match('/api/transactions', '/api/transactions/1')).toBeNull();
        expect(match('/api/transactions', '/api/accounts')).toBeNull();
    });

    it('extracts parameters', () => {
        expect(match('/api/transactions/:id', '/api/transactions/abc')).toEqual({ id: 'abc' });
        expect(match('/api/accounts/:accountId/transactions/:id', '/api/accounts/a1/transactions/t2'))
            .toEqual({ accountId: 'a1', id: 't2' });
    });

    it('decodes the parameter value', () => {
        // An identifier is sometimes a name typed by a person — with a space or
        // a slash, which are percent-encoded in the URL.
        expect(match('/api/categories/:id', '/api/categories/home%20and%20garden'))
            .toEqual({ id: 'home and garden' });
    });

    it('an empty segment is not a parameter value', () => {
        // `/api/transactions//` would look like an identifier equal to the empty
        // string and reach the store as a valid query.
        expect(match('/api/transactions/:id', '/api/transactions/')).toBeNull();
    });

    it('a trailing slash does not change the match', () => {
        expect(match('/api/transactions', '/api/transactions/')).toEqual({});
    });
});
