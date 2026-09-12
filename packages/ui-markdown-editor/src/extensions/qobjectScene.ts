/**
 * Model „sceny" obiektów QObject przechowywanej w pliku JSON (wybieranym w
 * ustawieniach skryptu automatyzacji). Scena to drzewo węzłów (rodzic → dzieci),
 * każdy z klasą, nazwą (objectName) i właściwościami. Panel inspektora QObject
 * ładuje ją przy otwarciu edytora, pozwala edytować i zapisuje przy „Zapisz".
 *
 * Wszystkie operacje są czyste (zwracają NOWĄ scenę), żeby dobrze współgrały z
 * Reactem (setScene).
 */

export interface QObjectSceneNode {
  id: string;
  className: string;
  objectName?: string;
  properties: { key: string; value: string }[];
  children: QObjectSceneNode[];
}

export interface QObjectScene {
  type: 'qobject-scene';
  version: 1;
  roots: QObjectSceneNode[];
}

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fallthrough */ }
  return 'n' + Math.random().toString(36).slice(2, 10);
}

export function emptyScene(): QObjectScene {
  return { type: 'qobject-scene', version: 1, roots: [] };
}

/** Normalizuje dowolny wczytany JSON do poprawnej sceny (tolerancyjnie). */
export function normalizeScene(raw: unknown): QObjectScene {
  const r = raw as Partial<QObjectScene> | null;
  const fix = (n: unknown): QObjectSceneNode => {
    const o = (n ?? {}) as Partial<QObjectSceneNode> & { properties?: unknown };
    let props: { key: string; value: string }[] = [];
    if (Array.isArray(o.properties)) {
      props = o.properties.map((p) => ({ key: String((p as { key?: unknown }).key ?? ''), value: String((p as { value?: unknown }).value ?? '') }));
    } else if (o.properties && typeof o.properties === 'object') {
      props = Object.entries(o.properties as Record<string, unknown>).map(([key, value]) => ({ key, value: String(value) }));
    }
    return {
      id: typeof o.id === 'string' && o.id ? o.id : genId(),
      className: String(o.className ?? 'QObject'),
      objectName: o.objectName != null ? String(o.objectName) : undefined,
      properties: props,
      children: Array.isArray(o.children) ? o.children.map(fix) : [],
    };
  };
  return { type: 'qobject-scene', version: 1, roots: Array.isArray(r?.roots) ? r!.roots!.map(fix) : [] };
}

export function newNode(className: string, objectName?: string): QObjectSceneNode {
  return { id: genId(), className, objectName, properties: [], children: [] };
}

export function cloneScene(scene: QObjectScene): QObjectScene {
  return normalizeScene(JSON.parse(JSON.stringify(scene)));
}

/** Głęboka kopia węzła z NOWYMI id (do paste). */
export function cloneNodeFresh(node: QObjectSceneNode): QObjectSceneNode {
  return {
    id: genId(),
    className: node.className,
    objectName: node.objectName,
    properties: node.properties.map((p) => ({ ...p })),
    children: node.children.map(cloneNodeFresh),
  };
}

export function findNode(scene: QObjectScene, id: string): QObjectSceneNode | null {
  const walk = (list: QObjectSceneNode[]): QObjectSceneNode | null => {
    for (const n of list) {
      if (n.id === id) return n;
      const hit = walk(n.children);
      if (hit) return hit;
    }
    return null;
  };
  return walk(scene.roots);
}

/** Zwraca nową scenę z węzłem dodanym pod `parentId` (null = korzeń). */
export function addNode(scene: QObjectScene, parentId: string | null, node: QObjectSceneNode): QObjectScene {
  const next = cloneScene(scene);
  if (!parentId) { next.roots.push(node); return next; }
  const parent = findNode(next, parentId);
  if (parent) parent.children.push(node);
  else next.roots.push(node);
  return next;
}

/** Zwraca { scene, removed } — nową scenę bez węzła `id`. */
export function removeNode(scene: QObjectScene, id: string): { scene: QObjectScene; removed: QObjectSceneNode | null } {
  const next = cloneScene(scene);
  let removed: QObjectSceneNode | null = null;
  const strip = (list: QObjectSceneNode[]): QObjectSceneNode[] => {
    const out: QObjectSceneNode[] = [];
    for (const n of list) {
      if (n.id === id) { removed = n; continue; }
      n.children = strip(n.children);
      out.push(n);
    }
    return out;
  };
  next.roots = strip(next.roots);
  return { scene: next, removed };
}

/** Zwraca nową scenę z podmienionym węzłem (po id) przez `mutate`. */
export function updateNode(scene: QObjectScene, id: string, mutate: (n: QObjectSceneNode) => void): QObjectScene {
  const next = cloneScene(scene);
  const n = findNode(next, id);
  if (n) mutate(n);
  return next;
}
