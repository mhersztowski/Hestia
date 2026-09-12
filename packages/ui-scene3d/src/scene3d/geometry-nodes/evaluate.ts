import * as THREE from 'three';
import type { GeoNodeGraph } from './types';

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 0) return new THREE.BufferGeometry();
  if (geos.length === 1) return geos[0];

  const positions: number[] = [];
  const normals: number[] = [];

  for (const g of geos) {
    const src = g.index ? g.toNonIndexed() : g;
    src.computeVertexNormals();
    const pos = src.attributes['position'] as THREE.BufferAttribute;
    const nor = src.attributes['normal'] as THREE.BufferAttribute | undefined;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length === positions.length) {
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  } else {
    out.computeVertexNormals();
  }
  return out;
}

function evalNode(
  nodeId: string,
  graph: GeoNodeGraph,
  cache: Map<string, THREE.BufferGeometry>,
  depth: number,
): THREE.BufferGeometry {
  if (depth > 32) return new THREE.BoxGeometry();
  if (cache.has(nodeId)) return cache.get(nodeId)!;

  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) return new THREE.BoxGeometry();

  const p = node.params;
  let geo: THREE.BufferGeometry;

  const inputGeo = (handle = 'geo-in') => {
    const edge = graph.edges.find(e => e.target === nodeId && e.targetHandle === handle);
    return edge ? evalNode(edge.source, graph, cache, depth + 1) : new THREE.BoxGeometry();
  };

  switch (node.type) {
    case 'box':
      geo = new THREE.BoxGeometry(p['width'] ?? 1, p['height'] ?? 1, p['depth'] ?? 1, p['wSeg'] ?? 1, p['hSeg'] ?? 1, p['dSeg'] ?? 1);
      break;
    case 'sphere':
      geo = new THREE.SphereGeometry(p['radius'] ?? 1, p['wSeg'] ?? 32, p['hSeg'] ?? 16);
      break;
    case 'cylinder':
      geo = new THREE.CylinderGeometry(p['radiusTop'] ?? 1, p['radiusBottom'] ?? 1, p['height'] ?? 2, p['rSeg'] ?? 32);
      break;
    case 'plane':
      geo = new THREE.PlaneGeometry(p['width'] ?? 1, p['height'] ?? 1, p['wSeg'] ?? 1, p['hSeg'] ?? 1);
      break;
    case 'cone':
      geo = new THREE.ConeGeometry(p['radius'] ?? 1, p['height'] ?? 2, p['rSeg'] ?? 32);
      break;
    case 'torus':
      geo = new THREE.TorusGeometry(p['radius'] ?? 1, p['tube'] ?? 0.4, p['rSeg'] ?? 16, p['tSeg'] ?? 100);
      break;
    case 'transform': {
      const base = inputGeo().clone();
      const mat = new THREE.Matrix4().compose(
        new THREE.Vector3(p['tx'] ?? 0, p['ty'] ?? 0, p['tz'] ?? 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(p['rx'] ?? 0, p['ry'] ?? 0, p['rz'] ?? 0)),
        new THREE.Vector3(p['sx'] ?? 1, p['sy'] ?? 1, p['sz'] ?? 1),
      );
      base.applyMatrix4(mat);
      geo = base;
      break;
    }
    case 'merge': {
      const edges = graph.edges.filter(e => e.target === nodeId);
      const geos = edges.map(e => evalNode(e.source, graph, cache, depth + 1));
      geo = mergeGeometries(geos);
      break;
    }
    case 'output':
    default:
      geo = inputGeo();
      break;
  }

  cache.set(nodeId, geo);
  return geo;
}

export function evaluateGeoNodeGraph(graph: GeoNodeGraph): THREE.BufferGeometry {
  const outputNode = graph.nodes.find(n => n.type === 'output');
  if (!outputNode) return new THREE.BoxGeometry();
  try {
    return evalNode(outputNode.id, graph, new Map(), 0);
  } catch (e) {
    console.warn('GeoNodes eval error:', e);
    return new THREE.BoxGeometry();
  }
}
