import { useState, useCallback, useRef } from 'react';
import { Project } from '../../cad2d/barrel';
import type {
  FaceRef,
  Feature,
  FeatureTree,
  SketchFeature,
  SketchPlane,
  Vec3,
} from '../model/types';
import {
  defaultChamfer,
  defaultDatumCs,
  defaultDatumLine,
  defaultDatumPlane,
  defaultDatumPoint,
  defaultExtrude,
  defaultFillet,
  defaultGroove,
  defaultHelix,
  defaultHole,
  defaultLinearPattern,
  defaultLoft,
  defaultLoftCut,
  defaultMirror,
  defaultPocket,
  defaultPolarPattern,
  defaultRevolve,
  defaultShell,
  defaultSketch,
  defaultSweep,
  defaultSweepCut,
} from '../model/types';

const STORAGE_KEY = 'cad3d-feature-tree';

// Persistence is OFF. The scene used to be written to localStorage, which left
// people with state older than the code that reads it — sketches on a face with
// no faceRef, types that have since changed, defaults that have moved. Every
// reload now starts clean, and the old key is deleted to clear what is there.
function load(): FeatureTree {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* SSR / disabled storage */
  }
  return { version: 1 as const, features: [] };
}

function save(_tree: FeatureTree): void {
  // no-op — nie zapisujemy sceny do localStorage
}

export interface Cad3dState {
  tree: FeatureTree;
  selectedId: string | null;
  editingSketchId: string | null;
  mergeFeatures: (json: string) => void;
  /** Zwraca aktualne drzewo jako JSON (do save na backend). */
  getTreeJson: () => string;
  /** Replaces the tree with one from JSON (opening a file) and rebuilds the sketch projects. */
  replaceTree: (json: string) => void;
  addSketch: (
    plane?: SketchPlane,
    offset?: number,
    planeMatrix?: number[],
    faceRef?: FaceRef
  ) => void;
  startEditSketch: (id: string) => void;
  exitSketch: () => void;
  getSketchProject: (id: string) => Project;
  addExtrude: (sketchId: string | null, entityIds: string[]) => void;
  addPocket: (sketchId: string | null, entityIds: string[]) => void;
  addHole: (sketchId: string | null) => void;
  addGroove: (sketchId: string | null, entityIds: string[]) => void;
  addMirror: () => void;
  addRevolve: (sketchId: string | null, entityIds: string[]) => void;
  addShell: () => void;
  addFillet: () => void;
  addChamfer: () => void;
  addLinearPattern: () => void;
  addPolarPattern: () => void;
  addLoft: () => void;
  addLoftCut: () => void;
  addSweep: () => void;
  addSweepCut: () => void;
  addHelix: () => void;
  addDatumPoint: (position?: Vec3) => void;
  addDatumLine: (position?: Vec3, direction?: Vec3, length?: number) => void;
  addDatumPlane: (position?: Vec3, normal?: Vec3, size?: number) => string;
  addDatumCs: (position?: Vec3, rotation?: Vec3, size?: number) => void;
  removeFeature: (id: string) => void;
  updateFeature: (id: string, patch: Partial<Feature>) => void;
  toggleFeature: (id: string) => void;
  moveFeature: (id: string, direction: 'up' | 'down') => void;
  selectFeature: (id: string | null) => void;
  clearTree: () => void;
}

