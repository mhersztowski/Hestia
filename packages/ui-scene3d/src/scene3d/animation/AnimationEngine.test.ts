import { describe, it, expect } from 'vitest';
import { AnimationEngine } from './AnimationEngine';
import type { AnimationClip, AnimationTrack, Keyframe } from './types';

const kf = (id: string, time: number, value: number | string | boolean, easing: Keyframe['easing'] = 'linear'): Keyframe => ({
  id,
  time,
  value,
  easing,
});

const track = (keyframes: Keyframe[], property = 'position.x', nodeId = 'n1'): AnimationTrack => ({
  id: 't1',
  nodeId,
  property,
  keyframes,
});

describe('AnimationEngine.evaluateTrack', () => {
  it('returns null for an empty track', () => {
    expect(AnimationEngine.evaluateTrack(track([]), 0)).toBeNull();
  });

  it('clamps to first keyframe before its time', () => {
    expect(AnimationEngine.evaluateTrack(track([kf('a', 1, 10), kf('b', 2, 20)]), 0)).toBe(10);
  });

  it('clamps to last keyframe after its time', () => {
    expect(AnimationEngine.evaluateTrack(track([kf('a', 1, 10), kf('b', 2, 20)]), 5)).toBe(20);
  });

  it('linearly interpolates numbers at the midpoint', () => {
    expect(AnimationEngine.evaluateTrack(track([kf('a', 0, 0), kf('b', 2, 10)]), 1)).toBeCloseTo(5);
  });

  it('applies ease-in easing', () => {
    // t=0.5 => 0.5*0.5 = 0.25 => value = 0 + 100*0.25 = 25
    expect(AnimationEngine.evaluateTrack(track([kf('a', 0, 0, 'ease-in'), kf('b', 1, 100)]), 0.5)).toBeCloseTo(25);
  });

  it('applies ease-out easing', () => {
    // t=0.5 => 1-(0.5)^2 = 0.75 => 75
    expect(AnimationEngine.evaluateTrack(track([kf('a', 0, 0, 'ease-out'), kf('b', 1, 100)]), 0.5)).toBeCloseTo(75);
  });

  it('ease-in-out is symmetric around midpoint', () => {
    const t = track([kf('a', 0, 0, 'ease-in-out'), kf('b', 1, 100)]);
    expect(AnimationEngine.evaluateTrack(t, 0.5)).toBeCloseTo(50);
  });

  it('step easing holds the earlier keyframe value', () => {
    expect(AnimationEngine.evaluateTrack(track([kf('a', 0, 10, 'step'), kf('b', 1, 20)]), 0.9)).toBe(10);
  });

  it('interpolates hex color strings', () => {
    const result = AnimationEngine.evaluateTrack(track([kf('a', 0, '#000000'), kf('b', 1, '#ffffff')]), 0.5);
    expect(result).toBe('#808080');
  });

  it('non-numeric non-color values snap at t<0.5', () => {
    const t = track([kf('a', 0, true), kf('b', 1, false)]);
    expect(AnimationEngine.evaluateTrack(t, 0.25)).toBe(true);
    expect(AnimationEngine.evaluateTrack(t, 0.75)).toBe(false);
  });

  it('sorts unsorted keyframes before evaluating', () => {
    expect(AnimationEngine.evaluateTrack(track([kf('b', 2, 20), kf('a', 0, 0)]), 1)).toBeCloseTo(10);
  });

  it('selects the correct segment among 3 keyframes', () => {
    const t = track([kf('a', 0, 0), kf('b', 1, 10), kf('c', 2, 30)]);
    expect(AnimationEngine.evaluateTrack(t, 1.5)).toBeCloseTo(20);
  });
});

describe('AnimationEngine.evaluate', () => {
  it('produces nodeId -> property -> value map', () => {
    const clip: AnimationClip = {
      id: 'c',
      name: 'C',
      duration: 5,
      tracks: [
        track([kf('a', 0, 0), kf('b', 2, 10)], 'position.x', 'n1'),
        track([kf('c', 0, 5)], 'position.y', 'n1'),
        track([kf('d', 0, 1)], 'visible', 'n2'),
      ],
    };
    const result = AnimationEngine.evaluate(clip, 1);
    expect(result.get('n1')).toEqual({ 'position.x': 5, 'position.y': 5 });
    expect(result.get('n2')).toEqual({ visible: 1 });
  });

  it('skips tracks with no keyframes', () => {
    const clip: AnimationClip = { id: 'c', name: 'C', duration: 5, tracks: [track([], 'position.x', 'n1')] };
    expect(AnimationEngine.evaluate(clip, 0).size).toBe(0);
  });
});

