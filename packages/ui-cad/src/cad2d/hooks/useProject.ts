import { useCallback, useEffect, useState } from 'react';
import type { Project } from '../core';

/**
 * A counter that goes up whenever the project changes.
 *
 * `Project` is a plain object with an event bus, not React state — the panels
 * and the canvas would otherwise keep drawing the previous drawing. Passing the
 * counter down as `version` is what tells them to look again.
 */
export function useProject(project: Project) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const unsubs = [
      project.eventBus.on('entity:added', bump),
      project.eventBus.on('entity:updated', bump),
      project.eventBus.on('entity:removed', bump),
      project.eventBus.on('layer:added', bump),
      project.eventBus.on('layer:updated', bump),
      project.eventBus.on('layer:removed', bump),
      project.eventBus.on('selection:changed', bump),
      project.eventBus.on('history:changed', bump),
      project.eventBus.on('project:loaded', bump),
    ];
    return () => unsubs.forEach((u) => u());
  }, [project, bump]);

  return { version };
}
