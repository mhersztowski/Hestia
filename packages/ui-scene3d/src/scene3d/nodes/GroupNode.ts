import { SceneNode } from '../scene/SceneNode';
import type { SceneNodeData } from '../scene/SceneNode';

export class GroupNode extends SceneNode {
  constructor(data?: Partial<SceneNodeData>) {
    super({ ...data, type: 'group' });
  }
}
