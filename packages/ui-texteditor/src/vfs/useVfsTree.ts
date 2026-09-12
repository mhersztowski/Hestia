import { useState, useEffect, useRef, useCallback } from 'react';
import type { FileSystemProvider } from '@hestia/core';
import { FileType, normalize } from '@hestia/core';
import type { VfsTreeNode } from './types';

/** Insert/update children of a parent node in the tree, preserving already-loaded subtrees */
function mergeChildren(
  tree: VfsTreeNode[],
  parentId: string,
  children: VfsTreeNode[],
): VfsTreeNode[] {
  return tree.map(node => {
    if (node.id === parentId) {
      const existingMap = new Map((node.children ?? []).map(c => [c.id, c]));
      const merged = children.map(child => {
        const existing = existingMap.get(child.id);
        if (existing && child.isDirectory && existing.children && existing.children.length > 0) {
          return { ...child, children: existing.children };
        }
        return child;
      });
      return { ...node, children: merged };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: mergeChildren(node.children, parentId, children) };
    }
    return node;
  });
}

export function useVfsTree(provider: FileSystemProvider, rootPath: string = '/') {
  const rp = normalize(rootPath);
  const [items, setItems] = useState<VfsTreeNode[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedDirsRef = useRef(new Set<string>());
  const pendingRef = useRef(0);

  const startLoading = useCallback(() => {
    pendingRef.current += 1;
    setLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    pendingRef.current = Math.max(0, pendingRef.current - 1);
    if (pendingRef.current === 0) setLoading(false);
  }, []);

  /** Read a directory and return sorted VfsTreeNode children */
  const buildNodes = useCallback(async (dirPath: string): Promise<VfsTreeNode[]> => {
    const dp = normalize(dirPath);
    const entries = await provider.readDirectory(dp);
    entries.sort((a, b) => {
      const aDir = a.type === FileType.Directory ? 0 : 1;
      const bDir = b.type === FileType.Directory ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return entries.map(e => {
      const childPath = normalize(dp === '/' ? '/' + e.name : dp + '/' + e.name);
      const isDir = e.type === FileType.Directory;
      return {
        id: childPath,
        label: e.name,
        isDirectory: isDir,
        children: isDir ? [] : undefined,
      };
    });
  }, [provider]);

  /** Rebuild the entire tree by reloading all previously loaded directories */
  const refresh = useCallback(async () => {
    const dirs = [...loadedDirsRef.current].sort(
      (a, b) => a.split('/').length - b.split('/').length,
    );

    let newTree: VfsTreeNode[] = [];
    const newLoaded = new Set<string>();

    startLoading();
    try {
      for (const dir of dirs) {
        try {
          const children = await buildNodes(dir);
          newLoaded.add(dir);
          if (dir === rp) {
            newTree = children;
          } else {
            newTree = mergeChildren(newTree, dir, children);
          }
        } catch {
          // Directory may have been deleted
        }
      }
      loadedDirsRef.current = newLoaded;
      setItems(newTree);
    } finally {
      stopLoading();
    }
  }, [rp, buildNodes, startLoading, stopLoading]);

  // Keep latest refresh in ref to avoid stale closures in event subscription
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Load root children on mount
  useEffect(() => {
    loadedDirsRef.current.clear();
    setExpandedItems([]);
    startLoading();
    buildNodes(rp)
      .then(nodes => {
        loadedDirsRef.current.add(rp);
        setItems(nodes);
      })
      .catch(() => setItems([]))
      .finally(() => stopLoading());
  }, [provider, rp, buildNodes, startLoading, stopLoading]);

  // Subscribe to VFS change events
  useEffect(() => {
    if (!provider.onDidChangeFile) return;
    const disposable = provider.onDidChangeFile(() => {
      refreshRef.current();
    });
    return () => disposable.dispose();
  }, [provider]);

  /** Handle directory expansion — lazy load children */
  const handleItemExpansionToggle = useCallback(
    async (_event: React.SyntheticEvent | null, itemId: string, isExpanded: boolean) => {
      if (isExpanded && !loadedDirsRef.current.has(itemId)) {
        startLoading();
        try {
          const children = await buildNodes(itemId);
          loadedDirsRef.current.add(itemId);
          setItems(prev => mergeChildren(prev, itemId, children));
        } catch {
          // Ignore errors for directories that can't be read
        } finally {
          stopLoading();
        }
      }
    },
    [buildNodes, startLoading, stopLoading],
  );

  return {
    items,
    expandedItems,
    loading,
    setExpandedItems,
    handleItemExpansionToggle,
    refresh,
  };
}
