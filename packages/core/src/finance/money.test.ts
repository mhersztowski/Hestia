import { describe, it, expect } from 'vitest';
import { toMinorUnits, toMajorUnits, formatAmount, sumMinorUnits } from './money';

describe('amounts', () => {
    it('major units come in as minor units, with no rounding error', () => {
        expect(toMinorUnits('12,34')).toBe(1234);
        expect(toMinorUnits('12.34')).toBe(1234);
        expect(toMinorUnits(12.34)).toBe(1234);
        // 0.1 + 0.2 in floating point is 0.30000000000000004; that is why
        // amounts live in this repository as whole minor units.
        expect(toMinorUnits(0.1) + toMinorUnits(0.2)).toBe(toMinorUnits(0.3));
    });

    it('accepts a decimal comma, because that is how the bank and the user write it', () => {
        expect(toMinorUnits('-1 234,50')).toBe(-123450);
        expect(toMinorUnits('1 234,50')).toBe(123450); // non-breaking space from a statement
    });

    it('rounds the third decimal digit — but only from the text form', () => {
        // From text the value is exact, so "up" means up.
        expect(toMinorUnits('1,005')).toBe(101);
        expect(toMinorUnits('-1,005')).toBe(-101);
        // The same amount as a number is already 1.00499999999999989 and no
        // function will recover 1.005 from it — which is why amounts from the
        // bank are parsed from text.
        expect(toMinorUnits(1.005)).toBe(100);
    });

    it('rejects what it cannot read', () => {
        expect(() => toMinorUnits('nonsense')).toThrow();
        expect(() => toMinorUnits(Number.NaN)).toThrow();
    });

    it('converts back to major units', () => {
        expect(toMajorUnits(123450)).toBe(1234.5);
    });

    it('formats in the local notation, with the currency', () => {
        // The thousands separator is not asserted: it depends on the ICU data in
        // the environment rather than on us — testing it would catch the Node
        // version, not a defect.
        expect(formatAmount(123450)).toMatch(/234,50\s*zł$/);
        expect(formatAmount(-500)).toMatch(/^-5,00\s*zł$/);
    });

    it('sums without an intermediate conversion to major units', () => {
        expect(sumMinorUnits([10, 20, -5])).toBe(25);
        expect(sumMinorUnits([])).toBe(0);
    });
});
