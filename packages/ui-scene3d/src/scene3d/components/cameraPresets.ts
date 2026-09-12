import { MOUSE } from 'three';
import type { CameraPresetName, CameraPresetConfig } from '../sceneTypes';

export const CAMERA_PRESETS: Record<CameraPresetName, CameraPresetConfig> = {
  standard: {
    label: 'Standard',
    description: 'Left=Rotate, Middle=Dolly, Right=Pan',
    mouseButtons: {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    },
  },
  blender: {
    label: 'Blender',
    description: 'Middle=Rotate, Right=Pan',
    mouseButtons: {
      LEFT: null,
      MIDDLE: MOUSE.ROTATE,
      RIGHT: MOUSE.PAN,
    },
  },
  maya: {
    label: 'Maya',
    description: 'Left=Rotate, Middle=Pan, Right=Dolly',
    mouseButtons: {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.PAN,
      RIGHT: MOUSE.DOLLY,
    },
  },
  cad: {
    // LEFT rotates so single-pointer devices (pen / stylus on mobile, which the
    // browser routes through the mouse-LEFT path) can orbit the camera; a click
    // still selects (GpuPicker ignores drags). Right also rotates, middle pans.
    label: 'CAD',
    description: 'Left/Right=Rotate, Middle=Pan',
    mouseButtons: {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.PAN,
      RIGHT: MOUSE.ROTATE,
    },
  },
};
