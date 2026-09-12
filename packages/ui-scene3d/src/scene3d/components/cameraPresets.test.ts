import { describe, it, expect } from 'vitest';
import { MOUSE } from 'three';
import { CAMERA_PRESETS } from './cameraPresets';

describe('CAMERA_PRESETS', () => {
  it('defines the four preset names', () => {
    expect(Object.keys(CAMERA_PRESETS).sort()).toEqual(['blender', 'cad', 'maya', 'standard']);
  });

  it('each preset has a label, description and mouseButtons', () => {
    for (const preset of Object.values(CAMERA_PRESETS)) {
      expect(typeof preset.label).toBe('string');
      expect(typeof preset.description).toBe('string');
      expect(preset.mouseButtons).toBeDefined();
    }
  });

  it('standard maps left=rotate, middle=dolly, right=pan', () => {
    const { mouseButtons } = CAMERA_PRESETS.standard;
    expect(mouseButtons.LEFT).toBe(MOUSE.ROTATE);
    expect(mouseButtons.MIDDLE).toBe(MOUSE.DOLLY);
    expect(mouseButtons.RIGHT).toBe(MOUSE.PAN);
  });

  it('blender disables the left mouse button', () => {
    expect(CAMERA_PRESETS.blender.mouseButtons.LEFT).toBeNull();
  });

  // CAD used to disable it too. It now rotates, deliberately: a stylus reaches
  // the browser through the mouse-LEFT path, and without this there is no way
  // to orbit the camera with a pen. See the comment on the preset itself.
  it('cad rotates with the left button, for single-pointer devices', () => {
    expect(CAMERA_PRESETS.cad.mouseButtons.LEFT).toBe(MOUSE.ROTATE);
  });

  it('maya maps middle=pan, right=dolly', () => {
    expect(CAMERA_PRESETS.maya.mouseButtons.MIDDLE).toBe(MOUSE.PAN);
    expect(CAMERA_PRESETS.maya.mouseButtons.RIGHT).toBe(MOUSE.DOLLY);
  });
});
