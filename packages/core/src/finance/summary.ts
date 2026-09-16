/**
 * Computation over transactions — pure functions, no I/O.
 *
 * Everything here works on minor units and on dates as **text** in ISO
 * notation. Both choices are deliberate and explained below: the point is that
 * the total matches the bank, and that a transaction from 31 January does not
 * fall into December.
 */

import type { Account, Budget, Transaction } from './model';
import { sumMinorUnits, type MinorUnits } from './money';

/** The "no category" label — one of them, so the UI does not grow three. */
export const NO_CATEGORY = 'no-category';

/** Account balance: the opening balance plus every movement on it. */
export function accountBalance(account: Account, transactions: readonly Transaction[]): MinorUnits {
  return (
    account.openingBalance +
    sumMinorUnits(transactions.filter((t) => t.accountId === account.id).map((t) => t.amount))
  );
}

/**
 * A transaction's month as `YYYY-MM` — cut out of the date text.
 *
 * Deliberately without `new Date`: `new Date('2026-01-31')` is midnight UTC, so
 * in a negative offset `getMonth()` reports December and a transaction from the
 * last day of the month lands in the previous report. ISO notation carries the
 * month directly.
 */
export function transactionMonth(t: Transaction): string {
  return t.date.slice(0, 7);
}

export interface MonthSummary {
  month: string;
  /** Total of inflows (positive). */
  income: MinorUnits;
  /** Total of outflows as a **positive** number — that is how a report reads. */
  expenses: MinorUnits;
  /** Income minus expenses; a negative net means the month ran at a loss. */
  net: MinorUnits;
  count: number;
}

/**
 * Summary of a month.
 *
 * Income and expenses separately rather than the difference alone: "it came out
 * even" means one thing on a hundred-unit turnover and another on ten thousand.
 */
export function summariseMonth(transactions: readonly Transaction[], month: string): MonthSummary {
  const selected = transactions.filter((t) => transactionMonth(t) === month);
  const income = sumMinorUnits(selected.filter((t) => t.amount > 0).map((t) => t.amount));
  // The sign is flipped per item rather than at the end: `-0` from an empty
  // sum is not the same as `0` to `Object.is`, and that comparison sits in
  // every test.
  const expenses = sumMinorUnits(selected.filter((t) => t.amount < 0).map((t) => -t.amount));
  return { month, income, expenses, net: income - expenses, count: selected.length };
}

export interface CategoryTotal {
  categoryId: string;
  /** The expense as a positive number. */
  total: MinorUnits;
}

/**
 * Expenses broken down by category, largest first.
 *
 * Income is skipped on purpose: in one column with expenses it would zero out
 * the category that happened to receive a refund, making it look as though
 * nothing had been spent there.
 */
export function byCategory(transactions: readonly Transaction[]): CategoryTotal[] {
  const totals = new Map<string, MinorUnits>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const key = t.categoryId ?? NO_CATEGORY;
    totals.set(key, (totals.get(key) ?? 0) + -t.amount);
  }
  return (
    [...totals.entries()]
      .map(([categoryId, total]) => ({ categoryId, total }))
      // Ties are broken by identifier so the order is stable between runs;
      // Polish collation, because category names come from the user.
      .sort((a, b) => b.total - a.total || a.categoryId.localeCompare(b.categoryId, 'pl'))
  );
}

export interface BudgetProgress {
  categoryId: string;
  limit: MinorUnits;
  spent: MinorUnits;
  /** How much may still be spent; negative means the cap was exceeded. */
  remaining: MinorUnits;
  exceeded: boolean;
}

/** How much of the cap was spent in the month the budget applies to. */
export function budgetProgress(
  budget: Budget,
  transactions: readonly Transaction[]
): BudgetProgress {
  const spent = sumMinorUnits(
    transactions
      .filter(
        (t) =>
          t.amount < 0 &&
          transactionMonth(t) === budget.month &&
          (t.categoryId ?? NO_CATEGORY) === budget.categoryId
      )
      .map((t) => -t.amount)
  );
  const remaining = budget.limit - spent;
  return {
    categoryId: budget.categoryId,
    limit: budget.limit,
    spent,
    remaining,
    exceeded: remaining < 0,
  };
}
