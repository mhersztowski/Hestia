import { describe, it, expect } from 'vitest';
import { currentMonth, shiftMonth, monthName } from './months';

describe('months', () => {
    it('shifts within a year', () => {
        expect(shiftMonth('2026-03', -1)).toBe('2026-02');
        expect(shiftMonth('2026-03', 1)).toBe('2026-04');
    });

    it('crosses the year boundary both ways', () => {
        // The most common bug in this function: January minus one gives `2026-00`.
        expect(shiftMonth('2026-01', -1)).toBe('2025-12');
        expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    });

    it('shifts by more than a year', () => {
        expect(shiftMonth('2026-05', -17)).toBe('2024-12');
    });

    it('the current month has the shape YYYY-MM', () => {
        expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
    });

    it('the month name is spelled out, with the year', () => {
        expect(monthName('2026-01')).toMatch(/januar/i);
        expect(monthName('2026-01')).toMatch(/2026/);
    });
});
