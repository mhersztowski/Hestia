import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as THREE from 'three';
import { SceneGraph } from '../scene/SceneGraph';
import { MeshNode } from '../nodes/MeshNode';
import { LightNode } from '../nodes/LightNode';
import { GroupNode } from '../nodes/GroupNode';
import type { BufferGeometryData, MaterialDescriptor } from '../nodes/MeshNode';

export interface FBXImportResult {
  graph: SceneGraph;
  animationCount: number;
  animationNames: string[];
  nodeCount: number;
  skippedCount: number;
  warnings: string[];
}

function printThreeTree(obj: THREE.Object3D, depth = 0): void {
  const indent = '  '.repeat(depth);
  const flags: string[] = [];
  if ((obj as THREE.Mesh).isMesh) flags.push((obj as THREE.SkinnedMesh).isSkinnedMesh ? 'SKINNED_MESH' : 'MESH');
  if ((obj as THREE.Light).isLight) flags.push('LIGHT');
  if (obj.type === 'Bone') flags.push('BONE');
  if (obj.type === 'Group') flags.push('GROUP');
  const geo = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  const verts = geo?.getAttribute?.('position')?.count ?? 0;
  const mat = (obj as THREE.Mesh).material;
  const matType = mat ? (Array.isArray(mat) ? `[${mat.length} materials]` : mat.type) : '';
  console.log(
    `${indent}[${obj.type}] "${obj.name || '(unnamed)'}"`,
    flags.length ? `(${flags.join('|')})` : '',
    verts > 0 ? `${verts}v` : '',
    matType,
    `children=${obj.children.length}`,
  );
  for (const child of obj.children) printThreeTree(child, depth + 1);
}

export class FBXImporter {
  static importFromBuffer(buffer: ArrayBuffer, debug = true): FBXImportResult {
    const loader = new FBXLoader();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const root = loader.parse(buffer, '') as any;
    const animations: THREE.AnimationClip[] = root.animations ?? [];

    const graph = new SceneGraph();
    const warnings: string[] = [];
    let nodeCount = 0;
    let skippedCount = 0;

    if (debug) {
      console.group(`[FBXImporter] Three.js scene tree (${(root as THREE.Group).children.length} root objects, ${animations.length} animations)`);
      for (const child of (root as THREE.Group).children) printThreeTree(child, 0);
      console.groupEnd();
    }

    function getMaterial(mat: THREE.Material | null | undefined): Partial<MaterialDescriptor> {
      if (!mat) return { color: '#cccccc', opacity: 1, wireframe: false };
      const c = (mat as { color?: THREE.Color }).color;
      return {
        color: c instanceof THREE.Color ? `#${c.getHexString()}` : '#cccccc',
        opacity: mat.opacity ?? 1,
        wireframe: false,
      };
    }

    function getGeometry(mesh: THREE.Mesh): BufferGeometryData | null {
      const geo = mesh.geometry as THREE.BufferGeometry;
      const pos = geo?.getAttribute('position');
      if (!pos) return null;
      const norm = geo.getAttribute('normal');
      const idx = geo.getIndex();
      return {
        positions: Array.from(pos.array as Float32Array),
        normals: norm ? Array.from(norm.array as Float32Array) : undefined,
        indices: idx ? Array.from(idx.array as Uint16Array | Uint32Array) : undefined,
      };
    }

    function processNode(obj: THREE.Object3D, parentId?: string): void {
      const p: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
      const r: [number, number, number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
      const s: [number, number, number] = [obj.scale.x, obj.scale.y, obj.scale.z];

      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const bufferData = getGeometry(mesh);

        if (!bufferData) {
          // Mesh with no usable geometry — preserve hierarchy as a group if it has children
          const warn = `Mesh "${obj.name || obj.type}" has no geometry data — ${obj.children.length > 0 ? 'converted to GroupNode' : 'skipped'}`;
          warnings.push(warn);
          if (debug) console.warn(`  ⚠ ${warn}`);
          skippedCount++;
          if (obj.children.length > 0) {
            const node = new GroupNode({ name: obj.name || 'Group', position: p, rotation: r, scale: s });
            graph.addNode(node, parentId);
            nodeCount++;
            for (const child of obj.children) processNode(child, node.id);
          }
          return;
        }

        const rawMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const node = new MeshNode({
          name: obj.name || 'Mesh',
          position: p, rotation: r, scale: s,
          geometry: { type: 'custom', bufferData },
          material: getMaterial(rawMat ?? null),
        });
        graph.addNode(node, parentId);
        nodeCount++;
        if (debug) {
          const verts = Math.floor(bufferData.positions.length / 3);
          console.log(`  ✓ MeshNode "${node.name}" (${verts} vertices${bufferData.indices ? `, ${bufferData.indices.length} indices` : ''})`);
        }
        for (const child of obj.children) processNode(child, node.id);

      } else if ((obj as THREE.Light).isLight) {
        const light = obj as THREE.Light;
        let lightType: 'ambient' | 'directional' | 'point' | 'spot' = 'directional';
        if (light.type === 'AmbientLight') lightType = 'ambient';
        else if (light.type === 'PointLight') lightType = 'point';
        else if (light.type === 'SpotLight') lightType = 'spot';
        const node = new LightNode({
          name: obj.name || `${lightType.charAt(0).toUpperCase() + lightType.slice(1)} Light`,
          position: p, lightType,
          color: `#${light.color.getHexString()}`,
          intensity: light.intensity,
        });
        graph.addNode(node, parentId);
        nodeCount++;
        if (debug) console.log(`  ✓ LightNode "${node.name}" (${lightType})`);

      } else if (obj.type === 'Bone') {
        if (debug) console.log(`  → Bone passthrough "${obj.name || '(unnamed)'}" (${obj.children.length} children → attached to parent)`);
        for (const child of obj.children) processNode(child, parentId);

      } else if (obj.children.length > 0) {
        const node = new GroupNode({
          name: obj.name || 'Group',
          position: p, rotation: r, scale: s,
        });
        graph.addNode(node, parentId);
        nodeCount++;
        if (debug) console.log(`  + GroupNode "${node.name}" (${obj.children.length} children, type=${obj.type})`);
        for (const child of obj.children) processNode(child, node.id);

      } else {
        const warn = `Skipped "${obj.name || '(unnamed)'}" [${obj.type}] — not mesh/light/bone and no children`;
        warnings.push(warn);
        if (debug) console.log(`  ✗ ${warn}`);
        skippedCount++;
      }
    }

    for (const child of (root as THREE.Group).children) {
      processNode(child);
    }

    // Represent animation clips as GroupNodes with metadata in userData
    if (animations.length > 0) {
      const animRoot = new GroupNode({ name: 'Animations' });
      graph.addNode(animRoot);
      nodeCount++;
      for (const clip of animations) {
        graph.addNode(
          new GroupNode({
            name: clip.name || 'Clip',
            userData: JSON.stringify({
              type: 'animation-clip',
              duration: parseFloat(clip.duration.toFixed(3)),
              tracks: clip.tracks.length,
            }),
          }),
          animRoot.id,
        );
        nodeCount++;
      }
    }

    if (debug) {
      console.log(
        `[FBXImporter] Done — ${nodeCount} nodes created, ${skippedCount} skipped, ${animations.length} animation(s)`,
        warnings.length > 0 ? `\nWarnings:\n  ${warnings.join('\n  ')}` : '',
      );
    }

    return {
      graph,
      animationCount: animations.length,
      animationNames: animations.map((a) => a.name),
      nodeCount,
      skippedCount,
      warnings,
    };
  }
}
