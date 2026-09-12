import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as THREE from 'three';
import type { BufferGeometryData } from '../nodes/MeshNode';

function extractBufferData(geometry: THREE.BufferGeometry): BufferGeometryData {
  const pos = geometry.getAttribute('position');
  const norm = geometry.getAttribute('normal');
  const idx = geometry.getIndex();

  return {
    positions: Array.from(pos.array as Float32Array),
    normals: norm ? Array.from(norm.array as Float32Array) : undefined,
    indices: idx ? Array.from(idx.array as Uint16Array | Uint32Array) : undefined,
  };
}

export function parseOBJText(text: string): BufferGeometryData {
  const loader = new OBJLoader();
  const group = loader.parse(text);

  // Collect all geometries and merge manually
  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  let hasNormals = true;
  let vertexOffset = 0;

  group.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const geo = (child as THREE.Mesh).geometry as THREE.BufferGeometry;

    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count * 3; i++) {
      allPositions.push((pos.array as Float32Array)[i]);
    }

    const norm = geo.getAttribute('normal');
    if (norm) {
      for (let i = 0; i < norm.count * 3; i++) {
        allNormals.push((norm.array as Float32Array)[i]);
      }
    } else {
      hasNormals = false;
    }

    const idx = geo.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        allIndices.push((idx.array as Uint16Array | Uint32Array)[i] + vertexOffset);
      }
    }

    vertexOffset += pos.count;
  });

  if (allPositions.length === 0) throw new Error('No mesh found in OBJ file');

  return {
    positions: allPositions,
    normals: hasNormals && allNormals.length > 0 ? allNormals : undefined,
    indices: allIndices.length > 0 ? allIndices : undefined,
  };
}

export function parseSTLBuffer(buffer: ArrayBuffer): BufferGeometryData {
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);

  if (!geometry.getAttribute('position')) {
    throw new Error('No geometry found in STL file');
  }

  return extractBufferData(geometry);
}

export function parseFBXBuffer(buffer: ArrayBuffer): BufferGeometryData {
  const loader = new FBXLoader();
  const group = loader.parse(buffer, '');

  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  let hasNormals = true;
  let vertexOffset = 0;

  group.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const geo = (child as THREE.Mesh).geometry as THREE.BufferGeometry;

    const pos = geo.getAttribute('position');
    if (!pos) return;

    for (let i = 0; i < pos.count * 3; i++) {
      allPositions.push((pos.array as Float32Array)[i]);
    }

    const norm = geo.getAttribute('normal');
    if (norm) {
      for (let i = 0; i < norm.count * 3; i++) {
        allNormals.push((norm.array as Float32Array)[i]);
      }
    } else {
      hasNormals = false;
    }

    const idx = geo.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        allIndices.push((idx.array as Uint16Array | Uint32Array)[i] + vertexOffset);
      }
    }

    vertexOffset += pos.count;
  });

  if (allPositions.length === 0) throw new Error('No mesh found in FBX file');

  return {
    positions: allPositions,
    normals: hasNormals && allNormals.length > 0 ? allNormals : undefined,
    indices: allIndices.length > 0 ? allIndices : undefined,
  };
}

export function parseGLTFBuffer(buffer: ArrayBuffer): Promise<BufferGeometryData> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      '',
      (gltf) => {
        let geometry: THREE.BufferGeometry | null = null;
        gltf.scene.traverse((child) => {
          if (!geometry && (child as THREE.Mesh).isMesh) {
            geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry;
          }
        });
        if (!geometry) {
          reject(new Error('No mesh found in GLTF file'));
          return;
        }
        resolve(extractBufferData(geometry));
      },
      (error) => reject(error),
    );
  });
}
