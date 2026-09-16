import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, isDoubleTap } from './doubleTap';

const at = (t: number, x = 100, y = 100) => ({ t, x, y });
const TOL = 30;

describe('recognising a double tap', () => {
  it('needs a first tap', () => {
    expect(isDoubleTap(null, at(0), TOL)).toBe(false);
  });

  it('two quick taps in the same place are one gesture', () => {
    expect(isDoubleTap(at(0), at(200), TOL)).toBe(true);
  });

  it('leaves room for a pen on an e-ink reader', () => {
    // The old 320 ms window failed here, and it failed invisibly: the shape
    // was selected again and nothing said why the label had not opened.
    expect(isDoubleTap(at(0), at(400), TOL)).toBe(true);
    expect(isDoubleTap(at(0), at(DOUBLE_TAP_MS), TOL)).toBe(false);
  });

  it('two taps far apart are two taps, however quick', () => {
    // Tapping one shape and then its neighbour must not open the second
    // one's label from the first one's tap.
    expect(isDoubleTap(at(0, 100, 100), at(50, 200, 100), TOL)).toBe(false);
    expect(isDoubleTap(at(0, 100, 100), at(50, 120, 120), TOL)).toBe(true);
  });
});
