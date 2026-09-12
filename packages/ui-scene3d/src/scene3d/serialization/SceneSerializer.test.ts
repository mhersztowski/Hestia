import { describe, it, expect } from 'vitest';
import { SceneSerializer } from './SceneSerializer';
import { SceneDeserializer } from './SceneDeserializer';
import { SceneGraph } from '../scene/SceneGraph';
import { MeshNode } from '../nodes/MeshNode';
import { LightNode } from '../nodes/LightNode';
import { CameraNode } from '../nodes/CameraNode';
import { AudioNode } from '../nodes/AudioNode';
import { GroupNode } from '../nodes/GroupNode';
import {
  GeometryPointNode,
  GeometrySegmentNode,
  GeometryLineNode,
  GeometryAngleNode,
} from '../nodes/GeometryNodes';
import { AnimationEngine } from '../animation/AnimationEngine';
import { PrefabStore } from '../prefabs/PrefabStore';

function buildRichGraph(): SceneGraph {
  const graph = new SceneGraph();
  const group = new GroupNode({ id: 'grp', name: 'Container', position: [1, 2, 3] });
  graph.addNode(group);
  graph.addNode(new MeshNode({ id: 'mesh', geometry: { type: 'sphere', params: { radius: 2 } }, material: { color: '#ff0000', opacity: 0.5, wireframe: true } }), 'grp');
  graph.addNode(new LightNode({ id: 'light', lightType: 'spot', color: '#00ff00', intensity: 2.5 }), 'grp');
  graph.addNode(new CameraNode({ id: 'cam', cameraType: 'orthographic', fov: 60, near: 0.5, far: 500 }));
  graph.addNode(new AudioNode({ id: 'audio', src: 's.mp3', volume: 0.4 }));
  graph.addNode(new GeometryPointNode({ id: 'gp', label: 'P' }));
  graph.addNode(new GeometrySegmentNode({ id: 'gs', start: [0, 0, 0], end: [1, 1, 1] }));
  graph.addNode(new GeometryLineNode({ id: 'gl', origin: [1, 0, 0], direction: [0, 1, 0] }));
  graph.addNode(new GeometryAngleNode({ id: 'ga', vertex: [0, 0, 0], p1: [1, 0, 0], p2: [0, 1, 0] }));
  return graph;
}

describe('SceneSerializer / SceneDeserializer', () => {
  it('serializeToObject equals graph.toData()', () => {
    const graph = buildRichGraph();
    expect(SceneSerializer.serializeToObject(graph)).toEqual(graph.toData());
  });

  it('serialize produces pretty-printed valid JSON', () => {
    const graph = new SceneGraph();
    const json = SceneSerializer.serialize(graph);
    expect(json).toContain('\n');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('round-trips a rich graph via JSON string (structural equality)', () => {
    const graph = buildRichGraph();
    const json = SceneSerializer.serialize(graph);
    const restored = SceneDeserializer.deserialize(json);
    expect(restored.toData()).toEqual(graph.toData());
  });

  it('round-trips via object form', () => {
    const graph = buildRichGraph();
    const obj = SceneSerializer.serializeToObject(graph);
    const restored = SceneDeserializer.deserializeFromObject(obj);
    expect(restored.toData()).toEqual(obj);
  });

  it('restores concrete node subclasses', () => {
    const graph = buildRichGraph();
    const restored = SceneDeserializer.deserialize(SceneSerializer.serialize(graph));
    expect(restored.findNode('mesh')).toBeInstanceOf(MeshNode);
    expect(restored.findNode('light')).toBeInstanceOf(LightNode);
    expect(restored.findNode('cam')).toBeInstanceOf(CameraNode);
    expect(restored.findNode('audio')).toBeInstanceOf(AudioNode);
    expect(restored.findNode('gp')).toBeInstanceOf(GeometryPointNode);
    expect(restored.findNode('gs')).toBeInstanceOf(GeometrySegmentNode);
    expect(restored.findNode('gl')).toBeInstanceOf(GeometryLineNode);
    expect(restored.findNode('ga')).toBeInstanceOf(GeometryAngleNode);
  });

  it('preserves nesting under the group', () => {
    const graph = buildRichGraph();
    const restored = SceneDeserializer.deserialize(SceneSerializer.serialize(graph));
    const grp = restored.findNode('grp')!;
    expect(grp.children.map((c) => c.id).sort()).toEqual(['light', 'mesh']);
    expect(restored.findNode('mesh')!.parent).toBe(grp);
  });

  it('round-trips animation clips attached to the graph', () => {
    const graph = new SceneGraph();
    graph.addNode(new MeshNode({ id: 'm1' }));
    let clip = AnimationEngine.createClip('Move', 3);
    const { clip: c2, track } = AnimationEngine.getOrCreateTrack(clip, 'm1', 'position.x');
    clip = AnimationEngine.updateTrack(c2, AnimationEngine.setKeyframe(track, 0, 0));
    graph.animation = clip;

    const restored = SceneDeserializer.deserialize(SceneSerializer.serialize(graph));
    expect(restored.animation).toEqual(clip);
  });

  it('round-trips prefabs attached to the graph', () => {
    const graph = new SceneGraph();
    graph.prefabs = [PrefabStore.create('P', new MeshNode({ id: 'm' }))];

    const restored = SceneDeserializer.deserialize(SceneSerializer.serialize(graph));
    expect(restored.prefabs).toEqual(graph.prefabs);
  });
});
