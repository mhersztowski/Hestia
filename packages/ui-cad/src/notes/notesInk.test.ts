import { describe, it, expect } from 'vitest';
import { isLightColor, defaultInkFor, needsInkSwitch } from './notesInk';

describe('isLightColor', () => {
  it('tells light and dark backgrounds apart', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#fef3c7')).toBe(true);   // "Paper"
    expect(isLightColor('#000000')).toBe(false);
    expect(isLightColor('#1a1a1a')).toBe(false);
  });

  it('weighs the components by brightness, not by the average', () => {
    // Pure blue and pure green have the same average yet differ in brightness by
    // an order of magnitude — a white pen is legible on the blue, not on the green.
    expect(isLightColor('#0000ff')).toBe(false);
    expect(isLightColor('#00ff00')).toBe(true);
  });

  it('a value that is not a colour counts as dark', () => {
    // `transparent` and shorthand forms arrive here from the user's settings;
    // guessing "dark" gives a white pen, i.e. one visible on the default background.
    expect(isLightColor('transparent')).toBe(false);
    expect(isLightColor('#fff')).toBe(false);
  });
});

describe('defaultInkFor', () => {
  it('on a light background the pen is black', () => {
    expect(defaultInkFor('#ffffff')).toBe('#000000');
    expect(defaultInkFor('#fef3c7')).toBe('#000000');
  });

  it('on a dark background the pen is white', () => {
    expect(defaultInkFor('#000000')).toBe('#ffffff');
    expect(defaultInkFor('#1a1a1a')).toBe('#ffffff');
  });
});

describe('needsInkSwitch', () => {
  it('a pen invisible on the new background needs changing', () => {
    expect(needsInkSwitch('#ffffff', '#ffffff')).toBe(true);   // white on white
    expect(needsInkSwitch('#1a1a1a', '#000000')).toBe(true);   // black on black
  });

  it('a legible pen is left untouched', () => {
    expect(needsInkSwitch('#ffffff', '#000000')).toBe(false);
    expect(needsInkSwitch('#ef4444', '#ffffff')).toBe(false);  // red on white
  });

  it('a transparent pen is not touched', () => {
    // "No outline" is the user's choice, not a colour that could vanish against
    // the background. Replacing it would turn the setting into something unasked for.
    expect(needsInkSwitch('transparent', '#000000')).toBe(false);
    expect(needsInkSwitch('transparent', '#ffffff')).toBe(false);
  });
});
