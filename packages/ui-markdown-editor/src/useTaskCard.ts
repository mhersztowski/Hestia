/**
 * Dane zadania dla karty osadzonej w dokumencie.
 *
 * Karta trzyma w markdownie **wyłącznie identyfikator** (plus nazwę jako
 * zapasową), a resztę czyta na żywo. To jest cała różnica między tą kartą
 * a zwykłym linkiem: status, termin i postęp zmieniają się codziennie, a
 * notatka sprzed miesiąca ma pokazywać stan dzisiejszy, nie zamrożony w chwili
 * wstawienia. Snapshot w pliku znaczyłby, że dokument kłamie tym pewniej,
 * im dłużej leży.
 *
 * Nazwa jest zapisana mimo to — jako jedyne, co zostaje, gdy zadanie zniknie.
 * Karta powie wtedy „zadanie usunięte", a nie pokaże pustego miejsca.
 */

import { useMemo } from 'react';
import type { TaskModel } from '@hestia/core';
import { useEditorProjectData } from './capabilities';

/** Zadanie po drugiej stronie zależności — tyle, ile karta pokazuje. */
export interface RelatedTask {
  id: string;
  name: string;
  /** Czy jest już zrobione — po tym karta wie, co przekreślić. */
  done: boolean;
}

export interface TaskCardData {
  /** Pełny model, jeśli zadanie nadal istnieje. */
  task: TaskModel | null;
  projectName?: string | undefined;
  /** Minuty faktycznie przepracowane, policzone z wpisów czasu. */
  trackedMinutes: number;
  /**
   * Poprzedniki — to, na co zadanie czeka. Wprost z `dependsOn`.
   */
  waitsFor: RelatedTask[];
  /**
   * Następniki — to, co zadanie blokuje.
   *
   * Liczone z ogółu zadań, bo w pliku zapisana jest **tylko jedna strona**
   * relacji. Dwie listy rozjeżdżają się przy pierwszym usunięciu zadania
   * i nie ma wtedy jak rozstrzygnąć, która kłamie.
   */
  blocks: RelatedTask[];
}

/** Suma wpisów czasu. Wpis bez końca liczy się do teraz — tak samo jak w PIM. */
function trackedOf(task: TaskModel | null): number {
  if (!task?.timeEntries?.length) return 0;
  let total = 0;
  for (const entry of task.timeEntries) {
    const start = entry.start ? Date.parse(entry.start) : NaN;
    if (Number.isNaN(start)) continue;
    const end = entry.end ? Date.parse(entry.end) : Date.now();
    if (Number.isNaN(end) || end < start) continue;
    total += (end - start) / 60000;
  }
  return Math.round(total);
}

export function useTaskCard(taskId: string): TaskCardData {
  const dataSource = useEditorProjectData();

  return useMemo(() => {
    const pusty: TaskCardData = { task: null, trackedMinutes: 0, waitsFor: [], blocks: [] };
    if (!taskId) return pusty;
    try {
      // Wpisy bywają węzłami (`TaskNode`) albo gołymi modelami — zależnie
      // od tego, kto je dostarczył. Bierzemy `model`, gdy jest.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = dataSource?.tasks ?? [];
      const found = items.find((t) => String(t.id ?? t.model?.id ?? '') === taskId);
      const task: TaskModel | null = found ? (found.model ?? found) : null;

      // Wszystkie zadania jako modele — potrzebne obu stronom relacji.
      const wszystkie: TaskModel[] = items.map((t) => (t.model ?? t) as TaskModel);
      const zrobione = (t: TaskModel) => t.status === 'done';
      const skrot = (t: TaskModel): RelatedTask => ({
        id: t.id,
        name: t.name,
        done: zrobione(t),
      });

      const waitsFor = (task?.dependsOn ?? [])
        .map((id) => wszystkie.find((t) => t.id === id))
        .filter((t): t is TaskModel => Boolean(t))
        .map(skrot);

      const blocks = task ? wszystkie.filter((t) => t.dependsOn?.includes(task.id)).map(skrot) : [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projects: any[] = dataSource?.projects ?? [];
      const project = task?.projectId
        ? projects.find((p) => String(p.id ?? p.model?.id ?? '') === task.projectId)
        : undefined;

      return {
        task,
        projectName: project ? String(project.name ?? project.model?.name ?? '') : undefined,
        trackedMinutes: trackedOf(task),
        waitsFor,
        blocks,
      };
    } catch {
      return pusty;
    }
  }, [taskId, dataSource]);
}

/** `95` → `1h 35m`. Puste dla zera, żeby karta nie pokazywała „0m" bez powodu. */
export function formatMinutes(total: number): string {
  if (!total) return '';
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours ? `${hours}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
}
