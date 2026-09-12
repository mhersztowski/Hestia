import type { AnimationClip, AnimationTrack, Keyframe, EasingType } from './types';

function applyEasing(t: number, easing: EasingType): number {
  switch (easing) {
    case 'ease-in': return t * t;
    case 'ease-out': return 1 - (1 - t) * (1 - t);
    case 'ease-in-out': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'step': return 0;
    default: return t;
  }
}

function parseHex(hex: string): [number, number, number] {
  const c = hex.replace('#', '').padEnd(6, '0');
  return [parseInt(c.slice(0, 2), 16) || 0, parseInt(c.slice(2, 4), 16) || 0, parseInt(c.slice(4, 6), 16) || 0];
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function lerp(a: number | string | boolean, b: number | string | boolean, t: number): number | string | boolean {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (typeof a === 'string' && typeof b === 'string' && a.startsWith('#') && b.startsWith('#')) {
    const [ar, ag, ab] = parseHex(a);
    const [br, bg, bb] = parseHex(b);
    return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
  }
  return t < 0.5 ? a : b;
}

export class AnimationEngine {
  /** Evaluate a single track at the given time. Returns null if no keyframes. */
  static evaluateTrack(track: AnimationTrack, time: number): number | string | boolean | null {
    const kfs = [...track.keyframes].sort((a, b) => a.time - b.time);
    if (kfs.length === 0) return null;
    if (time <= kfs[0].time) return kfs[0].value;
    if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

    let lo = 0;
    while (lo < kfs.length - 1 && kfs[lo + 1].time <= time) lo++;
    const a = kfs[lo];
    const b = kfs[lo + 1];

    if (a.easing === 'step') return a.value;
    const span = b.time - a.time;
    const rawT = span === 0 ? 0 : (time - a.time) / span;
    return lerp(a.value, b.value, applyEasing(rawT, a.easing));
  }

  /** Evaluate all tracks and return a nested map: nodeId → { property → value }. */
  static evaluate(clip: AnimationClip, time: number): Map<string, Record<string, number | string | boolean>> {
    const result = new Map<string, Record<string, number | string | boolean>>();
    for (const track of clip.tracks) {
      const value = this.evaluateTrack(track, time);
      if (value === null) continue;
      let nodeMap = result.get(track.nodeId);
      if (!nodeMap) { nodeMap = {}; result.set(track.nodeId, nodeMap); }
      nodeMap[track.property] = value;
    }
    return result;
  }

  /** Insert or update a keyframe at the given time on a track (returns updated track). */
  static setKeyframe(
    track: AnimationTrack,
    time: number,
    value: number | string | boolean,
    easing: EasingType = 'linear',
  ): AnimationTrack {
    const roundedTime = Math.round(time * 1000) / 1000;
    const existing = track.keyframes.find(k => Math.abs(k.time - roundedTime) < 0.0005);
    if (existing) {
      return { ...track, keyframes: track.keyframes.map(k => k.id === existing.id ? { ...k, value, easing } : k) };
    }
    const kf: Keyframe = { id: crypto.randomUUID(), time: roundedTime, value, easing };
    return { ...track, keyframes: [...track.keyframes, kf].sort((a, b) => a.time - b.time) };
  }

  /** Remove a keyframe by id. */
  static removeKeyframe(track: AnimationTrack, keyframeId: string): AnimationTrack {
    return { ...track, keyframes: track.keyframes.filter(k => k.id !== keyframeId) };
  }

  /** Get or create a track for (nodeId, property). Returns new clip + the track. */
  static getOrCreateTrack(
    clip: AnimationClip,
    nodeId: string,
    property: string,
  ): { clip: AnimationClip; track: AnimationTrack } {
    const existing = clip.tracks.find(t => t.nodeId === nodeId && t.property === property);
    if (existing) return { clip, track: existing };
    const track: AnimationTrack = { id: crypto.randomUUID(), nodeId, property, keyframes: [] };
    return { clip: { ...clip, tracks: [...clip.tracks, track] }, track };
  }

  /** Replace a track in the clip (matched by id). */
  static updateTrack(clip: AnimationClip, updated: AnimationTrack): AnimationClip {
    const has = clip.tracks.some(t => t.id === updated.id);
    if (has) return { ...clip, tracks: clip.tracks.map(t => t.id === updated.id ? updated : t) };
    return { ...clip, tracks: [...clip.tracks, updated] };
  }

  /** Remove a track by id. */
  static removeTrack(clip: AnimationClip, trackId: string): AnimationClip {
    return { ...clip, tracks: clip.tracks.filter(t => t.id !== trackId) };
  }

  /** Create a default empty clip. */
  static createClip(name = 'Clip', duration = 5): AnimationClip {
    return { id: crypto.randomUUID(), name, duration, tracks: [] };
  }
}
