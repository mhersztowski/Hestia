/**
 * Recognising a double tap.
 *
 * Two taps count as one gesture when they arrive close together in time and in
 * place. Both limits matter: without the time limit two deliberate taps a
 * minute apart would count, and without the distance limit tapping two
 * neighbouring shapes quickly would open the second one's label from the first
 * one's tap.
 *
 * The rule is here rather than written out at each of its uses because it has
 * two of them — the double tap that opens a shape's label, and the one that
 * removes a vertex from a line — and a rule written twice is a rule that will
 * differ.
 */

/**
 * How long two taps may be apart.
 *
 * 450 ms rather than the 320 ms this used to be: a pen on an e-ink reader
 * (where this page is mostly used) is not as quick as a mouse, and a double tap
 * that is a few tens of milliseconds too slow does not fail visibly — it selects
 * the shape, again, and nothing explains why the label never opened.
 */
export const DOUBLE_TAP_MS = 450;

/** A tap: when and where. */
export interface Tap {
    t: number;
    x: number;
    y: number;
}

/**
 * Whether `now` continues `last` as a double tap. `tol` is how far the second
 * tap may land from the first, in the same units as the coordinates.
 */
export function isDoubleTap(last: Tap | null, now: Tap, tol: number): boolean {
    if (!last) return false;
    if (now.t - last.t >= DOUBLE_TAP_MS) return false;
    return Math.hypot(now.x - last.x, now.y - last.y) < tol;
}
