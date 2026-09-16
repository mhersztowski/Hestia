import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpServer, JsonStore } from '@hestia/node-core';
import { Data, emptyData, toMinorUnits } from '@hestia/core';
import { registerApi } from './api';

/** The server and the store are stood up for real — port 0, temporary directory. */
describe('finance API', () => {
  let server: HttpServer;
  let port: number;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'hestia-api-'));
    const store = new JsonStore(join(dir, 'finances.json'), Data, emptyData);
    server = new HttpServer({ port: 0, host: '127.0.0.1' });
    registerApi(server, store);
    port = await server.start();
  });

  afterEach(async () => {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  const ask = async (path: string, init?: RequestInit) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    return { status: r.status, body: (await r.json()) as any };
  };
  const send = (path: string, method: string, data: unknown) =>
    ask(path, { method, body: JSON.stringify(data) });

  it('an empty store returns empty lists, not an error', async () => {
    expect((await ask('/api/accounts')).body).toEqual([]);
    expect((await ask('/api/transactions')).body).toEqual([]);
  });

  it('creates an account and computes its balance from the transactions', async () => {
    const account = (
      await send('/api/accounts', 'POST', {
        name: 'Current',
        kind: 'personal',
        openingBalance: toMinorUnits('100,00'),
      })
    ).body;
    await send('/api/transactions', 'POST', {
      date: '2026-01-05',
      amount: toMinorUnits('-30,00'),
      description: 'Shopping',
      accountId: account.id,
    });

    const accounts = (await ask('/api/accounts')).body;
    expect(accounts[0].balance).toBe(toMinorUnits('70,00'));
  });

  it('refuses a transaction on an account that does not exist', async () => {
    // Otherwise the money disappears from view: the transaction is in the
    // file, but no balance counts it, because the account it belongs to is
    // not there.
    const r = await send('/api/transactions', 'POST', {
      date: '2026-01-05',
      amount: -100,
      description: '',
      accountId: 'nowhere',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/nowhere/);
  });

  it('rejects data that does not match the schema', async () => {
    const r = await send('/api/transactions', 'POST', {
      date: '5 January',
      amount: 'a lot',
      accountId: 'a',
    });
    expect(r.status).toBe(500); // ZodError without a code of its own — but it does not get through
    expect((await ask('/api/transactions')).body).toEqual([]);
  });

  it('filters transactions by month and sorts newest first', async () => {
    const account = (await send('/api/accounts', 'POST', { name: 'A', kind: 'personal' })).body;
    for (const date of ['2026-01-05', '2026-01-20', '2026-02-01']) {
      await send('/api/transactions', 'POST', {
        date,
        amount: -100,
        description: date,
        accountId: account.id,
      });
    }
    const january = (await ask('/api/transactions?month=2026-01')).body;
    expect(january.map((t: any) => t.date)).toEqual(['2026-01-20', '2026-01-05']);
  });

  it('changes and deletes a transaction', async () => {
    const account = (await send('/api/accounts', 'POST', { name: 'A', kind: 'personal' })).body;
    const t = (
      await send('/api/transactions', 'POST', {
        date: '2026-01-05',
        amount: -100,
        description: 'old',
        accountId: account.id,
      })
    ).body;

    expect(
      (await send(`/api/transactions/${t.id}`, 'PUT', { description: 'new' })).body.description
    ).toBe('new');
    expect((await ask(`/api/transactions/${t.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await ask('/api/transactions')).body).toEqual([]);
  });

  it('changing a transaction that does not exist is a 404', async () => {
    expect((await send('/api/transactions/nowhere', 'PUT', { description: 'x' })).status).toBe(404);
    expect((await ask('/api/transactions/nowhere', { method: 'DELETE' })).status).toBe(404);
  });

  it('the summary gives everything for one screen at once', async () => {
    const account = (
      await send('/api/accounts', 'POST', { name: 'A', kind: 'personal', openingBalance: 0 })
    ).body;
    await send('/api/categories', 'POST', { name: 'Food' });
    const category = (await ask('/api/categories')).body[0];
    await send('/api/transactions', 'POST', {
      date: '2026-01-05',
      amount: toMinorUnits('-120,00'),
      description: 'Shopping',
      accountId: account.id,
      categoryId: category.id,
    });
    await send('/api/transactions', 'POST', {
      date: '2026-01-06',
      amount: toMinorUnits('500,00'),
      description: 'Inflow',
      accountId: account.id,
    });

    const s = (await ask('/api/summary?month=2026-01')).body;
    expect(s.summary).toEqual({
      month: '2026-01',
      income: 50000,
      expenses: 12000,
      net: 38000,
      count: 2,
    });
    expect(s.categories).toEqual([
      { categoryId: category.id, total: 12000, name: 'Food', color: undefined },
    ]);
    expect(s.accounts[0].balance).toBe(toMinorUnits('380,00'));
  });

  it('with no month given it takes the current one', async () => {
    const now = new Date().toISOString().slice(0, 7);
    expect((await ask('/api/summary')).body.month).toBe(now);
  });
});
