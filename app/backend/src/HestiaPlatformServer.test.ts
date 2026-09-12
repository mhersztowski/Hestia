import { describe, expect, it } from 'vitest';
import { pathInsideUserDir, DIR_TYPE, FILE_TYPE } from './HestiaPlatformServer';

describe('pathInsideUserDir', () => {
    it('leaves an ordinary path unchanged', () => {
        expect(pathInsideUserDir('cad/notes/tuesday.notes.json')).toBe('cad/notes/tuesday.notes.json');
    });

    it('strips leading slashes so the path can be appended', () => {
        expect(pathInsideUserDir('/cad/notes')).toBe('cad/notes');
    });

    it('skips empty segments and "."', () => {
        expect(pathInsideUserDir('cad//./notes')).toBe('cad/notes');
    });

    /*
     * The heart of this function. `FileSystem` only guards the data root, so
     * `../bob/...` appended to `users/alice/` normalised into another user's
     * directory and passed that check — which gave every signed-in user read
     * and overwrite access to somebody else's files.
     */
    it('rejects escaping outside the user directory', () => {
        expect(() => pathInsideUserDir('../bob/secret.notes.json')).toThrow(/outside the user directory/);
    });

    it('rejects an escape hidden in the middle of the path', () => {
        expect(() => pathInsideUserDir('cad/../../bob/secret.notes.json')).toThrow(/outside the user directory/);
    });

    it('rejects backslashes used to get around it', () => {
        expect(() => pathInsideUserDir('..\\bob\\secret.notes.json')).toThrow(/outside the user directory/);
    });

    // A file name may contain two dots — we block a `..` segment, not dots.
    it('does not block names containing dots', () => {
        expect(pathInsideUserDir('cad/tuesday..copy.notes.json')).toBe('cad/tuesday..copy.notes.json');
    });
});

/*
 * The VFS speaks MyCastle's dialect: `/api/users/{userName}/vfs/{operation}`,
 * base64 in `data`, and `1`/`2` for a file and a directory. The pages moved over
 * from there read exactly that, and matching it is cheaper than translating on
 * every request — which is what the two constants below are for.
 */
describe('the listing dialect', () => {
    it('numbers a file and a directory the way MyCastle does', () => {
        expect(FILE_TYPE).toBe(1);
        expect(DIR_TYPE).toBe(2);
    });
});

describe('who a request is allowed to reach', () => {
    /*
     * The user is in the path so that an admin can reach somebody else's space.
     * Whether they may is decided by the token: were the path to decide, typing
     * another name into the address bar would be enough. This is the rule the
     * route applies, written out where it can be read.
     */
    const mayReach = (who: { userName: string; isAdmin: boolean }, target: string) =>
        who.isAdmin || who.userName === target;

    it('lets a person reach their own space', () => {
        expect(mayReach({ userName: 'marcin', isAdmin: false }, 'marcin')).toBe(true);
    });

    it('refuses somebody else\'s', () => {
        expect(mayReach({ userName: 'marcin', isAdmin: false }, 'ola')).toBe(false);
    });

    it('lets an admin reach anybody', () => {
        expect(mayReach({ userName: 'admin', isAdmin: true }, 'marcin')).toBe(true);
    });
});
