/**
 * Platform users: the store, creating the first account and signing in.
 *
 * Passwords are never held in the clear — `PasswordService` (bcrypt) comes from
 * the copied MyCastle base, so the hash format is the same and accounts can be
 * moved between installations without resetting passwords.
 */

import { z } from 'zod';
import { JsonStore, PasswordService } from '@hestia/node-core';
import type { AuthTokenPayload } from '@hestia/core';

export const User = z.object({
    id: z.string().min(1),
    userName: z.string().min(1),
    /** A bcrypt hash — never the password. */
    passwordHash: z.string().min(1),
    isAdmin: z.boolean().default(false),
    roles: z.array(z.string()).default([]),
    createdAt: z.number(),
});
export type User = z.infer<typeof User>;

export const UserDatabase = z.object({ users: z.array(User).default([]) });
export type UserDatabase = z.infer<typeof UserDatabase>;

export type UserStore = JsonStore<typeof UserDatabase>;

/** User data with everything that must not reach the browser removed. */
export interface PublicUser {
    id: string;
    userName: string;
    isAdmin: boolean;
    roles: string[];
}

export function publicUser(u: User): PublicUser {
    return { id: u.id, userName: u.userName, isAdmin: u.isAdmin, roles: u.roles };
}

export function tokenPayload(u: User): AuthTokenPayload {
    return { userId: u.id, userName: u.userName, isAdmin: u.isAdmin, roles: u.roles };
}

/**
 * Creates the first account when the database is empty.
 *
 * The condition is "empty database" rather than "no file": the file appears on
 * the first write, so otherwise the administrator account would come back after
 * every deletion of users — together with the password from the configuration,
 * which somebody may have changed since.
 */
export async function createFirstAccount(
    store: UserStore, userName: string, password: string,
): Promise<PublicUser | null> {
    const database = await store.read();
    if (database.users.length > 0) return null;

    const user: User = {
        id: crypto.randomUUID(),
        userName,
        passwordHash: await PasswordService.hash(password),
        isAdmin: true,
        roles: ['admin'],
        createdAt: Date.now(),
    };
    await store.update((d) => ({ ...d, users: [...d.users, user] }));
    return publicUser(user);
}

/**
 * Verifies sign-in credentials.
 *
 * Returns `null` both for an unknown name and for a wrong password — telling
 * them apart in the message tells a stranger which accounts exist.
 */
export async function verifyLogin(
    store: UserStore, userName: string, password: string,
): Promise<User | null> {
    const database = await store.read();
    const user = database.users.find((u) => u.userName === userName);
    if (!user) {
        // Even with no account we compute a hash: without it the response time
        // reveals whether the name exists and allows the account list to be
        // worked out.
        await PasswordService.hash(password);
        return null;
    }
    return (await PasswordService.verify(password, user.passwordHash)) ? user : null;
}
