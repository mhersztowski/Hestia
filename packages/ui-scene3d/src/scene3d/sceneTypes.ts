/**
 * The handful of types this package needed from MyCastle's `ui-core`.
 *
 * `ui-core` there is ~1 800 lines of prop interfaces for an editor Hestia does
 * not have; of it, `scene3d` used exactly three declarations, all of them
 * types. Copying those three is cheaper than carrying the package, and it does
 * not leave a dependency on a UI that would never be built here.
 *
 * If the editor is ever ported, this file is the place to delete — not a second
 * definition to keep in step with the first.
 */

export type SceneBackgroundType = 'default' | 'solid';

export type SceneEnvironmentPreset =
  | 'none'
  | 'apartment'
  | 'city'
  | 'dawn'
  | 'forest'
  | 'lobby'
  | 'night'
  | 'park'
  | 'studio'
  | 'sunset'
  | 'warehouse';

export type SceneFogType = 'none' | 'linear' | 'exp2';

export interface SceneSettings {
  backgroundType: SceneBackgroundType;
  backgroundColor: string;
  environmentPreset: SceneEnvironmentPreset;
  fogType: SceneFogType;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  fogDensity: number;
}

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  backgroundType: 'default',
  backgroundColor: '#1a1a2e',
  environmentPreset: 'none',
  fogType: 'none',
  fogColor: '#aaaaaa',
  fogNear: 1,
  fogFar: 100,
  fogDensity: 0.02,
};

/**
 * Which application's mouse habits the camera follows. The names are the
 * applications', because a user who knows one of them expects its buttons —
 * a scale of our own would have to be learned before it could be chosen.
 */
export type CameraPresetName = 'standard' | 'blender' | 'maya' | 'cad';

export interface CameraPresetConfig {
  label: string;
  description: string;
  mouseButtons: {
    LEFT: number | null;
    MIDDLE: number | null;
    RIGHT: number | null;
  };
}
