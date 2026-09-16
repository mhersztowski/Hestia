import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '@hestia/node-core';
import { UserDatabase, verifyLogin, createFirstAccount, publicUser } from './users';

describe('platform users', () => {
  let dir: string;
  let store: JsonStore<typeof UserDatabase>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hestia-users-'));
    store = new JsonStore(join(dir, 'users.json'), UserDatabase, () => ({ users: [] }));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the first account in an empty database', async () => {
    const account = await createFirstAccount(store, 'admin', 'secret');
    expect(account?.userName).toBe('admin');
    expect(account?.isAdmin).toBe(true);
  });

  it('does not create a second one when somebody is already there', async () => {
    // Otherwise the account from the configuration would come back after
    // every deletion of users — together with a password somebody has
    // since changed.
    await createFirstAccount(store, 'admin', 'secret');
    expect(await createFirstAccount(store, 'admin', 'other')).toBeNull();
    expect((await store.read()).users).toHaveLength(1);
  });

  it('the password is not held in the store in the clear', async () => {
    await createFirstAccount(store, 'admin', 'secret');
    const saved = JSON.stringify(await store.read());
    expect(saved).not.toContain('secret');
    expect((await store.read()).users[0].passwordHash.startsWith('$2')).toBe(true);
  });

  it('sign-in succeeds with the right password', async () => {
    await createFirstAccount(store, 'admin', 'secret');
    expect((await verifyLogin(store, 'admin', 'secret'))?.userName).toBe('admin');
  });

  it('a wrong password and an unknown name give the same result', async () => {
    // Telling them apart would tell a stranger which accounts exist.
    await createFirstAccount(store, 'admin', 'secret');
    expect(await verifyLogin(store, 'admin', 'wrong')).toBeNull();
    expect(await verifyLogin(store, 'nobody-here', 'secret')).toBeNull();
  });

  it('public data does not carry the password hash', async () => {
    await createFirstAccount(store, 'admin', 'secret');
    const u = (await store.read()).users[0];
    expect(Object.keys(publicUser(u))).toEqual(['id', 'userName', 'isAdmin', 'roles']);
  });
});
