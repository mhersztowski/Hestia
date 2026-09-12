import * as THREE from 'three';
import type { SceneGraph } from '../scene/SceneGraph';
import type { SceneNode } from '../scene/SceneNode';
import type { MeshNode, GeometryDescriptor } from '../nodes/MeshNode';
import type { LightNode } from '../nodes/LightNode';

function buildGeometry(descriptor: GeometryDescriptor): THREE.BufferGeometry {
  const p = descriptor.params;
  switch (descriptor.type) {
    case 'custom': {
      if (!descriptor.bufferData) return new THREE.BoxGeometry();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(descriptor.bufferData.positions, 3));
      if (descriptor.bufferData.normals) {
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(descriptor.bufferData.normals, 3));
      }
      if (descriptor.bufferData.indices) {
        geo.setIndex(descriptor.bufferData.indices);
      }
      if (!descriptor.bufferData.normals) {
        geo.computeVertexNormals();
      }
      return geo;
    }
    case 'sphere':
      return new THREE.SphereGeometry(p?.['radius'] ?? 1, 32, 32);
    case 'cylinder':
      return new THREE.CylinderGeometry(
        p?.['radiusTop'] ?? 1,
        p?.['radiusBottom'] ?? 1,
        p?.['height'] ?? 2,
        32,
      );
    case 'cone':
      return new THREE.ConeGeometry(p?.['radius'] ?? 1, p?.['height'] ?? 2, 32);
    case 'plane':
      return new THREE.PlaneGeometry(p?.['width'] ?? 10, p?.['height'] ?? 10);
    case 'torus':
      return new THREE.TorusGeometry(p?.['radius'] ?? 1, p?.['tube'] ?? 0.4, 16, 100);
    case 'box':
    default:
      return new THREE.BoxGeometry(
        p?.['width'] ?? 1,
        p?.['height'] ?? 1,
        p?.['depth'] ?? 1,
      );
  }
}

export function buildThreeScene(graph: SceneGraph): THREE.Scene {
  const scene = new THREE.Scene();

  function processNode(node: SceneNode): THREE.Object3D | null {
    let obj: THREE.Object3D | null = null;

    switch (node.type) {
      case 'mesh': {
        const meshNode = node as unknown as MeshNode;
        const geometry = buildGeometry(meshNode.geometry);
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(meshNode.material.color),
          opacity: meshNode.material.opacity,
          transparent: meshNode.material.opacity < 1,
          wireframe: meshNode.material.wireframe,
        });
        obj = new THREE.Mesh(geometry, material);
        break;
      }
      case 'light': {
        const lightNode = node as unknown as LightNode;
        const color = new THREE.Color(lightNode.color);
        switch (lightNode.lightType) {
          case 'ambient':
            obj = new THREE.AmbientLight(color, lightNode.intensity);
            break;
          case 'point':
            obj = new THREE.PointLight(color, lightNode.intensity);
            break;
          case 'directional':
          default:
            obj = new THREE.DirectionalLight(color, lightNode.intensity);
            break;
        }
        break;
      }
      case 'group':
        obj = new THREE.Group();
        break;
    }

    if (obj) {
      obj.name = node.name;
      obj.position.set(...node.position);
      obj.rotation.set(...node.rotation);
      obj.scale.set(...node.scale);

      for (const child of node.children) {
        const childObj = processNode(child);
        if (childObj) obj.add(childObj);
      }
    }

    return obj;
  }

  for (const child of graph.root.children) {
    const obj = processNode(child);
    if (obj) scene.add(obj);
  }

  return scene;
}
