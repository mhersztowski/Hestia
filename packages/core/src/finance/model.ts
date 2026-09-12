/**
 * Hestia's domain model — household finances.
 *
 * Zod schemas are the **only** source of truth about the shape of the data:
 * TypeScript types are derived from them rather than written alongside. A
 * declaration kept in two places drifts apart at the first field change and
 * only shows at run time, when the server accepts something the browser knows
 * nothing about.
 */

import { z } from 'zod';

/** Account kind — decides how the balance is computed, not just which icon shows. */
export const AccountKind = z.enum(['personal', 'savings', 'card', 'cash']);
export type AccountKind = z.infer<typeof AccountKind>;

/**
 * Human-readable kind names.
 *
 * In the model rather than in the interface, so that every application in this
 * repository spells them the same way. The identifier (`savings`) is what
 * travels through URLs and files; this is only what a person reads.
 */
export const ACCOUNT_KIND_NAMES: Record<AccountKind, string> = {
    personal: 'Personal',
    savings: 'Savings',
    card: 'Card',
    cash: 'Cash',
};

export const Account = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: AccountKind,
    /** Opening balance in minor units — the balance is counted from it. */
    openingBalance: z.number().int().default(0),
});
export type Account = z.infer<typeof Account>;

export const Category = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** Colour in the interface; without it charts pick their own. */
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export type Category = z.infer<typeof Category>;

export const Transaction = z.object({
    id: z.string().min(1),
    /** Posting date in ISO notation (`YYYY-MM-DD`) — sorts lexicographically. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /**
     * Amount in **minor units**; negative means an expense.
     *
     * One field instead of a "amount + direction" pair: two fields give four
     * combinations, two of which are nonsense (an expense in the negative and
     * income in the negative), and summing them means remembering which side
     * to flip.
     */
    amount: z.number().int(),
    description: z.string().default(''),
    accountId: z.string().min(1),
    categoryId: z.string().optional(),
});
export type Transaction = z.infer<typeof Transaction>;

export const Budget = z.object({
    /** The month it applies to: `YYYY-MM`. */
    month: z.string().regex(/^\d{4}-\d{2}$/),
    categoryId: z.string().min(1),
    /** Planned amount in minor units — positive, because it is a spending cap. */
    limit: z.number().int().nonnegative(),
});
export type Budget = z.infer<typeof Budget>;

/** The whole store contents — one file, one schema, one validation. */
export const Data = z.object({
    accounts: z.array(Account).default([]),
    categories: z.array(Category).default([]),
    transactions: z.array(Transaction).default([]),
    budgets: z.array(Budget).default([]),
});
export type Data = z.infer<typeof Data>;

/** An empty but valid data set — the starting point for a new store. */
export function emptyData(): Data {
    return { accounts: [], categories: [], transactions: [], budgets: [] };
}
