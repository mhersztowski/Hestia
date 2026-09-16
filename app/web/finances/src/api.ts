/**
 * Talking to the backend.
 *
 * A thin, stateless layer — the state lives in the components. The types come
 * from `@hestia/core`, so the shape of the data is **the same** on both sides:
 * when the model changes, both the server and the browser stop compiling.
 */

import type { Account, Transaction, Category } from '@hestia/core';

export interface AccountWithBalance extends Account {
  balance: number;
}

export interface CategoryTotalWithName {
  categoryId: string;
  total: number;
  name: string;
  color?: string;
}

export interface BudgetProgressWithName {
  categoryId: string;
  name: string;
  limit: number;
  spent: number;
  remaining: number;
  exceeded: boolean;
}

export interface Summary {
  month: string;
  summary: { month: string; income: number; expenses: number; net: number; count: number };
  categories: CategoryTotalWithName[];
  accounts: AccountWithBalance[];
  budgets: BudgetProgressWithName[];
}

async function ask<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server's message carries the reason (no such account, wrong
    // format) — losing it leaves the user with "something went wrong".
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  summary: (month: string) => ask<Summary>(`/summary?month=${month}`),
  transactions: (month: string) => ask<Transaction[]>(`/transactions?month=${month}`),
  categories: () => ask<Category[]>('/categories'),
  addTransaction: (t: Omit<Transaction, 'id'>) =>
    ask<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(t) }),
  deleteTransaction: (id: string) =>
    ask<{ ok: boolean }>(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
