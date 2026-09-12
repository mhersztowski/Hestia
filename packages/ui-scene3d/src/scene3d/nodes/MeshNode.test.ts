import { describe, it, expect, vi } from 'vitest';
import { MeshNode } from './MeshNode';

describe('MeshNode', () => {
  // ─── Defaults ─────────────────────────────────────────────

  it('defaults geometry to box type', () => {
    const mesh = new MeshNode();
    expect(mesh.geometry.type).toBe('box');
  });

  it('defaults material to #4fc3f7, opacity 1, wireframe false', () => {
    const mesh = new MeshNode();
    expect(mesh.material.color).toBe('#4fc3f7');
    expect(mesh.material.opacity).toBe(1);
    expect(mesh.material.wireframe).toBe(false);
  });

  it('has type "mesh"', () => {
    const mesh = new MeshNode();
    expect(mesh.type).toBe('mesh');
  });

  // ─── Setters ──────────────────────────────────────────────

  it('setMaterialColor updates color and notifies', () => {
    const mesh = new MeshNode();
    const spy = vi.fn();
    mesh._onChange = spy;

    mesh.setMaterialColor('#ff0000');
    expect(mesh.material.color).toBe('#ff0000');
    expect(spy).toHaveBeenCalled();
  });

  it('setMaterialOpacity updates opacity and notifies', () => {
    const mesh = new MeshNode();
    const spy = vi.fn();
    mesh._onChange = spy;

    mesh.setMaterialOpacity(0.5);
    expect(mesh.material.opacity).toBe(0.5);
    expect(spy).toHaveBeenCalled();
  });

  it('setMaterialWireframe updates wireframe and notifies', () => {
    const mesh = new MeshNode();
    const spy = vi.fn();
    mesh._onChange = spy;

    mesh.setMaterialWireframe(true);
    expect(mesh.material.wireframe).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('setGeometry replaces the geometry descriptor and notifies', () => {
    const mesh = new MeshNode();
    const spy = vi.fn();
    mesh._onChange = spy;

    mesh.setGeometry({ type: 'sphere', params: { radius: 3 } });
    expect(mesh.geometry.type).toBe('sphere');
    expect(mesh.geometry.params).toEqual({ radius: 3 });
    expect(spy).toHaveBeenCalled();
  });

  // ─── setProperty ──────────────────────────────────────────

  it('setProperty handles material.color', () => {
    const mesh = new MeshNode();
    const result = mesh.setProperty('material.color', '#00ff00');
    expect(result).toBe(true);
    expect(mesh.material.color).toBe('#00ff00');
  });

  it('setProperty handles material.opacity', () => {
    const mesh = new MeshNode();
    const result = mesh.setProperty('material.opacity', 0.3);
    expect(result).toBe(true);
    expect(mesh.material.opacity).toBe(0.3);
  });

  it('setProperty handles material.wireframe', () => {
    const mesh = new MeshNode();
    const result = mesh.setProperty('material.wireframe', true);
    expect(result).toBe(true);
    expect(mesh.material.wireframe).toBe(true);
  });

  it('setProperty delegates base properties to SceneNode', () => {
    const mesh = new MeshNode();
    const result = mesh.setProperty('name', 'MyMesh');
    expect(result).toBe(true);
    expect(mesh.name).toBe('MyMesh');
  });

  it('setProperty returns false for unknown properties', () => {
    const mesh = new MeshNode();
    const result = mesh.setProperty('unknown.prop', 'value');
    expect(result).toBe(false);
  });

  // ─── Serialization ────────────────────────────────────────

  it('toData includes geometry and material', () => {
    const mesh = new MeshNode({
      id: 'mesh-1',
      geometry: { type: 'cylinder', params: { radius: 1, height: 5 } },
      material: { color: '#ff00ff', opacity: 0.8, wireframe: true },
    });

    const data = mesh.toData();
    expect(data.type).toBe('mesh');
    expect(data.geometry.type).toBe('cylinder');
    expect(data.geometry.params).toEqual({ radius: 1, height: 5 });
    expect(data.material.color).toBe('#ff00ff');
    expect(data.material.opacity).toBe(0.8);
    expect(data.material.wireframe).toBe(true);
  });

  it('toData returns detached copies of geometry and material', () => {
    const mesh = new MeshNode();
    const data = mesh.toData();
    data.material.color = '#000000';
    data.geometry.type = 'torus';

    expect(mesh.material.color).toBe('#4fc3f7');
    expect(mesh.geometry.type).toBe('box');
  });
});
