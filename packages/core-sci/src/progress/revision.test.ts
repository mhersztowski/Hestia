import { describe, it, expect } from 'vitest';
import { emptyProgress } from './schedule';
import { markRead } from './read';
import {
  defaultRevisionSettings, planRevision, DAY,
  type RevisionSource, type ProgressWithRevision,
} from './revision';

const T = Date.UTC(2026, 7, 4);

const zrodlo = (): RevisionSource => ({
  subsections: [
    { path: 'k/15-1.md', title: '15-1' },
    { path: 'k/15-2.md', title: '15-2' },
    { path: 'k/15-3.md', title: '15-3' },
    { path: 'k/15-4.md', title: '15-4' },
  ],
  questions: [{ path: 'k/Pytania.md', title: 'Pytania 15' }],
  exercises: [
    { path: 'k/Zadania.md', id: 'z1', title: 'Zadanie 1' },
    { path: 'k/Zadania.md', id: 'z2', title: 'Zadanie 2' },
    { path: 'k/Zadania2.md', id: 'z3', title: 'Zadanie 3' },
  ],
  test: [
    { path: 'k/Prawa.md', id: 'p1', title: "Prawo Hooke'a" },
    { path: 'k/Slownik.md', id: 'h1', title: 'Okres' },
  ],
});

describe('plan powtórek', () => {
  it('domyślnie każdy rodzaj ma własny odstęp i własną liczbę pozycji', () => {
    const s = defaultRevisionSettings();
    for (const k of ['subsection', 'questions', 'exercises', 'test'] as const) {
      expect(s.intervalDays[k], k).toBeGreaterThan(0);
      expect(s.batchSize[k], k).toBeGreaterThan(0);
    }
  });

  /**
   * „Trzy najrzadziej czytane podrozdziały" — nieprzeczytany jest rzadszy niż
   * każdy przeczytany, więc idzie na początek. Inaczej powtórki podsuwałyby
   * w kółko to, co czytelnik już zna, a nowego materiału nigdy.
   */
  it('podrozdziały: najpierw nietknięte, potem najdawniej czytane', () => {
    let p: ProgressWithRevision = emptyProgress();
    p = markRead(p, 'k/15-1.md', T - 10 * DAY);
    p = markRead(p, 'k/15-2.md', T - 2 * DAY);

    const plan = planRevision(zrodlo(), p, defaultRevisionSettings(), T);
    expect(plan.subsection.map((x) => x.path))
      .toEqual(['k/15-3.md', 'k/15-4.md', 'k/15-1.md']);
    expect(plan.subsection[0].lastAt).toBe(0);
  });

  it('liczbę pozycji ustala nastawa, nie kod', () => {
    const s = defaultRevisionSettings();
    s.batchSize.subsection = 1;
    expect(planRevision(zrodlo(), emptyProgress(), s, T).subsection).toHaveLength(1);
  });

  /**
   * `markRead` z założenia **nie nadpisuje** daty pierwszego przeczytania — to
   * informacja o nauce. Powtórki potrzebują jednak daty **ostatniego** razu,
   * więc ślad niesie oba: `at` zostaje, `lastAt` i `count` rosną.
   */
  it('ponowne przeczytanie przesuwa pozycję na koniec kolejki', () => {
    // Cała czwórka w planie, żeby widzieć samą kolejność, a nie odcięcie listy.
    const s = defaultRevisionSettings();
    s.batchSize.subsection = 4;

    let p: ProgressWithRevision = markRead(emptyProgress(), 'k/15-1.md', T - 30 * DAY);
    expect(planRevision(zrodlo(), p, s, T).subsection[3].path).toBe('k/15-1.md');

    p = markRead(p, 'k/15-1.md', T);
    expect(p.read!['k/15-1.md'].at).toBe(T - 30 * DAY); // pierwsze czytanie zostaje
    expect(p.read!['k/15-1.md'].lastAt).toBe(T);
    expect(p.read!['k/15-1.md'].count).toBe(2);

    const plan = planRevision(zrodlo(), p, defaultRevisionSettings(), T);
    expect(plan.subsection.map((x) => x.path)).not.toContain('k/15-1.md');
  });

  it('wymagalność wynika z odstępu dla rodzaju', () => {
    const s = defaultRevisionSettings();
    s.intervalDays.subsection = 7;
    let p: ProgressWithRevision = markRead(emptyProgress(), 'k/15-1.md', T - 3 * DAY);
    p = markRead(p, 'k/15-2.md', T - 9 * DAY);
    p = markRead(p, 'k/15-3.md', T - 8 * DAY);
    p = markRead(p, 'k/15-4.md', T - 1 * DAY);

    const plan = planRevision(zrodlo(), p, s, T);
    expect(plan.subsection.filter((x) => x.due).map((x) => x.path))
      .toEqual(['k/15-2.md', 'k/15-3.md']);
  });

  /**
   * Zadania bierzemy **z jednego dokumentu** — tego, którego najdawniej
   * dotykaliśmy. Wymieszanie zadań z pięciu rozdziałów daje listę bez tematu,
   * a powtórka ma wracać do materiału, nie do przypadkowych rachunków.
   */
  it('zadania: jeden dokument naraz, ten najdawniej ruszany', () => {
    const p: ProgressWithRevision = {
      ...emptyProgress(),
      items: {
        'k/Zadania.md:z1': { attempts: 1, streak: 1, lapses: 0, lastAt: T - 20 * DAY, dueAt: T },
        'k/Zadania2.md:z3': { attempts: 1, streak: 1, lapses: 0, lastAt: T - 1 * DAY, dueAt: T },
      },
    };
    const plan = planRevision(zrodlo(), p, defaultRevisionSettings(), T);
    expect(new Set(plan.exercises.map((x) => x.path))).toEqual(new Set(['k/Zadania.md']));
    // w obrębie dokumentu najpierw nietknięte
    expect(plan.exercises.map((x) => x.id)).toEqual(['z2', 'z1']);
  });

  it('test miesza prawa i hasła, najdawniej sprawdzane pierwsze', () => {
    const p: ProgressWithRevision = {
      ...emptyProgress(),
      items: { 'k/Prawa.md:p1': { attempts: 1, streak: 1, lapses: 0, lastAt: T - DAY, dueAt: T } },
    };
    const plan = planRevision(zrodlo(), p, defaultRevisionSettings(), T);
    expect(plan.test.map((x) => x.id)).toEqual(['h1', 'p1']);
  });

  it('pusta baza daje pusty plan, a nie awarię', () => {
    const puste: RevisionSource = { subsections: [], questions: [], exercises: [], test: [] };
    const plan = planRevision(puste, emptyProgress(), defaultRevisionSettings(), T);
    expect(plan).toEqual({ subsection: [], questions: [], exercises: [], test: [] });
  });

  it('stary plik postępów bez pola `read` nie wywraca planu', () => {
    const stary = { items: {}, version: 1 } as ProgressWithRevision;
    expect(planRevision(zrodlo(), stary, defaultRevisionSettings(), T).subsection).toHaveLength(3);
  });
});
