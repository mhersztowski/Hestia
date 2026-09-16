/**
 * Sample data — created only when the store is empty.
 *
 * The reason is practical: a freshly installed application with an empty list
 * says nothing about what a working one looks like. The "empty store" condition
 * (rather than "no file") matters: the file appears on the first write, and
 * otherwise the samples would come back every time the user clears their data.
 */

import { toMinorUnits, type Data } from '@hestia/core';

export function seedData(): Data {
  const today = new Date();
  const month = today.toISOString().slice(0, 7);
  const day = (d: number) => `${month}-${String(d).padStart(2, '0')}`;

  return {
    accounts: [
      {
        id: 'personal-account',
        name: 'Personal account',
        kind: 'personal',
        openingBalance: toMinorUnits('3 200,00'),
      },
      {
        id: 'savings',
        name: 'Rainy day fund',
        kind: 'savings',
        openingBalance: toMinorUnits('12 000,00'),
      },
    ],
    categories: [
      { id: 'home', name: 'Home', color: '#2563eb' },
      { id: 'food', name: 'Food', color: '#16a34a' },
      { id: 'transport', name: 'Transport', color: '#f59e0b' },
      { id: 'salary', name: 'Salary', color: '#7c3aed' },
    ],
    transactions: [
      {
        id: 't1',
        date: day(1),
        amount: toMinorUnits('8 400,00'),
        description: 'Salary',
        accountId: 'personal-account',
        categoryId: 'salary',
      },
      {
        id: 't2',
        date: day(2),
        amount: toMinorUnits('-2 150,00'),
        description: 'Rent',
        accountId: 'personal-account',
        categoryId: 'home',
      },
      {
        id: 't3',
        date: day(3),
        amount: toMinorUnits('-312,45'),
        description: 'Weekly shopping',
        accountId: 'personal-account',
        categoryId: 'food',
      },
      {
        id: 't4',
        date: day(5),
        amount: toMinorUnits('-249,99'),
        description: 'Fuel',
        accountId: 'personal-account',
        categoryId: 'transport',
      },
      {
        id: 't5',
        date: day(7),
        amount: toMinorUnits('-98,20'),
        description: 'Bakery and greengrocer',
        accountId: 'personal-account',
        categoryId: 'food',
      },
      {
        id: 't6',
        date: day(10),
        amount: toMinorUnits('-1 000,00'),
        description: 'Transfer to the fund',
        accountId: 'personal-account',
      },
      {
        id: 't7',
        date: day(10),
        amount: toMinorUnits('1 000,00'),
        description: 'Deposit from the personal account',
        accountId: 'savings',
      },
    ],
    budgets: [
      { month, categoryId: 'food', limit: toMinorUnits('1 500,00') },
      { month, categoryId: 'transport', limit: toMinorUnits('400,00') },
    ],
  };
}
