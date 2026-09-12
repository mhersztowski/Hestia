import { SceneGraph } from '../scene/SceneGraph';
import type { SceneGraphData } from '../scene/SceneGraph';

export class SceneDeserializer {
  static deserialize(json: string): SceneGraph {
    const data: SceneGraphData = JSON.parse(json);
    return SceneDeserializer.deserializeFromObject(data);
  }

  static deserializeFromObject(data: SceneGraphData): SceneGraph {
    return SceneGraph.fromData(data);
  }
}
