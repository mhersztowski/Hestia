import { describe, it, expect, vi } from 'vitest';
import { CameraNode } from './CameraNode';

describe('CameraNode', () => {
  // ─── Defaults ─────────────────────────────────────────────

  it('defaults to fov 50, near 0.1, far 2000', () => {
    const cam = new CameraNode();
    expect(cam.fov).toBe(50);
    expect(cam.near).toBeCloseTo(0.1);
    expect(cam.far).toBe(2000);
    expect(cam.type).toBe('camera');
  });

  it('defaults cameraType to perspective', () => {
    expect(new CameraNode().cameraType).toBe('perspective');
  });

  // ─── Setters (via setProperty) ────────────────────────────

  it('setProperty camera.fov updates fov and notifies', () => {
    const cam = new CameraNode();
    const spy = vi.fn();
    cam._onChange = spy;

    expect(cam.setProperty('camera.fov', 90)).toBe(true);
    expect(cam.fov).toBe(90);
    expect(spy).toHaveBeenCalled();
  });

  it('setProperty camera.near updates near and notifies', () => {
    const cam = new CameraNode();
    const spy = vi.fn();
    cam._onChange = spy;

    expect(cam.setProperty('camera.near', 0.01)).toBe(true);
    expect(cam.near).toBeCloseTo(0.01);
    expect(spy).toHaveBeenCalled();
  });

  it('setProperty camera.far updates far and notifies', () => {
    const cam = new CameraNode();
    const spy = vi.fn();
    cam._onChange = spy;

    expect(cam.setProperty('camera.far', 5000)).toBe(true);
    expect(cam.far).toBe(5000);
    expect(spy).toHaveBeenCalled();
  });

  // ─── setProperty ──────────────────────────────────────────

  it('setProperty handles camera.fov, camera.near, camera.far', () => {
    const cam = new CameraNode();

    expect(cam.setProperty('camera.fov', 60)).toBe(true);
    expect(cam.fov).toBe(60);

    expect(cam.setProperty('camera.near', 0.5)).toBe(true);
    expect(cam.near).toBeCloseTo(0.5);

    expect(cam.setProperty('camera.far', 2000)).toBe(true);
    expect(cam.far).toBe(2000);
  });

  it('setProperty delegates base properties to SceneNode', () => {
    const cam = new CameraNode();
    expect(cam.setProperty('name', 'MainCamera')).toBe(true);
    expect(cam.name).toBe('MainCamera');
  });

  it('setProperty returns false for unknown properties', () => {
    const cam = new CameraNode();
    expect(cam.setProperty('camera.unknown', 42)).toBe(false);
  });

  // ─── Serialization ────────────────────────────────────────

  it('toData includes fov, near, and far', () => {
    const cam = new CameraNode({
      id: 'cam-1',
      fov: 60,
      near: 0.5,
      far: 500,
    });

    const data = cam.toData();
    expect(data.type).toBe('camera');
    expect(data.fov).toBe(60);
    expect(data.near).toBeCloseTo(0.5);
    expect(data.far).toBe(500);
  });
});
