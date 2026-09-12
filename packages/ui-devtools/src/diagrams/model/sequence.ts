/**
 * sequence.ts — model diagramu sekwencji.
 *
 * Diagram sekwencji nie jest grafem. Węzły i krawędzie opisują, *co z czym*
 * jest połączone; tutaj znaczenie niesie **kolejność w czasie** i zagnieżdżenie
 * bloków (`loop`, `alt`, `par`). Dwie wiadomości między tą samą parą uczestników
 * to dwa różne zdarzenia, a nie jedna krawędź — dlatego przebieg jest osobną,
 * uporządkowaną strukturą, a nie listą krawędzi.
 *
 * Uczestnicy zostają w `nodes`: mają identyfikator, opis i kolejność na osi
 * poziomej, więc pasują do wspólnego modelu bez naginania go.
 */

/** Zakończenie strzałki wiadomości — w Mermaidzie każde ma własny zapis. */
export type SequenceArrow =
  /** `->` linia ciągła bez grotu */
  | 'solid'
  /** `-->` przerywana bez grotu */
  | 'dotted'
  /** `->>` ciągła z grotem — najczęstsza */
  | 'solidArrow'
  /** `-->>` przerywana z grotem — odpowiedź */
  | 'dottedArrow'
  /** `-x` ciągła z krzyżykiem — komunikat utracony */
  | 'solidCross'
  /** `--x` przerywana z krzyżykiem */
  | 'dottedCross'
  /** `-)` ciągła, grot otwarty — wywołanie asynchroniczne */
  | 'solidOpen'
  /** `--)` przerywana, grot otwarty */
  | 'dottedOpen'
  /** `<<->>` dwustronna ciągła */
  | 'biSolid'
  /** `<<-->>` dwustronna przerywana */
  | 'biDotted';

/** Rodzaj bloku obejmującego fragment przebiegu. */
export type SequenceBlockKind = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break' | 'rect';

export interface SequenceMessage {
  kind: 'message';
  from: string;
  to: string;
  arrow: SequenceArrow;
  text: string;
  /** `->>+` — wiadomość uruchamia pasek aktywności odbiorcy. */
  activate?: boolean;
  /** `-->>-` — wiadomość kończy pasek aktywności nadawcy. */
  deactivate?: boolean;
}

/**
 * Uczestnik powołany albo zlikwidowany w trakcie przebiegu.
 *
 * `create participant X as Opis` rysuje pudełko dopiero w tym miejscu, a
 * `destroy X` ucina jego linię życia krzyżykiem. To nie jest ozdoba: pokazuje,
 * że byt istnieje tylko przez część przebiegu.
 */
export interface SequenceLifecycle {
  kind: 'create' | 'destroy';
  participant: string;
}

/** Jawne `activate A` / `deactivate A` poza wiadomością. */
export interface SequenceActivation {
  kind: 'activate' | 'deactivate';
  participant: string;
}

export interface SequenceNote {
  kind: 'note';
  placement: 'left of' | 'right of' | 'over';
  /** Jeden uczestnik, albo dwaj przy `over A,B`. */
  targets: string[];
  text: string;
}

/** Sekcja bloku: `alt` ma „else", `par` ma „and", `critical` ma „option". */
export interface SequenceSection {
  /** Tytuł sekcji; pierwsza sekcja dziedziczy tytuł bloku. */
  title?: string;
  steps: SequenceStep[];
}

export interface SequenceBlock {
  kind: 'block';
  block: SequenceBlockKind;
  /** Tytuł bloku (`loop co minutę`), dla `rect` bywa kolorem. */
  title?: string;
  sections: SequenceSection[];
}

/** Linia, której nie rozumiemy — wraca nietknięta na swoje miejsce. */
export interface SequenceRaw {
  kind: 'raw';
  text: string;
}

export type SequenceStep =
  | SequenceMessage | SequenceActivation | SequenceNote | SequenceBlock
  | SequenceLifecycle | SequenceRaw;

/** Uczestnik przebiegu — kolejność wynika z pozycji w tablicy. */
export interface SequenceParticipant {
  id: string;
  /** Opis pokazywany w nagłówku; pusty = rysuj identyfikator. */
  label: string;
  /** `actor A` rysuje ludzika zamiast prostokąta. */
  isActor?: boolean;
  /**
   * Uczestnik zadeklarowany przez `create` w środku przebiegu.
   *
   * Deklaracja zostaje wtedy w krokach (bo jej miejsce jest znaczące), więc
   * przy zapisie nie wolno jej powtórzyć w nagłówku listy uczestników.
   */
  createdInline?: boolean;
}

export interface SequenceScript {
  participants: SequenceParticipant[];
  steps: SequenceStep[];
  /** `autonumber` — Mermaid numeruje wtedy wiadomości. */
  autonumber?: boolean;
  /** `autonumber 10 10` — numer początkowy i krok. */
  autonumberStart?: number;
  autonumberStep?: number;
}

export function emptySequence(): SequenceScript {
  return { participants: [], steps: [] };
}

/** Czy krok jest blokiem (ma zagnieżdżone sekcje). */
export function isBlock(step: SequenceStep): step is SequenceBlock {
  return step.kind === 'block';
}

/**
 * Ścieżka do kroku w zagnieżdżonym przebiegu.
 *
 * Kolejne pary „indeks sekcji / indeks kroku" prowadzą w głąb bloków. Prostsza
 * numeracja (sam indeks) nie wystarcza, bo krok może leżeć w sekcji `else`
 * bloku, który sam leży w `loop`.
 */
export type StepPath = number[];

/** Kroki bezpośrednio w danym pojemniku — korzeń albo sekcja bloku. */
export function stepsAt(script: SequenceScript, path: StepPath): SequenceStep[] | undefined {
  let steps = script.steps;
  for (let i = 0; i < path.length; i += 2) {
    const step = steps[path[i]];
    if (!step || !isBlock(step)) return undefined;
    const section = step.sections[path[i + 1]];
    if (!section) return undefined;
    steps = section.steps;
  }
  return steps;
}

/** Krok pod wskazaną ścieżką. */
export function stepAt(script: SequenceScript, path: StepPath): SequenceStep | undefined {
  if (!path.length) return undefined;
  const parent = stepsAt(script, path.slice(0, -1).length % 2 === 0 ? path.slice(0, -1) : path.slice(0, -1));
  return parent?.[path[path.length - 1]];
}

/**
 * Uczestnicy, których dotyczy podana lista kroków — razem z zagnieżdżonymi.
 *
 * Potrzebne przy rysowaniu ramek bloków: `break`, który rozmawia tylko z dwoma
 * uczestnikami, nie powinien rozciągać się na cały diagram.
 */
export function participantsInSteps(steps: SequenceStep[]): string[] {
  const seen = new Set<string>();
  const walk = (list: SequenceStep[]) => {
    for (const step of list) {
      if (step.kind === 'message') { seen.add(step.from); seen.add(step.to); }
      if (step.kind === 'activate' || step.kind === 'deactivate') seen.add(step.participant);
      if (step.kind === 'create' || step.kind === 'destroy') seen.add(step.participant);
      if (step.kind === 'note') for (const t of step.targets) seen.add(t);
      if (isBlock(step)) for (const section of step.sections) walk(section.steps);
    }
  };
  walk(steps);
  return [...seen];
}

/** Wszyscy uczestnicy wspomniani w przebiegu — także ci bez deklaracji. */
export function participantsUsed(script: SequenceScript): string[] {
  return participantsInSteps(script.steps);
}
