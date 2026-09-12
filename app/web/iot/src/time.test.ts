import { describe, it, expect } from 'vitest';
import { howLongAgo } from './time';

describe('howLongAgo', () => {
    const now = 1_000_000_000;
    it('no signal is "never", not 56 years ago', () => {
        // `lastSeen === 0` means "it never spoke", not the Unix epoch.
        expect(howLongAgo(0, now)).toBe('never');
    });
    it('seconds, minutes, hours and days', () => {
        expect(howLongAgo(now - 5_000, now)).toBe('5 s ago');
        expect(howLongAgo(now - 120_000, now)).toBe('2 min ago');
        expect(howLongAgo(now - 7_200_000, now)).toBe('2 h ago');
        expect(howLongAgo(now - 172_800_000, now)).toBe('2 days ago');
    });
    it('a time from the future does not give negative seconds', () => {
        // A device's clock is sometimes off — "-3 s ago" looks like a page bug.
        expect(howLongAgo(now + 5_000, now)).toBe('0 s ago');
    });
});
