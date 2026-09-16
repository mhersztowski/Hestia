/**
 * Amounts in Hestia are a **whole number of minor units** (grosze).
 *
 * Not out of pedantry: `0.1 + 0.2 !== 0.3` in floating point, so the total of a
 * statement with a few hundred rows can drift from the bank by one unit — and
 * that is exactly the kind of difference nobody can explain afterwards. Major
 * units appear only on the way in (from the user, from the bank) and on the way
 * out (for display).
 */

/** Minor units — a whole number; negative means an expense. */
export type MinorUnits = number;

/**
 * Converts written amounts into minor units.
 *
 * Accepts both a dot and a comma as the decimal mark, plus thousands spaces —
 * including the non-breaking one that bank statements and spreadsheets insert.
 */
export function toMinorUnits(amount: string | number): MinorUnits {
  if (typeof amount === 'string') return fromText(amount);
  if (!Number.isFinite(amount)) throw new Error(`Cannot read amount: ${String(amount)}`);
  // Round away from zero in both directions: `Math.round(-1.5)` gives -1,
  // i.e. an expense quietly smaller than the one in the bank.
  const hundredths = amount * 100;
  return Math.sign(hundredths) * Math.round(Math.abs(hundredths));
}

/**
 * Parsing from text — digit by digit, without going through `Number`.
 *
 * Amounts from a statement or a form arrive as text, and there the value is
 * exact. `Number('1,005'.replace(',', '.')) * 100` gives 100.49999999999999, so
 * the last unit disappears in rounding — and a one-unit difference from the
 * bank is an hour of hunting for where it came from.
 */
function fromText(written: string): MinorUnits {
  const cleaned = written.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!m || (!m[2] && !m[3])) throw new Error(`Cannot read amount: ${written}`);
  const sign = m[1] === '-' ? -1 : 1;
  const whole = m[2] ? Number(m[2]) : 0;
  const fraction = (m[3] ?? '').padEnd(3, '0');
  const hundredths = Number(fraction.slice(0, 2));
  // The third digit decides the rounding — a statement never carries more.
  const roundUp = Number(fraction[2]) >= 5 ? 1 : 0;
  return sign * (whole * 100 + hundredths + roundUp);
}

/** Minor units → major units; for display or export only. */
export function toMajorUnits(minor: MinorUnits): number {
  return minor / 100;
}

/*
 * The locale and the currency stay Polish while the code does not: this is the
 * money the household actually keeps, so `1 234,56 zł` is the correct output
 * regardless of what language the source is written in.
 */
const FORMAT = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });

/** An amount written the way the user's bank writes it, with the currency. */
export function formatAmount(minor: MinorUnits): string {
  return FORMAT.format(toMajorUnits(minor));
}

/** Sum of amounts — over minor units, so no rounding error creeps in. */
export function sumMinorUnits(amounts: readonly MinorUnits[]): MinorUnits {
  return amounts.reduce((a, b) => a + b, 0);
}