describe('AnimationEngine keyframe/track mutations', () => {
  it('setKeyframe inserts a new keyframe (immutably)', () => {
    const t = track([]);
    const updated = AnimationEngine.setKeyframe(t, 1.5, 42, 'ease-in');
    expect(updated).not.toBe(t);
    expect(t.keyframes).toHaveLength(0);
    expect(updated.keyframes).toHaveLength(1);
    expect(updated.keyframes[0]).toMatchObject({ time: 1.5, value: 42, easing: 'ease-in' });
  });

  it('setKeyframe updates an existing keyframe at the same time', () => {
    const t = track([kf('a', 1, 10)]);
    const updated = AnimationEngine.setKeyframe(t, 1, 99, 'step');
    expect(updated.keyframes).toHaveLength(1);
    expect(updated.keyframes[0]).toMatchObject({ id: 'a', value: 99, easing: 'step' });
  });

  it('setKeyframe keeps keyframes sorted by time', () => {
    let t = track([kf('a', 2, 20)]);
    t = AnimationEngine.setKeyframe(t, 0.5, 5);
    expect(t.keyframes.map((k) => k.time)).toEqual([0.5, 2]);
  });

  it('removeKeyframe drops the matching id', () => {
    const t = track([kf('a', 0, 0), kf('b', 1, 1)]);
    const updated = AnimationEngine.removeKeyframe(t, 'a');
    expect(updated.keyframes.map((k) => k.id)).toEqual(['b']);
  });

  it('getOrCreateTrack returns existing track without cloning clip', () => {
    const existing = track([], 'position.x', 'n1');
    const clip: AnimationClip = { id: 'c', name: 'C', duration: 5, tracks: [existing] };
    const { clip: outClip, track: outTrack } = AnimationEngine.getOrCreateTrack(clip, 'n1', 'position.x');
    expect(outClip).toBe(clip);
    expect(outTrack).toBe(existing);
  });

  it('getOrCreateTrack creates a new track when missing', () => {
    const clip: AnimationClip = { id: 'c', name: 'C', duration: 5, tracks: [] };
    const { clip: outClip, track: outTrack } = AnimationEngine.getOrCreateTrack(clip, 'n1', 'rotation.y');
    expect(outClip).not.toBe(clip);
    expect(outClip.tracks).toHaveLength(1);
    expect(outTrack.nodeId).toBe('n1');
    expect(outTrack.property).toBe('rotation.y');
  });

  it('updateTrack replaces a track by id', () => {
    const original = track([], 'position.x');
    const clip: AnimationClip = { id: 'c', name: 'C', duration: 5, tracks: [original] };
    const modified: AnimationTrack = { ...original, keyframes: [kf('k', 0, 1)] };
    const out = AnimationEngine.updateTrack(clip, modified);
    expect(out.tracks[0].keyframes).toHaveLength(1);
  });

  it('updateTrack appends when track id is not present', () => {
    const clip: AnimationClip = { id: 'c', name: 'C', duration: 5, tracks: [] };
    const out = AnimationEngine.updateTrack(clip, track([], 'position.x'));
    expect(out.tracks).toHaveLength(1);
  });

  it('removeTrack drops the matching track', () => {
    const clip: AnimationClip = { id: 'c', name: 'C', duration: 5, tracks: [track([], 'position.x')] };
    expect(AnimationEngine.removeTrack(clip, 't1').tracks).toHaveLength(0);
  });

  it('createClip returns an empty clip with defaults', () => {
    const clip = AnimationEngine.createClip();
    expect(clip.name).toBe('Clip');
    expect(clip.duration).toBe(5);
    expect(clip.tracks).toEqual([]);
    expect(clip.id).toBeTruthy();
  });

  it('createClip honors provided name and duration', () => {
    const clip = AnimationEngine.createClip('Walk', 12);
    expect(clip.name).toBe('Walk');
    expect(clip.duration).toBe(12);
  });
});
