export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step';

export interface Keyframe {
  id: string;
  time: number;
  value: number | string | boolean;
  easing: EasingType;
}

export interface AnimationTrack {
  id: string;
  nodeId: string;
  /** Dot-separated property path: 'position.x', 'rotation.y', 'material.color', 'light.intensity', 'visible' */
  property: string;
  keyframes: Keyframe[];
}

export interface AnimationClip {
  id: string;
  name: string;
  duration: number;
  tracks: AnimationTrack[];
}
