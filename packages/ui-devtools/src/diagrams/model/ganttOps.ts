/**
 * ganttOps.ts — zmiany w harmonogramie.
 *
 * Jak wszędzie: czyste funkcje `dokument → dokument`, żadnej mutacji w miejscu.
 * Jedna rzecz jest tu własna — **usunięcie zadania zrywa cudze zależności**.
 * `after a1` po skasowaniu `a1` przestaje cokolwiek znaczyć, a Mermaid w takim
 * wypadku po cichu wstawia dzisiejszą datę. Dlatego przy usuwaniu podmieniamy
 * odniesienia na to, na czym stało usunięte zadanie — harmonogram zostaje
 * ciągły zamiast rozjechać się bez śladu.
 */
import type { DiagramDocument } from './diagram';
import { emptyGantt, type GanttChart, type GanttSection, type GanttTag, type GanttTask } from './gantt';

function withChart(doc: DiagramDocument, change: (chart: GanttChart) => GanttChart): DiagramDocument {
  return { ...doc, gantt: change(doc.gantt ?? emptyGantt()) };
}

function mapSection(chart: GanttChart, index: number, change: (section: GanttSection) => GanttSection): GanttChart {
  return { ...chart, sections: chart.sections.map((section, i) => (i === index ? change(section) : section)) };
}

export function addSection(doc: DiagramDocument, label: string, afterIndex?: number): DiagramDocument {
  return withChart(doc, (chart) => {
    const sections = [...chart.sections];
    sections.splice(afterIndex === undefined ? sections.length : afterIndex + 1, 0, { label, tasks: [] });
    return { ...chart, sections };
  });
}

export function updateSection(doc: DiagramDocument, index: number, label: string): DiagramDocument {
  return withChart(doc, (chart) => mapSection(chart, index, (section) => ({ ...section, label })));
}

export function removeSection(doc: DiagramDocument, index: number): DiagramDocument {
  return withChart(doc, (chart) => ({ ...chart, sections: chart.sections.filter((_, i) => i !== index) }));
}

export function moveSection(doc: DiagramDocument, from: number, to: number): DiagramDocument {
  return withChart(doc, (chart) => {
    if (to < 0 || to >= chart.sections.length) return chart;
    const sections = [...chart.sections];
    const [moved] = sections.splice(from, 1);
    sections.splice(to, 0, moved);
    return { ...chart, sections };
  });
}

/**
 * Dokłada zadanie; bez `afterIndex` na końcu sekcji.
 *
 * Nowe zadanie nie dostaje ani identyfikatora, ani początku — samo trwanie
 * znaczy „po poprzednim", czyli dokładnie to, czego się oczekuje po dołożeniu
 * pozycji do harmonogramu.
 */
export function addTask(doc: DiagramDocument, sectionIndex: number, label: string, afterIndex?: number): DiagramDocument {
  return withChart(doc, (chart) => {
    if (!chart.sections.length) {
      return { ...chart, sections: [{ tasks: [{ label, tags: [], end: { kind: 'duration', value: '1d' } }] }] };
    }
    return mapSection(chart, sectionIndex, (section) => {
      const tasks = [...section.tasks];
      tasks.splice(afterIndex === undefined ? tasks.length : afterIndex + 1, 0, {
        label, tags: [], end: { kind: 'duration', value: '1d' },
      });
      return { ...section, tasks };
    });
  });
}

export function updateTask(
  doc: DiagramDocument,
  sectionIndex: number,
  taskIndex: number,
  patch: Partial<GanttTask>,
): DiagramDocument {
  return withChart(doc, (chart) => mapSection(chart, sectionIndex, (section) => ({
    ...section,
    tasks: section.tasks.map((task, i) => {
      if (i !== taskIndex) return task;
      const next = { ...task, ...patch };
      // Skoro zmiana czegokolwiek znaczy, że rozumiemy tę pozycję, zapis
      // źródłowy przestaje obowiązywać — inaczej nadpisałby edycję.
      if (patch.raw === undefined && task.raw !== undefined) delete next.raw;
      return next;
    }),
  })));
}

