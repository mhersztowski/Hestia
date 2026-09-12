import { describe, it, expect, vi } from 'vitest';
import { AudioNode } from './AudioNode';

describe('AudioNode', () => {
  describe('defaults', () => {
    it('has type "audio"', () => {
      expect(new AudioNode().type).toBe('audio');
    });

    it('applies audio defaults', () => {
      const a = new AudioNode();
      expect(a.src).toBe('');
      expect(a.volume).toBe(1);
      expect(a.loop).toBe(false);
      expect(a.autoplay).toBe(false);
      expect(a.positional).toBe(true);
      expect(a.rolloffFactor).toBe(1);
      expect(a.maxDistance).toBe(10000);
      expect(a.refDistance).toBe(1);
      expect(a.distanceModel).toBe('inverse');
      expect(a.coneInnerAngle).toBe(360);
      expect(a.coneOuterAngle).toBe(360);
      expect(a.coneOuterGain).toBe(0);
    });

    it('accepts provided values', () => {
      const a = new AudioNode({
        src: 'song.mp3',
        volume: 0.5,
        loop: true,
        autoplay: true,
        positional: false,
        distanceModel: 'linear',
      });
      expect(a.src).toBe('song.mp3');
      expect(a.volume).toBe(0.5);
      expect(a.loop).toBe(true);
      expect(a.autoplay).toBe(true);
      expect(a.positional).toBe(false);
      expect(a.distanceModel).toBe('linear');
    });
  });

  describe('setProperty', () => {
    it.each([
      ['audio.src', 'x.wav', 'src'],
      ['audio.volume', 0.25, 'volume'],
      ['audio.loop', true, 'loop'],
      ['audio.autoplay', true, 'autoplay'],
      ['audio.positional', false, 'positional'],
      ['audio.rolloffFactor', 3, 'rolloffFactor'],
      ['audio.maxDistance', 500, 'maxDistance'],
      ['audio.refDistance', 2, 'refDistance'],
      ['audio.distanceModel', 'exponential', 'distanceModel'],
      ['audio.coneInnerAngle', 90, 'coneInnerAngle'],
      ['audio.coneOuterAngle', 180, 'coneOuterAngle'],
      ['audio.coneOuterGain', 0.3, 'coneOuterGain'],
    ] as const)('sets %s', (prop, value, field) => {
      const a = new AudioNode();
      const spy = vi.fn();
      a._onChange = spy;
      expect(a.setProperty(prop, value)).toBe(true);
      expect((a as unknown as Record<string, unknown>)[field]).toBe(value);
      expect(spy).toHaveBeenCalled();
    });

    it('delegates base properties to SceneNode', () => {
      const a = new AudioNode();
      expect(a.setProperty('name', 'Speaker')).toBe(true);
      expect(a.name).toBe('Speaker');
    });

    it('returns false for unknown properties', () => {
      expect(new AudioNode().setProperty('audio.nope', 1)).toBe(false);
    });
  });

  describe('toData', () => {
    it('serializes all audio fields', () => {
      const a = new AudioNode({
        id: 'a1',
        src: 'clip.ogg',
        volume: 0.7,
        loop: true,
        distanceModel: 'linear',
        coneOuterGain: 0.2,
      });
      const data = a.toData();
      expect(data.type).toBe('audio');
      expect(data.src).toBe('clip.ogg');
      expect(data.volume).toBe(0.7);
      expect(data.loop).toBe(true);
      expect(data.distanceModel).toBe('linear');
      expect(data.coneOuterGain).toBe(0.2);
    });

    it('round-trips through toData -> constructor', () => {
      const a = new AudioNode({ id: 'a1', src: 's.mp3', volume: 0.4, positional: false });
      const b = new AudioNode(a.toData());
      expect(b.toData()).toEqual(a.toData());
    });
  });
});
