import * as THREE from 'three';
import type { SceneGraph } from '../scene/SceneGraph';
import type { SceneNode } from '../scene/SceneNode';
import type { MeshNode } from '../nodes/MeshNode';
import type { LightNode } from '../nodes/LightNode';

export interface RenderEngineOptions {
  antialias?: boolean;
  alpha?: boolean;
  pixelRatio?: number;
}

export class RenderEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private objectMap: Map<string, THREE.Object3D> = new Map();

  constructor(container: HTMLElement, options: RenderEngineOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: options.antialias ?? true,
      alpha: options.alpha ?? false,
    });
    this.renderer.setPixelRatio(options.pixelRatio ?? window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);
  }

  syncFromSceneGraph(graph: SceneGraph): void {
    // Clear existing objects (keep lights if needed)
    const toRemove: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj !== this.scene) toRemove.push(obj);
    });
    toRemove.forEach((obj) => obj.removeFromParent());
    this.objectMap.clear();

    // Traverse the scene graph and create Three.js objects
    graph.traverse((node: SceneNode) => {
      if (node.type === 'group' && node === graph.root) return;
      const obj = this.createThreeObject(node);
      if (!obj) return;

      obj.position.set(...node.position);
      obj.rotation.set(...node.rotation);
      obj.scale.set(...node.scale);
      obj.visible = node.visible;

      this.objectMap.set(node.id, obj);

      if (node.parent && node.parent !== graph.root) {
        const parentObj = this.objectMap.get(node.parent.id);
        if (parentObj) {
          parentObj.add(obj);
          return;
        }
      }
      this.scene.add(obj);
    });
  }

  private createThreeObject(node: SceneNode): THREE.Object3D | null {
    switch (node.type) {
      case 'mesh':
        return this.createMesh(node as unknown as MeshNode);
      case 'light':
        return this.createLight(node as unknown as LightNode);
      case 'group':
        return new THREE.Group();
      default:
        return null;
    }
  }

  private createMesh(node: MeshNode): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    switch (node.geometry.type) {
      case 'sphere':
        geometry = new THREE.SphereGeometry(
          node.geometry.params?.['radius'] ?? 1,
          32,
          32,
        );
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(
          node.geometry.params?.['radiusTop'] ?? 1,
          node.geometry.params?.['radiusBottom'] ?? 1,
          node.geometry.params?.['height'] ?? 2,
          32,
        );
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(
          node.geometry.params?.['width'] ?? 10,
          node.geometry.params?.['height'] ?? 10,
        );
        break;
      case 'cone':
        geometry = new THREE.ConeGeometry(
          node.geometry.params?.['radius'] ?? 1,
          node.geometry.params?.['height'] ?? 2,
          32,
        );
        break;
      case 'torus':
        geometry = new THREE.TorusGeometry(
          node.geometry.params?.['radius'] ?? 1,
          node.geometry.params?.['tube'] ?? 0.4,
          16,
          100,
        );
        break;
      case 'box':
      default:
        geometry = new THREE.BoxGeometry(
          node.geometry.params?.['width'] ?? 1,
          node.geometry.params?.['height'] ?? 1,
          node.geometry.params?.['depth'] ?? 1,
        );
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(node.material.color),
      opacity: node.material.opacity,
      transparent: node.material.opacity < 1,
      wireframe: node.material.wireframe,
    });

    return new THREE.Mesh(geometry, material);
  }

  private createLight(node: LightNode): THREE.Light {
    const color = new THREE.Color(node.color);
    switch (node.lightType) {
      case 'ambient':
        return new THREE.AmbientLight(color, node.intensity);
      case 'point':
        return new THREE.PointLight(color, node.intensity);
      case 'spot':
        return new THREE.SpotLight(color, node.intensity);
      case 'directional':
      default:
        return new THREE.DirectionalLight(color, node.intensity);
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose(): void {
    this.renderer.dispose();
    this.objectMap.clear();
  }

  getThreeScene(): THREE.Scene {
    return this.scene;
  }

  getThreeCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getThreeRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }
}
