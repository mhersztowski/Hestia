import { OBJExporter as ThreeOBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import type { SceneGraph } from '../scene/SceneGraph';
import { buildThreeScene } from './SceneBuilder';

export class OBJExporter {
  static export(graph: SceneGraph): string {
    const scene = buildThreeScene(graph);
    const exporter = new ThreeOBJExporter();
    return exporter.parse(scene);
  }
}