export function toggleTag(doc: DiagramDocument, sectionIndex: number, taskIndex: number, tag: GanttTag): DiagramDocument {
  return withChart(doc, (chart) => mapSection(chart, sectionIndex, (section) => ({
    ...section,
    tasks: section.tasks.map((task, i) => {
      if (i !== taskIndex) return task;
      const has = task.tags.includes(tag);
      return { ...task, tags: has ? task.tags.filter((t) => t !== tag) : [...task.tags, tag] };
    }),
  })));
}

/**
 * Usuwa zadanie i naprawia odniesienia do niego.
 *
 * Zadania, które czekały na usunięte, przejmują jego początek: `after usunięte`
 * staje się tym, na co czekało usunięte zadanie. Gdy nie da się tego ustalić
 * (usunięte zaczynało się datą), odniesienie znika, a zadanie rusza po
 * poprzedniku — to nadal lepiej niż nazwa wskazująca w próżnię.
 */
export function removeTask(doc: DiagramDocument, sectionIndex: number, taskIndex: number): DiagramDocument {
  return withChart(doc, (chart) => {
    const removed = chart.sections[sectionIndex]?.tasks[taskIndex];
    if (!removed) return chart;

    const inherited = removed.start?.kind === 'after' ? removed.start.ids : undefined;
    /**
     * `inherit` obowiązuje tylko dla `after`: „czekałem na X, X czekał na Y"
     * daje się przepisać na „czekam na Y". Dla `until` takiej zamiany nie ma —
     * koniec wyznaczał **początek** X, a początek X nie jest żadnym zadaniem.
     *
     * `selfId` odsiewa odniesienie do samego siebie, które powstałoby przy
     * dziedziczeniu z zapętlonych zależności.
     */
    const patchIds = (ids: string[], selfId: string | undefined, inherit: boolean): string[] | undefined => {
      if (!removed.id || !ids.includes(removed.id)) return ids;
      const rest = ids.filter((id) => id !== removed.id);
      const next = [...rest, ...(inherit ? inherited ?? [] : [])].filter((id) => id !== selfId);
      return next.length ? next : undefined;
    };

    return {
      ...chart,
      sections: chart.sections.map((section, si) => ({
        ...section,
        tasks: section.tasks
          .filter((_, ti) => !(si === sectionIndex && ti === taskIndex))
          .map((task) => {
            let next = task;
            if (task.start?.kind === 'after') {
              const ids = patchIds(task.start.ids, task.id, true);
              next = { ...next, start: ids ? { kind: 'after', ids } : undefined };
            }
            if (task.end?.kind === 'until') {
              const ids = patchIds(task.end.ids, task.id, false);
              next = { ...next, end: ids ? { kind: 'until', ids } : undefined };
            }
            return next;
          }),
      })),
    };
  });
}

export function moveTask(doc: DiagramDocument, sectionIndex: number, from: number, to: number): DiagramDocument {
  return withChart(doc, (chart) => mapSection(chart, sectionIndex, (section) => {
    if (to < 0 || to >= section.tasks.length) return section;
    const tasks = [...section.tasks];
    const [moved] = tasks.splice(from, 1);
    tasks.splice(to, 0, moved);
    return { ...section, tasks };
  }));
}

/** Przenosi zadanie do innej sekcji, na jej koniec — z całym opisem. */
export function moveTaskToSection(
  doc: DiagramDocument,
  fromSection: number,
  taskIndex: number,
  toSection: number,
): DiagramDocument {
  return withChart(doc, (chart) => {
    const task = chart.sections[fromSection]?.tasks[taskIndex];
    if (!task || !chart.sections[toSection] || fromSection === toSection) return chart;

    return {
      ...chart,
      sections: chart.sections.map((section, i) => {
        if (i === fromSection) return { ...section, tasks: section.tasks.filter((_, j) => j !== taskIndex) };
        if (i === toSection) return { ...section, tasks: [...section.tasks, task] };
        return section;
      }),
    };
  });
}

/** Zmienia ustawienie dokumentu; pusta wartość je usuwa. */
export function setGanttSetting(
  doc: DiagramDocument,
  key: 'title' | 'dateFormat' | 'axisFormat' | 'tickInterval' | 'excludes' | 'includes' | 'todayMarker' | 'weekday',
  value: string,
): DiagramDocument {
  return withChart(doc, (chart) => {
    const next = { ...chart };
    if (value.trim() === '') delete next[key];
    else next[key] = value;
    return next;
  });
}
