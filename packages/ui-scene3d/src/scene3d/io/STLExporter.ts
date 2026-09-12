import { STLExporter as ThreeSTLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { SceneGraph } from '../scene/SceneGraph';
import { buildThreeScene } from './SceneBuilder';

export class STLExporter {
  static export(graph: SceneGraph): DataView {
    const scene = buildThreeScene(graph);
    const exporter = new ThreeSTLExporter();
    return exporter.parse(scene, { binary: true }) as DataView;
  }
}
