/**
 * A month as the text `YYYY-MM`.
 *
 * No `Date` objects: `new Date('2026-01-31')` is midnight UTC, so in a negative
 * offset it comes out as 30 January, and when adding months `setMonth` on the
 * 31st jumps by two. Arithmetic on a month count has neither problem — and
 * `YYYY-MM` sorts lexicographically, so it is more convenient anyway.
 */

/** The current month in the user's local time. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** The month shifted by `by` (negative goes back), across a year boundary too. */
export function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number);
  // Counted in months from zero, so the year boundary falls out of the division.
  const total = year * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const NAMES = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** "January 2026" — for the header. */
export function monthName(month: string): string {
  const [year, m] = month.split('-').map(Number);
  // Day 15, so that no time zone shifts the date into a neighbouring month.
  return NAMES.format(new Date(year, m - 1, 15));
}
