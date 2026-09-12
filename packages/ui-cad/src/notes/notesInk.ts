/**
 * Matching the pen colour to the page background.
 *
 * There is one rule and it has to apply at three moments: when the application
 * starts, when the page background changes and when a saved file is opened.
 * Written out separately in each of them it drifted exactly the way these
 * things do — the pen started white regardless of the restored page having a
 * white background, so the first stroke after startup was invisible and looked
 * like broken drawing.
 */

/** The colour value meaning "no outline". */
const TRANSPARENT = 'transparent';

const INK_ON_LIGHT = '#000000';
const INK_ON_DARK = '#ffffff';

/**
 * Whether a colour is light enough for a black pen to be legible on it.
 *
 * The threshold is computed from perceived brightness (component weights
 * 299/587/114) rather than the channel average: pure blue and pure green have
 * the same average yet differ in legibility so much that white text is crisp on
 * one and unreadable on the other.
 *
 * Anything that cannot be read as `#rrggbb` — including `transparent` and the
 * shorthand form — counts as dark, because the guess "a white pen" is visible
 * on the application's default background.
 */
export function isLightColor(hex: string): boolean {
    const h = hex.replace('#', '');
    if (h.length !== 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

/** A pen colour legible on the given background. */
export function defaultInkFor(bgColor: string): string {
    return isLightColor(bgColor) ? INK_ON_LIGHT : INK_ON_DARK;
}

/**
 * Whether the pen would vanish on this background.
 *
 * The check exists so that we do **not** replace a colour the user chose
 * deliberately: red on white stays red. We only replace it when the pen and the
 * background are on the same side of the brightness threshold — that is, when
 * the stroke would be impossible to see.
 */
export function needsInkSwitch(ink: string, bgColor: string): boolean {
    if (ink === TRANSPARENT) return false;
    return isLightColor(ink) === isLightColor(bgColor);
}
