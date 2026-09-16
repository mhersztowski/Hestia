import { useCallback, useSyncExternalStore } from 'react';
import type { Toolbar, ToolbarNode, UiObject } from '@hestia/core';
import { Toolbar as ToolbarObject } from '@hestia/core';
import { useEffect, useMemo } from 'react';

/**
 * Re-render whenever anything in `host` changes — a label, a checkmark, an item
 * added or removed.
 *
 * One subscription covers the whole tree: `UiObject.changed` already carries
 * changes up from every item below, and `revision` is the number React compares.
 * Nothing here reads the toolbar's contents, so a component using it re-renders
 * on a change and reads whatever is current at that moment.
 */
export function useToolbarRevision(host: UiObject): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const connection = host.changed.connect(onChange);
      return () => connection.disconnect();
    },
    [host]
  );
  return useSyncExternalStore(
    subscribe,
    () => host.revision,
    () => host.revision
  );
}

/**
 * A live toolbar built from a plain tree, rebuilt when the tree changes and
 * destroyed when it is replaced.
 *
 * For a component that keeps its menu in React state and hands it over as
 * literals — which is how most of them started. A component that owns its
 * toolbar should build one `Toolbar` and keep it instead: then a checkmark
 * changes without React rebuilding anything.
 */
export function useToolbarFromModel(nodes: readonly ToolbarNode[] | undefined): Toolbar {
  const toolbar = useMemo(() => ToolbarObject.fromModel(nodes ?? []), [nodes]);
  useEffect(() => () => toolbar.destroy(), [toolbar]);
  return toolbar;
}

/**
 * The shortcut a key press stands for, in the form the model writes it:
 * `Ctrl+S`, `Ctrl+Shift+E`, `Alt+Enter`.
 *
 * The Command key is reported as Ctrl, because a menu that says `Ctrl+S` on
 * every platform should answer to the key a Mac user presses for it. Printable
 * keys are upper-cased so that `s` and `S` are one shortcut; named keys
 * (`Enter`, `Delete`) keep the name the browser gives them.
 */
export function shortcutFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return parts.join('+');
}

/** Anything that can say what a shortcut means: a `Toolbar`, or an `ActionCollection`. */
export interface ShortcutSource {
  triggerShortcut(shortcut: string): boolean;
}

/**
 * Make the shortcuts written in a menu actually work.
 *
 * `Ctrl+S` beside "Save" was a label and nothing more: something had to bind the
 * key, and nothing did. The toolbar already knows which action a shortcut
 * belongs to, so binding it is one listener — and the action is performed
 * through `trigger()`, which means a disabled entry stays disabled from the
 * keyboard too.
 *
 * A press with no modifier is left alone: it is somebody typing.
 *
 * A collection is often the better thing to bind: a shortcut belongs to the
 * command, and the command is not always on a toolbar.
 */
export function useShortcuts(toolbar: ShortcutSource | null | undefined, enabled = true): void {
  useEffect(() => {
    if (!toolbar || !enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
      if (toolbar.triggerShortcut(shortcutFromEvent(event))) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toolbar, enabled]);
}
