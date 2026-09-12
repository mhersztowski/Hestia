/**
 * MdEnv — a document-scoped "environment variable" store for the markdown editor.
 *
 * Producers: File components (`fileRef` node) load a JSON file's data into a
 * named env var on page load. Consumers: the `envValue` marker renders an env
 * var's value as text, and PluginScript blocks read env vars via the `env` API.
 * Values live only for the editing session (not serialized to markdown).
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export interface MdEnvApi {
  get: (name: string) => unknown;
  all: () => Record<string, unknown>;
  set: (name: string, value: unknown) => void;
  /** Bumps on every write — consumers list it as a hook dep to re-render. */
  version: number;
  /** Subscribe to writes. Returns an unsubscribe fn. Used by consumers rendered
   *  inside TipTap node-view portals, where plain React-context updates don't
   *  reliably re-render them in production builds — so they use useSyncExternalStore. */
  subscribe: (cb: () => void) => () => void;
  /** Path of the document being edited (if known) — lets File chips resolve a
   *  co-located data file when their stored absolute path is stale (doc moved). */
  docPath?: string;
}

const MdEnvContext = createContext<MdEnvApi | null>(null);

/**
 * Resolve a possibly-dotted name against the store. An exact key wins (so keys
 * that literally contain dots still work); otherwise the first segment is the
 * env var and the rest is a path into the value — `podroz.meta.nazwa`,
 * `podroz.budzet.pozycje.0.kwota` (numeric segments index arrays).
 */
function resolveEnvName(store: Map<string, unknown>, name: string): unknown {
  if (store.has(name)) return store.get(name);
  const dot = name.indexOf('.');
  if (dot === -1) return store.get(name);
  const root = name.slice(0, dot);
  if (!store.has(root)) return undefined;
  let cur: unknown = store.get(root);
  for (const seg of name.slice(dot + 1).split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export const MdEnvProvider: React.FC<{ children: React.ReactNode; docPath?: string }> = ({ children, docPath }) => {
  const storeRef = useRef<Map<string, unknown>>(new Map());
  const subsRef = useRef<Set<() => void>>(new Set());
  const [version, setVersion] = useState(0);

  const set = useCallback((name: string, value: unknown) => {
    if (!name) return;
    const prev = storeRef.current.get(name);
    if (prev === value) return;
    storeRef.current.set(name, value);
    setVersion((v) => v + 1);
    // Notify external-store subscribers (TipTap node views) directly — they
    // can't rely on React-context propagation through the editor's portals.
    subsRef.current.forEach((cb) => cb());
  }, []);

  // Stable across renders so useSyncExternalStore doesn't resubscribe each time.
  const subscribe = useCallback((cb: () => void) => {
    subsRef.current.add(cb);
    return () => { subsRef.current.delete(cb); };
  }, []);

  const api = useMemo<MdEnvApi>(() => ({
    get: (name: string) => resolveEnvName(storeRef.current, name),
    all: () => Object.fromEntries(storeRef.current),
    set,
    version,
    subscribe,
    docPath,
  }), [set, subscribe, version, docPath]);

  return <MdEnvContext.Provider value={api}>{children}</MdEnvContext.Provider>;
};

/** Env API for the current document, or a no-op fallback outside a provider. */
export function useMdEnv(): MdEnvApi {
  const ctx = useContext(MdEnvContext);
  return ctx ?? NOOP_ENV;
}

const NOOP_ENV: MdEnvApi = { get: () => undefined, all: () => ({}), set: () => {}, version: 0, subscribe: () => () => {} };
