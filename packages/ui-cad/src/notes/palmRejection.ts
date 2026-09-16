/**
 * Palm rejection — whether a finger draws, or only moves the view.
 *
 * Writing with an S Pen means resting a hand on the screen, and that hand
 * arrives as ordinary touch pointers. Without this rule it drew, and the page
 * filled with marks nobody made. Rejecting touch outright is not the answer
 * either: on a tablet without a pen a finger is the only thing there is.
 *
 * So the pen's presence decides, and it decides for a while rather than for the
 * instant of contact: the palm usually lands before the nib does, and it stays
 * down between words. Any pen event — a contact, and hovering too, which an S
 * Pen reports from a centimetre away — refreshes the moment. While it is fresh,
 * touch pans and zooms but does not draw; once the pen has been away for
 * `PALM_WINDOW_MS`, a finger draws again.
 *
 * The rule is here, apart from the page, because it is the part worth being
 * sure of: the rest is attaching it to pointer events.
 */

/**
 * How long after the pen was last seen a finger still does not draw.
 *
 * Long enough to cover lifting the pen off the page and setting the hand down
 * again; short enough that putting the pen away and reaching in with a finger
 * works without waiting for it.
 */
export const PALM_WINDOW_MS = 1500;

/** Whether the pen has been seen recently enough to take drawing away from touch. */
export function penIsAbout(lastPenAt: number, now: number): boolean {
  // `0` means it has never been seen — a tablet with no pen, where a finger
  // has to keep drawing.
  if (lastPenAt <= 0) return false;
  return now - lastPenAt < PALM_WINDOW_MS;
}

/** What a finger touching the page should do. */
export function touchRole(lastPenAt: number, now: number): 'draw' | 'pan' {
  return penIsAbout(lastPenAt, now) ? 'pan' : 'draw';
}
