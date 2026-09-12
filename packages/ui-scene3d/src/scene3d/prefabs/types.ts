import type { SceneNodeData } from '../scene/SceneNode';

export interface PrefabEntry {
  id: string;
  name: string;
  version: string;
  author: string;
  createdAt: number;
  nodeData: SceneNodeData;
  /** Total node count in the subtree (for display). */
  nodeCount: number;
  /** Type of the root node (mesh, group, light, …). */
  rootType: string;
}
