import { describe, it, expect, vi } from 'vitest';
import { LightNode } from './LightNode';

describe('LightNode', () => {
  // ─── Defaults ─────────────────────────────────────────────

  it('defaults to directional type, white color, intensity 1', () => {
    const light = new LightNode();
    expect(light.lightType).toBe('directional');
    expect(light.color).toBe('#ffffff');
    expect(light.intensity).toBe(1);
    expect(light.type).toBe('light');
  });

  // ─── Setters ──────────────────────────────────────────────

  it('setColor updates color and notifies', () => {
    const light = new LightNode();
    const spy = vi.fn();
    light._onChange = spy;

    light.setColor('#ff0000');
    expect(light.color).toBe('#ff0000');
    expect(spy).toHaveBeenCalled();
  });

  it('setIntensity updates intensity and notifies', () => {
    const light = new LightNode();
    const spy = vi.fn();
    light._onChange = spy;

    light.setIntensity(3.5);
    expect(light.intensity).toBe(3.5);
    expect(spy).toHaveBeenCalled();
  });

  it('setLightType updates lightType and notifies', () => {
    const light = new LightNode();
    const spy = vi.fn();
    light._onChange = spy;

    light.setLightType('point');
    expect(light.lightType).toBe('point');
    expect(spy).toHaveBeenCalled();
  });

  // ─── setProperty ──────────────────────────────────────────

  it('setProperty handles light.color and light.intensity', () => {
    const light = new LightNode();

    expect(light.setProperty('light.color', '#00ff00')).toBe(true);
    expect(light.color).toBe('#00ff00');

    expect(light.setProperty('light.intensity', 5)).toBe(true);
    expect(light.intensity).toBe(5);
  });

  it('setProperty delegates base properties to SceneNode', () => {
    const light = new LightNode();
    expect(light.setProperty('visible', false)).toBe(true);
    expect(light.visible).toBe(false);
  });

  it('setProperty returns false for unknown properties', () => {
    const light = new LightNode();
    expect(light.setProperty('light.unknown', 42)).toBe(false);
  });

  // ─── Serialization ────────────────────────────────────────

  it('toData includes lightType, color, and intensity', () => {
    const light = new LightNode({
      id: 'l1',
      lightType: 'spot',
      color: '#0000ff',
      intensity: 2.5,
    });

    const data = light.toData();
    expect(data.type).toBe('light');
    expect(data.lightType).toBe('spot');
    expect(data.color).toBe('#0000ff');
    expect(data.intensity).toBe(2.5);
  });
});
