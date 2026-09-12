import type { SceneGraph, SceneGraphData } from '../scene/SceneGraph';

export class SceneSerializer {
  static serialize(graph: SceneGraph): string {
    return JSON.stringify(SceneSerializer.serializeToObject(graph), null, 2);
  }

  static serializeToObject(graph: SceneGraph): SceneGraphData {
    return graph.toData();
  }
}
