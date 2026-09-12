/**
 * sequenceOps.ts — operacje edycyjne na przebiegu.
 *
 * Wszystkie działają na **ścieżce kroku** (`StepPath`), a nie na indeksie: krok
 * może leżeć w sekcji `else` bloku, który sam leży w `loop`, więc sam numer nie
 * wskazuje go jednoznacznie. Ścieżka to naprzemienne „indeks kroku / indeks
 * sekcji", czytane od korzenia.
 *
 * Każda operacja zwraca nowy dokument — tak jak reszta operacji modelu, żeby
 * historia w hoście sprowadzała się do trzymania poprzedniej wartości.
 */
import type { DiagramDocument } from './diagram';
import {
  emptySequence, isBlock,
  type SequenceBlockKind, type SequenceScript, type SequenceStep, type StepPath,
} from './sequence';

/** Zmiana listy kroków w miejscu wskazanym przez ścieżkę rodzica. */
function mapContainer(
  steps: SequenceStep[],
  path: StepPath,
  change: (steps: SequenceStep[]) => SequenceStep[],
): SequenceStep[] {
  if (path.length === 0) return change(steps);
  const [stepIndex, sectionIndex, ...rest] = path;
  return steps.map((step, i) => {
    if (i !== stepIndex || !isBlock(step)) return step;
    return {
      ...step,
      sections: step.sections.map((section, s) => (
        s !== sectionIndex ? section : { ...section, steps: mapContainer(section.steps, rest, change) }
      )),
    };
  });
}

function withScript(doc: DiagramDocument, change: (script: SequenceScript) => SequenceScript): DiagramDocument {
  return { ...doc, sequence: change(doc.sequence ?? emptySequence()) };
}

/** Rozbija ścieżkę na „gdzie" (pojemnik) i „który" (indeks w nim). */
function split(path: StepPath): { container: StepPath; index: number } {
  return { container: path.slice(0, -1), index: path[path.length - 1] };
}

/** Wstawia krok za wskazanym; pusta ścieżka dopisuje na koniec przebiegu. */
export function insertStep(doc: DiagramDocument, after: StepPath, step: SequenceStep): DiagramDocument {
  return withScript(doc, (script) => {
    if (!after.length) return { ...script, steps: [...script.steps, step] };
    const { container, index } = split(after);
    return {
      ...script,
      steps: mapContainer(script.steps, container, (steps) => [
        ...steps.slice(0, index + 1), step, ...steps.slice(index + 1),
      ]),
    };
  });
}

/** Wstawia krok na początek wskazanej sekcji bloku — „dodaj do środka". */
export function insertIntoSection(doc: DiagramDocument, container: StepPath, step: SequenceStep): DiagramDocument {
  return withScript(doc, (script) => ({
    ...script,
    steps: mapContainer(script.steps, container, (steps) => [...steps, step]),
  }));
}

export function removeStep(doc: DiagramDocument, path: StepPath): DiagramDocument {
  return withScript(doc, (script) => {
    const { container, index } = split(path);
    return {
      ...script,
      steps: mapContainer(script.steps, container, (steps) => steps.filter((_, i) => i !== index)),
    };
  });
}

/** Zmienia pola kroku; rodzaj kroku pozostaje bez zmian. */
export function updateStep(
  doc: DiagramDocument,
  path: StepPath,
  patch: Partial<SequenceStep>,
): DiagramDocument {
  return withScript(doc, (script) => {
    const { container, index } = split(path);
    return {
      ...script,
      steps: mapContainer(script.steps, container, (steps) => steps.map((step, i) => (
        i === index ? ({ ...step, ...patch } as SequenceStep) : step
      ))),
    };
  });
}

/**
 * Przesuwa krok w obrębie jego pojemnika.
 *
 * Świadomie nie przenosimy kroków między blokami: to zmiana znaczenia (krok
 * wchodzi w pętlę albo z niej wychodzi), a nie zmiana kolejności, i lepiej
 * robić ją jawnie.
 */
export function moveStep(doc: DiagramDocument, path: StepPath, offset: number): DiagramDocument {
  return withScript(doc, (script) => {
    const { container, index } = split(path);
    return {
      ...script,
      steps: mapContainer(script.steps, container, (steps) => {
        const to = index + offset;
        if (to < 0 || to >= steps.length) return steps;
        const next = [...steps];
        const [moved] = next.splice(index, 1);
        next.splice(to, 0, moved);
        return next;
      }),
    };
  });
}

