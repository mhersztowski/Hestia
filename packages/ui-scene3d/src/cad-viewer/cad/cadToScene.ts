/**
 * Bridge: CAD Project entities → Three.js SceneGraph (ported from cad-app).
 * Coordinate mapping: CAD X→X, CAD Y→Z (top-down), extrusion→Y.
 */
import { SceneGraph, MeshNode, LightNode } from '../../scene3d';
import type { Project } from '@hestia/ui-cad/cad2d';

const FLAT_HEIGHT = 0.05;

function hexFromLayerOrEntity(color: string, layerColor: string): string {
  return color === 'bylayer' ? layerColor : color;
}

export function cadProjectToSceneGraph(project: Project): SceneGraph {
  const scene = new SceneGraph();

  scene.addNode(new LightNode({ name: 'Ambient', lightType: 'ambient', intensity: 0.4 }));
  scene.addNode(
    new LightNode({ name: 'Sun', lightType: 'directional', position: [10, 20, 10], intensity: 0.8 })
  );

  for (const entity of project.entityRegistry.getAll()) {
    if (!entity.visible) continue;
    const layer = project.layerSystem.get(entity.layerId);
    if (layer && !layer.visible) continue;

    const color = hexFromLayerOrEntity(entity.color, layer?.color ?? '#4fc3f7');
    const h = entity.extrudeHeight > 0 ? entity.extrudeHeight : FLAT_HEIGHT;

    switch (entity.type) {
      case 'circle': {
        scene.addNode(
          new MeshNode({
            name: `Circle (r=${entity.radius.toFixed(1)})`,
            position: [entity.cx, h / 2, entity.cy],
            geometry: {
              type: 'cylinder',
              params: {
                radiusTop: entity.radius,
                radiusBottom: entity.radius,
                height: h,
                radialSegments: 64,
              },
            },
            material: { color, opacity: 1, wireframe: false },
          })
        );
        break;
      }
      case 'rect': {
        scene.addNode(
          new MeshNode({
            name: `Rect (${entity.width.toFixed(1)}×${entity.height.toFixed(1)})`,
            position: [entity.x + entity.width / 2, h / 2, entity.y + entity.height / 2],
            geometry: {
              type: 'box',
              params: { width: entity.width, height: h, depth: entity.height },
            },
            material: { color, opacity: 1, wireframe: false },
          })
        );
        break;
      }
      case 'line': {
        const dx = entity.x2 - entity.x1;
        const dz = entity.y2 - entity.y1;
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length < 0.001) break;
        scene.addNode(
          new MeshNode({
            name: `Line (${length.toFixed(1)})`,
            position: [(entity.x1 + entity.x2) / 2, h / 2, (entity.y1 + entity.y2) / 2],
            rotation: [0, -Math.atan2(dz, dx), 0],
            geometry: { type: 'box', params: { width: length, height: h, depth: 0.1 } },
            material: { color, opacity: 1, wireframe: false },
          })
        );
        break;
      }
      case 'polyline': {
        for (let i = 0; i < entity.points.length - 1; i++) {
          const a = entity.points[i];
          const b = entity.points[i + 1];
          const dx = b.x - a.x;
          const dz = b.y - a.y;
          const length = Math.sqrt(dx * dx + dz * dz);
          if (length < 0.001) continue;
          scene.addNode(
            new MeshNode({
              name: `Polyline seg ${i + 1}`,
              position: [(a.x + b.x) / 2, h / 2, (a.y + b.y) / 2],
              rotation: [0, -Math.atan2(dz, dx), 0],
              geometry: { type: 'box', params: { width: length, height: h, depth: 0.1 } },
              material: { color, opacity: 1, wireframe: false },
            })
          );
        }
        break;
      }
      case 'arc': {
        scene.addNode(
          new MeshNode({
            name: `Arc (r=${entity.radius.toFixed(1)})`,
            position: [entity.cx, h / 2, entity.cy],
            geometry: {
              type: 'cylinder',
              params: {
                radiusTop: entity.radius,
                radiusBottom: entity.radius,
                height: h,
                radialSegments: 32,
              },
            },
            material: { color, opacity: 0.4, wireframe: true },
          })
        );
        break;
      }
    }
  }

  return scene;
}