export function useCad3d(): Cad3dState {
  const [tree, setTree] = useState<FeatureTree>(load);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSketchId, setEditingSketchId] = useState<string | null>(null);

  // Ref to current tree so callbacks can read it without stale closures
  const treeRef = useRef<FeatureTree>(tree);
  treeRef.current = tree;

  // In-memory sketch projects (survive re-renders, lost on page reload → reloaded from projectData)
  const sketchProjectsRef = useRef<Map<string, Project>>(new Map());

  // ── Sketch project management ───────────────────────────────────────────────

  const getSketchProject = useCallback((id: string): Project => {
    if (!sketchProjectsRef.current.has(id)) {
      const sketch = treeRef.current.features.find((f) => f.id === id && f.type === 'sketch') as
        SketchFeature | undefined;

      let p: Project;
      if (sketch?.projectData) {
        try {
          p = Project.fromJSON(JSON.parse(sketch.projectData));
        } catch {
          p = new Project();
        }
      } else {
        p = new Project();
      }
      sketchProjectsRef.current.set(id, p);
    }
    return sketchProjectsRef.current.get(id)!;
  }, []);

  const addSketch = useCallback(
    (plane: SketchPlane = 'XY', offset = 0, planeMatrix?: number[], faceRef?: FaceRef) => {
      const f = defaultSketch(plane, offset, planeMatrix, faceRef);
      sketchProjectsRef.current.set(f.id, new Project());
      setTree((prev) => {
        const next = { ...prev, features: [...prev.features, f] };
        save(next);
        return next;
      });
      setSelectedId(f.id);
      setEditingSketchId(f.id);
    },
    []
  );

  const startEditSketch = useCallback(
    (id: string) => {
      getSketchProject(id); // ensure loaded into memory
      setEditingSketchId(id);
      setSelectedId(id);
    },
    [getSketchProject]
  );

  const exitSketch = useCallback(() => {
    const id = editingSketchId;
    if (!id) return;
    const p = sketchProjectsRef.current.get(id);
    if (p) {
      const projectData = JSON.stringify(p.toJSON());
      setTree((prev) => {
        const next = {
          ...prev,
          features: prev.features.map((f) =>
            f.id === id ? ({ ...(f as SketchFeature), projectData } as Feature) : f
          ),
        };
        save(next);
        return next;
      });
    }
    setEditingSketchId(null);
  }, [editingSketchId]);

  // ── Feature operations ──────────────────────────────────────────────────────

  const addExtrude = useCallback((sketchId: string | null, entityIds: string[]) => {
    const f = defaultExtrude(sketchId, entityIds);
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addPocket = useCallback((sketchId: string | null, entityIds: string[]) => {
    const f = defaultPocket(sketchId, entityIds);
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addHole = useCallback((sketchId: string | null) => {
    const f = defaultHole(sketchId);
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addGroove = useCallback((sketchId: string | null, entityIds: string[]) => {
    const f = defaultGroove(sketchId, entityIds);
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addMirror = useCallback(() => {
    const f = defaultMirror();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addShell = useCallback(() => {
    const f = defaultShell();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addFillet = useCallback(() => {
    const f = defaultFillet();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addChamfer = useCallback(() => {
    const f = defaultChamfer();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addLinearPattern = useCallback(() => {
    const f = defaultLinearPattern();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addPolarPattern = useCallback(() => {
    const f = defaultPolarPattern();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addLoft = useCallback(() => {
    const f = defaultLoft();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addLoftCut = useCallback(() => {
    const f = defaultLoftCut();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addSweep = useCallback(() => {
    const f = defaultSweep();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addSweepCut = useCallback(() => {
    const f = defaultSweepCut();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addHelix = useCallback(() => {
    const f = defaultHelix();
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addRevolve = useCallback((sketchId: string | null, entityIds: string[]) => {
    const f = defaultRevolve(sketchId, entityIds);
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
  }, []);

  const addDatum = useCallback((f: Feature): string => {
    setTree((prev) => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
    return f.id;
  }, []);
  const addDatumPoint = useCallback(
    (position?: Vec3) => addDatum(defaultDatumPoint(position)),
    [addDatum]
  );
  const addDatumLine = useCallback(
    (position?: Vec3, direction?: Vec3, length?: number) =>
      addDatum(defaultDatumLine(position, direction, length)),
    [addDatum]
  );
  const addDatumPlane = useCallback(
    (position?: Vec3, normal?: Vec3, size?: number): string =>
      addDatum(defaultDatumPlane(position, normal, size)),
    [addDatum]
  );
  const addDatumCs = useCallback(
    (position?: Vec3, rotation?: Vec3, size?: number) =>
      addDatum(defaultDatumCs(position, rotation, size)),
    [addDatum]
  );

  const removeFeature = useCallback((id: string) => {
    sketchProjectsRef.current.delete(id);
    setTree((prev) => {
      const next = { ...prev, features: prev.features.filter((f) => f.id !== id) };
      save(next);
      return next;
    });
    setSelectedId((prev) => (prev === id ? null : prev));
    setEditingSketchId((prev) => (prev === id ? null : prev));
  }, []);

  const updateFeature = useCallback((id: string, patch: Partial<Feature>) => {
    setTree((prev) => {
      const next = {
        ...prev,
        features: prev.features.map((f) => (f.id === id ? ({ ...f, ...patch } as Feature) : f)),
      };
      save(next);
      return next;
    });
  }, []);

  const toggleFeature = useCallback((id: string) => {
    setTree((prev) => {
      const next = {
        ...prev,
        features: prev.features.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)),
      };
      save(next);
      return next;
    });
  }, []);

  const moveFeature = useCallback((id: string, direction: 'up' | 'down') => {
    setTree((prev) => {
      const idx = prev.features.findIndex((f) => f.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.features.length) return prev;
      const arr = [...prev.features];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      const next = { ...prev, features: arr };
      save(next);
      return next;
    });
  }, []);

  const selectFeature = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const mergeFeatures = useCallback((json: string) => {
    try {
      const data = JSON.parse(json) as FeatureTree;
      const idMap = new Map<string, string>();
      for (const f of data.features) {
        idMap.set(f.id, crypto.randomUUID());
      }
      const remapped = data.features.map((f) => {
        const base = { ...f, id: idMap.get(f.id)! } as Feature & { sketchId?: string | null };
        if (base.sketchId) base.sketchId = idMap.get(base.sketchId) ?? base.sketchId;
        return base as Feature;
      });
      setTree((prev) => {
        const next = { ...prev, features: [...prev.features, ...remapped] };
        save(next);
        return next;
      });
    } catch (e) {
      console.error('[useCad3d] mergeFeatures failed', e);
    }
  }, []);

  const clearTree = useCallback(() => {
    sketchProjectsRef.current.clear();
    const next: FeatureTree = { version: 1 as const, features: [] };
    setTree(next);
    save(next);
    setSelectedId(null);
    setEditingSketchId(null);
  }, []);

  /** Serializuje aktualne drzewo do JSON (dla zapisu na backend VFS). */
  const getTreeJson = useCallback((): string => {
    return JSON.stringify(treeRef.current, null, 2);
  }, []);

  /**
   * Replaces the whole tree with one from JSON (opening a file). Unlike
   * `mergeFeatures` it remaps no ids and appends nothing — it restores. It also
   * rebuilds `sketchProjectsRef` from `sketch.projectData`, so sketches can be edited after opening.
   */
  const replaceTree = useCallback((json: string) => {
    try {
      const data = JSON.parse(json) as FeatureTree;
      if (!data || !Array.isArray(data.features)) {
        console.warn('[useCad3d] replaceTree: invalid JSON structure');
        return;
      }
      sketchProjectsRef.current.clear();
      for (const f of data.features) {
        if (f.type === 'sketch' && (f as SketchFeature).projectData) {
          try {
            const p = Project.fromJSON(JSON.parse((f as SketchFeature).projectData!));
            sketchProjectsRef.current.set(f.id, p);
          } catch (e) {
            console.warn('[useCad3d] failed to restore sketch project', f.id, e);
            sketchProjectsRef.current.set(f.id, new Project());
          }
        }
      }
      setTree({ version: 1 as const, features: data.features });
      setSelectedId(null);
      setEditingSketchId(null);
    } catch (e) {
      console.error('[useCad3d] replaceTree failed', e);
    }
  }, []);

  return {
    tree,
    selectedId,
    editingSketchId,
    mergeFeatures,
    getTreeJson,
    replaceTree,
    addSketch,
    startEditSketch,
    exitSketch,
    getSketchProject,
    addExtrude,
    addPocket,
    addHole,
    addGroove,
    addMirror,
    addRevolve,
    addShell,
    addFillet,
    addChamfer,
    addLinearPattern,
    addPolarPattern,
    addLoft,
    addLoftCut,
    addSweep,
    addSweepCut,
    addHelix,
    addDatumPoint,
    addDatumLine,
    addDatumPlane,
    addDatumCs,
    removeFeature,
    updateFeature,
    toggleFeature,
    moveFeature,
    selectFeature,
    clearTree,
  };
}
