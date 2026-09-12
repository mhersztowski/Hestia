import { GLTFExporter as ThreeGLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { SceneGraph } from '../scene/SceneGraph';
import { buildThreeScene } from './SceneBuilder';

export class GLTFExporter {
  static async export(graph: SceneGraph): Promise<Blob> {
    const threeScene = buildThreeScene(graph);
    const exporter = new ThreeGLTFExporter();

    return new Promise((resolve, reject) => {
      exporter.parse(
        threeScene,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(new Blob([result], { type: 'model/gltf-binary' }));
          } else {
            const json = JSON.stringify(result, null, 2);
            resolve(new Blob([json], { type: 'model/gltf+json' }));
          }
        },
        reject,
        { binary: false },
      );
    });
  }
}