/** Nowy blok z jedną pustą sekcją (dwiema dla `alt` i `par`). */
export function newBlock(block: SequenceBlockKind, title?: string): SequenceStep {
  const sections = block === 'alt' || block === 'par'
    ? [{ ...(title ? { title } : {}), steps: [] }, { steps: [] }]
    : [{ ...(title ? { title } : {}), steps: [] }];
  return { kind: 'block', block, ...(title ? { title } : {}), sections };
}

/** Dokłada sekcję do bloku (`else`, `and`, `option`). */
export function addSection(doc: DiagramDocument, path: StepPath, title?: string): DiagramDocument {
  return withScript(doc, (script) => {
    const { container, index } = split(path);
    return {
      ...script,
      steps: mapContainer(script.steps, container, (steps) => steps.map((step, i) => (
        i === index && isBlock(step)
          ? { ...step, sections: [...step.sections, { ...(title ? { title } : {}), steps: [] }] }
          : step
      ))),
    };
  });
}

/** Dodaje uczestnika; nazwa musi być wolna, bo jest identyfikatorem na osi. */
export function addParticipant(doc: DiagramDocument, id: string, isActor = false): DiagramDocument {
  return withScript(doc, (script) => {
    const clean = id.replace(/[^A-Za-z0-9_]/g, '') || 'Uczestnik';
    if (script.participants.some((p) => p.id === clean)) return script;
    return {
      ...script,
      participants: [...script.participants, { id: clean, label: '', ...(isActor ? { isActor: true } : {}) }],
    };
  });
}

export function updateParticipant(
  doc: DiagramDocument,
  id: string,
  patch: { label?: string; isActor?: boolean },
): DiagramDocument {
  return withScript(doc, (script) => ({
    ...script,
    participants: script.participants.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));
}

/**
 * Zmienia identyfikator uczestnika razem ze wszystkimi odwołaniami.
 *
 * Bez przepisania kroków wiadomości wskazywałyby nieistniejącą oś i zniknęłyby
 * z rysunku, choć nadal byłyby w zapisie.
 */
export function renameParticipant(doc: DiagramDocument, from: string, to: string): DiagramDocument {
  const clean = to.replace(/[^A-Za-z0-9_]/g, '');
  if (!clean || clean === from) return doc;
  return withScript(doc, (script) => {
    if (script.participants.some((p) => p.id === clean)) return script;
    const rename = (steps: SequenceStep[]): SequenceStep[] => steps.map((step) => {
      if (step.kind === 'message') {
        return {
          ...step,
          from: step.from === from ? clean : step.from,
          to: step.to === from ? clean : step.to,
        };
      }
      if (step.kind === 'activate' || step.kind === 'deactivate') {
        return step.participant === from ? { ...step, participant: clean } : step;
      }
      if (step.kind === 'note') {
        return { ...step, targets: step.targets.map((t) => (t === from ? clean : t)) };
      }
      if (isBlock(step)) {
        return { ...step, sections: step.sections.map((s) => ({ ...s, steps: rename(s.steps) })) };
      }
      return step;
    });

    return {
      ...script,
      participants: script.participants.map((p) => (p.id === from ? { ...p, id: clean } : p)),
      steps: rename(script.steps),
    };
  });
}

/** Usuwa uczestnika razem z krokami, które go dotyczą. */
export function removeParticipant(doc: DiagramDocument, id: string): DiagramDocument {
  return withScript(doc, (script) => {
    const prune = (steps: SequenceStep[]): SequenceStep[] => steps.reduce<SequenceStep[]>((acc, step) => {
      if (step.kind === 'message' && (step.from === id || step.to === id)) return acc;
      if ((step.kind === 'activate' || step.kind === 'deactivate') && step.participant === id) return acc;
      if (step.kind === 'note') {
        const targets = step.targets.filter((t) => t !== id);
        if (!targets.length) return acc;
        return [...acc, { ...step, targets }];
      }
      if (isBlock(step)) {
        return [...acc, { ...step, sections: step.sections.map((s) => ({ ...s, steps: prune(s.steps) })) }];
      }
      return [...acc, step];
    }, []);

    return {
      ...script,
      participants: script.participants.filter((p) => p.id !== id),
      steps: prune(script.steps),
    };
  });
}

export function setAutonumber(doc: DiagramDocument, enabled: boolean): DiagramDocument {
  return withScript(doc, (script) => {
    const { autonumber: _drop, ...rest } = script;
    return enabled ? { ...rest, autonumber: true } : rest;
  });
}
