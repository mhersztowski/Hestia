import type { SceneNodeData } from '../scene/SceneNode';
import type { SceneNode } from '../scene/SceneNode';
import { SceneGraph } from '../scene/SceneGraph';
import type { SceneGraphData } from '../scene/SceneGraph';
import type { PrefabEntry } from './types';

function countNodes(data: SceneNodeData): number {
  return 1 + (data.children ?? []).reduce((sum, c) => sum + countNodes(c), 0);
}

function reId(data: SceneNodeData): SceneNodeData {
  return {
    ...data,
    id: crypto.randomUUID(),
    children: data.children?.map(reId),
  };
}

export class PrefabStore {
  /** Creates a PrefabEntry from a scene node (does not mutate anything). */
  static create(name: string, node: SceneNode, opts?: { version?: string; author?: string }): PrefabEntry {
    const nodeData = node.toData();
    return {
      id: crypto.randomUUID(),
      name,
      version: opts?.version?.trim() || '1.0.0',
      author: opts?.author?.trim() || '',
      createdAt: Date.now(),
      nodeData,
      nodeCount: countNodes(nodeData),
      rootType: nodeData.type,
    };
  }

  /** Returns a fresh SceneNode tree with new UUIDs, ready to add to a scene. */
  static instantiate(entry: PrefabEntry): SceneNode {
    const freshData: SceneNodeData = {
      ...reId(entry.nodeData),
      metadata: { prefabId: entry.id, prefabName: entry.name },
    };
    const syntheticGraph: SceneGraphData = {
      version: '1.0.0',
      root: {
        id: 'tmp-root',
        name: 'root',
        type: 'group',
        visible: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        children: [freshData],
      },
    };
    const tempGraph = SceneGraph.fromData(syntheticGraph);
    return tempGraph.root.children[0];
  }
}
