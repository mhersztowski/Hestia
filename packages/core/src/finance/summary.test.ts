import { describe, it, expect } from 'vitest';
import { accountBalance, transactionMonth, summariseMonth, byCategory, budgetProgress } from './summary';
import type { Account, Transaction, Budget } from './model';

const account: Account = { id: 'a1', name: 'Current', kind: 'personal', openingBalance: 100_00 };
const t = (id: string, date: string, amount: number, categoryId?: string): Transaction =>
    ({ id, date, amount, description: '', accountId: 'a1', categoryId });

describe('summaries', () => {
    it('balance is the opening balance plus movements on that account', () => {
        const other: Transaction = { ...t('x', '2026-01-05', -50_00), accountId: 'a2' };
        expect(accountBalance(account, [t('a', '2026-01-02', -30_00), t('b', '2026-01-03', 10_00), other]))
            .toBe(80_00);
    });

    it('the month is taken from the date text, without parsing into a date object', () => {
        // `new Date('2026-01-31')` in a negative offset steps back to 30 January
        // — and then a transaction from the end of the month lands in the
        // previous one.
        expect(transactionMonth(t('a', '2026-01-31', 0))).toBe('2026-01');
    });

    it('separates income from expenses instead of reporting the difference alone', () => {
        const s = summariseMonth([t('a', '2026-01-02', -30_00), t('b', '2026-01-03', 500_00), t('c', '2026-02-01', -1_00)], '2026-01');
        expect(s).toEqual({ month: '2026-01', income: 500_00, expenses: 30_00, net: 470_00, count: 2 });
    });

    it('an empty month is zeros, not a missing result', () => {
        expect(summariseMonth([], '2026-03')).toEqual({ month: '2026-03', income: 0, expenses: 0, net: 0, count: 0 });
    });

    it('groups expenses by category, largest first', () => {
        const result = byCategory([
            t('a', '2026-01-02', -30_00, 'food'),
            t('b', '2026-01-03', -70_00, 'home'),
            t('c', '2026-01-04', -20_00, 'food'),
            t('d', '2026-01-05', 900_00, 'salary'),   // income is not an expense
            t('e', '2026-01-06', -5_00),              // no category
        ]);
        expect(result).toEqual([
            { categoryId: 'home', total: 70_00 },
            { categoryId: 'food', total: 50_00 },
            { categoryId: 'no-category', total: 5_00 },
        ]);
    });

    it('budget progress says how much is left — and whether the cap was exceeded', () => {
        const b: Budget = { month: '2026-01', categoryId: 'food', limit: 100_00 };
        const p = budgetProgress(b, [t('a', '2026-01-02', -30_00, 'food'), t('b', '2026-01-03', -90_00, 'food')]);
        expect(p).toEqual({ categoryId: 'food', limit: 100_00, spent: 120_00, remaining: -20_00, exceeded: true });
    });

    it('a budget counts only its own month and its own category', () => {
        const b: Budget = { month: '2026-01', categoryId: 'food', limit: 100_00 };
        const p = budgetProgress(b, [
            t('a', '2026-02-02', -30_00, 'food'),  // another month
            t('b', '2026-01-03', -40_00, 'home'),  // another category
        ]);
        expect(p.spent).toBe(0);
        expect(p.exceeded).toBe(false);
    });
});
