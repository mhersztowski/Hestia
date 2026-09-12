import { describe, expect, it } from 'vitest';
import { PALM_WINDOW_MS, penIsAbout, touchRole } from './palmRejection';

const NOW = 1_000_000;

describe('palm rejection', () => {
    it('a finger draws when no pen has ever been seen', () => {
        // A tablet without a pen: rejecting touch here would leave nothing to
        // draw with at all.
        expect(penIsAbout(0, NOW)).toBe(false);
        expect(touchRole(0, NOW)).toBe('draw');
    });

    it('a finger stops drawing while the pen is in play', () => {
        expect(touchRole(NOW, NOW)).toBe('pan');
        expect(touchRole(NOW - 500, NOW)).toBe('pan');
    });

    it('the pen keeps its hold across a gap between words', () => {
        // Lifting the nib and setting the hand down again must not turn the palm
        // back into something that draws.
        expect(touchRole(NOW - (PALM_WINDOW_MS - 1), NOW)).toBe('pan');
    });

    it('a finger draws again once the pen has been away', () => {
        expect(touchRole(NOW - PALM_WINDOW_MS, NOW)).toBe('draw');
        expect(touchRole(NOW - 10_000, NOW)).toBe('draw');
    });
});
