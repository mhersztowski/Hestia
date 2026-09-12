/**
 * Finance API routes.
 *
 * Registration is a separate function (rather than the body of `index.ts`) so a
 * test can stand up a server on a random port with a store in a temporary
 * directory — and check the routes for real, over HTTP, instead of calling
 * handlers in isolation from routing, status codes and serialisation.
 */

import { randomUUID } from 'node:crypto';
import { HttpError, type HttpServer, type JsonStore } from '@hestia/node-core';
import {
    Data, Category, Account, Transaction,
    summariseMonth, accountBalance, byCategory, budgetProgress,
} from '@hestia/core';
import { z } from 'zod';

/** The store for all the data — one file, one schema. */
export type DataStore = JsonStore<typeof Data>;

/** New records arrive without an `id` — the server assigns it. */
const NewAccount = Account.omit({ id: true }).extend({ openingBalance: z.number().int().default(0) });
const NewCategory = Category.omit({ id: true });
const NewTransaction = Transaction.omit({ id: true });

export function registerApi(server: HttpServer, store: DataStore): void {
    server.get('/api/health', () => ({ ok: true, time: new Date().toISOString() }));

    server.get('/api/data', () => store.read());

    /* ── Accounts ────────────────────────────────────────────────────────── */

    server.get('/api/accounts', async () => {
        const data = await store.read();
        // The balance is added here rather than kept in the file: a stored total
        // drifts from the transactions at the first hand edit of the store.
        return data.accounts.map((a) => ({ ...a, balance: accountBalance(a, data.transactions) }));
    });

    server.post('/api/accounts', async ({ body }) => {
        const account: Account = { id: randomUUID(), ...NewAccount.parse(body) };
        await store.update((d) => ({ ...d, accounts: [...d.accounts, account] }));
        return account;
    });

    /* ── Categories ──────────────────────────────────────────────────────── */

    server.get('/api/categories', async () => (await store.read()).categories);

    server.post('/api/categories', async ({ body }) => {
        const category: Category = { id: randomUUID(), ...NewCategory.parse(body) };
        await store.update((d) => ({ ...d, categories: [...d.categories, category] }));
        return category;
    });

    /* ── Transactions ────────────────────────────────────────────────────── */

    server.get('/api/transactions', async ({ query }) => {
        const data = await store.read();
        const month = query.get('month');
        const selected = month ? data.transactions.filter((t) => t.date.startsWith(month)) : data.transactions;
        // Newest first: that is how a statement reads, and an ISO date sorts
        // lexicographically, so there is no date parsing here at all.
        return [...selected].sort((a, b) => b.date.localeCompare(a.date));
    });

    server.post('/api/transactions', async ({ body }) => {
        const input = NewTransaction.parse(body);
        const data = await store.read();
        if (!data.accounts.some((a) => a.id === input.accountId)) {
            // Without this check the transaction lands on an account that does
            // not exist — the balance adds up (because nobody counts it) and
            // the money disappears from view.
            throw new HttpError(400, `There is no account with id ${input.accountId}`);
        }
        const transaction: Transaction = { id: randomUUID(), ...input };
        await store.update((d) => ({ ...d, transactions: [...d.transactions, transaction] }));
        return transaction;
    });

    server.put('/api/transactions/:id', async ({ params, body }) => {
        const changes = NewTransaction.partial().parse(body);
        let result: Transaction | null = null;
        await store.update((d) => {
            const i = d.transactions.findIndex((t) => t.id === params.id);
            if (i < 0) throw new HttpError(404, `There is no transaction ${params.id}`);
            result = { ...d.transactions[i], ...changes };
            const transactions = [...d.transactions];
            transactions[i] = result;
            return { ...d, transactions };
        });
        return result;
    });

    server.delete('/api/transactions/:id', async ({ params }) => {
        await store.update((d) => {
            if (!d.transactions.some((t) => t.id === params.id)) {
                throw new HttpError(404, `There is no transaction ${params.id}`);
            }
            return { ...d, transactions: d.transactions.filter((t) => t.id !== params.id) };
        });
        return { ok: true };
    });

    /* ── Summary ─────────────────────────────────────────────────────────── */

    /**
     * Everything the main page shows, in one request.
     *
     * Four separate queries would give four loading states and four chances to
     * show data from different moments — and this is one screen that has to be
     * consistent.
     */
    server.get('/api/summary', async ({ query }) => {
        const data = await store.read();
        const month = query.get('month') ?? new Date().toISOString().slice(0, 7);
        const inMonth = data.transactions.filter((t) => t.date.startsWith(month));
        return {
            month,
            summary: summariseMonth(data.transactions, month),
            categories: byCategory(inMonth).map((s) => ({
                ...s,
                name: data.categories.find((c) => c.id === s.categoryId)?.name ?? 'No category',
                color: data.categories.find((c) => c.id === s.categoryId)?.color,
            })),
            accounts: data.accounts.map((a) => ({ ...a, balance: accountBalance(a, data.transactions) })),
            budgets: data.budgets
                .filter((b) => b.month === month)
                .map((b) => ({
                    ...budgetProgress(b, data.transactions),
                    name: data.categories.find((c) => c.id === b.categoryId)?.name ?? b.categoryId,
                })),
        };
    });
}
