/**
 * documentModel.ts — z dokumentu do modelu zjawiska.
 *
 * Tu domyka się teza raportu: blok `sim` nie opisuje symulacji, tylko **wskazuje
 * wzory, które już stoją w tekście**. Model powstaje ze skanu dokumentu, więc
 * poprawienie wzoru w wykładzie zmienia symulację niżej — nie ma dwóch źródeł
 * prawdy, bo nie ma drugiego miejsca, w którym fizyka jest zapisana.
 *
 * Skan jest tekstowy (bloki ``` w markdownie), bo dokument jest plikiem, a nie
 * strukturą edytora. To samo wejście obsłuży skan całego VFS, gdy przyjdzie
 * czas na indeks wzorów z sekcji 3.6.
 */
import {
  applyOverrides, buildGraph, buildModel, compileGraph, modelOptionNames, parseFormulaBlock,
  type FormulaBlock, type PhenomenonModel,
} from '@hestia/core-sci';

/** Ustawienia bloku `sim` — treść bloku jest zwykłym JSON-em. */
export interface SimSpec {
  /**
   * Nazwa zjawiska z biblioteki; brak = model powstaje ze wzorów dokumentu.
   *
   * Dwie drogi, jeden kontrakt. Dokument, który **uczy** o zjawisku, powinien
   * mieć je w blokach `formula` — wtedy czytelnik widzi równania i może je
   * poprawić. Biblioteka jest dla zjawisk używanych jako tło (zadanie
   * o rezonansie nie wyprowadza oscylatora od nowa) i dla takich, których
   * liczba równań zależy od danych, jak układ N ciał.
   */
  model?: string;
  /** Widoki do pokazania; brak = wybór domyślny z rodzaju wielkości. */
  view?: string[];
  /** Parametry wystawione czytelnikowi jako suwaki; brak = wszystkie. */
  expose?: string[];
  /**
   * Wzory, z których budujemy model; brak albo pusta lista = wszystkie z dokumentu.
   *
   * Potrzebne, gdy dokument opisuje **wiele zjawisk naraz** — jak rozdział
   * podręcznika, w którym siła ma osobny wzór dla sprężyny i osobny dla
   * wahadła. To nie jest wtedy niejednoznaczność do naprawienia, tylko dwa
   * różne układy, a blok musi powiedzieć, o którym mówi.
   *
   * Dokument o jednym zjawisku nie deklaruje niczego i działa jak dotąd.
   */
  formulas?: string[];
  /** Koniec przedziału czasu symulacji w sekundach. */
  duration?: number;
  /** Nadpisania wartości parametrów, z jednostkami: `{"L": "1 m"}`. */
  [param: string]: unknown;
}

/** Znajduje bloki ```formula:id w treści dokumentu. */
export function scanFormulas(markdown: string): FormulaBlock[] {
  const blocks: FormulaBlock[] = [];
  const fence = /```formula:([A-Za-z0-9_-]+)\n([\s\S]*?)```/g;

  let match = fence.exec(markdown);
  while (match) {
    blocks.push(parseFormulaBlock(match[1], match[2]));
    match = fence.exec(markdown);
  }
  return blocks;
}

export interface SimSetup {
  model: PhenomenonModel;
  /**
   * Wzory, z których zbudowano model — już po wyborze przez `formulas`.
   *
   * Worker buduje model **u siebie**, z opisu; gdyby dostał pełną listę
   * dokumentu, liczyłby coś innego niż to, co widać na ekranie.
   */
  usedFormulas: FormulaBlock[];
  /** Wartości startowe parametrów w SI. */
  values: Record<string, number>;
  /** Parametry, które ma zobaczyć czytelnik. */
  exposed: string[];
  spec: SimSpec;
  issues: string[];
}

/**
 * Buduje model dla bloku `sim` na podstawie wzorów z tego samego dokumentu.
 *
 * Błędy nie przerywają budowy: dokument z jedną literówką ma się wyświetlić i
 * pokazać, co jest nie tak. Pusty ekran nie mówi nic.
 */
export function buildSimSetup(source: string | FormulaBlock[], simBody: string): SimSetup {
  const issues: string[] = [];

  let spec: SimSpec = {};
  const trimmed = simBody.trim();
  if (trimmed) {
    try {
      spec = JSON.parse(trimmed) as SimSpec;
    } catch (error) {
      issues.push(`Ustawienia bloku nie są poprawnym JSON-em: ${(error as Error).message}`);
    }
  }

  // Wejściem jest albo tekst dokumentu (skan VFS), albo gotowe bloki wyjęte
  // przez hosta z jego własnej struktury — edytor ma je pod ręką i nie musi
  // konwertować całego dokumentu do markdownu przy każdym renderze.
  const wszystkie = typeof source === 'string' ? scanFormulas(source) : source;

  if (spec.model) return fromLibrary(spec, issues);

  if (!wszystkie.length) issues.push('W dokumencie nie ma żadnego bloku ```formula — nie ma z czego zbudować symulacji.');

  // Nieznany identyfikator zgłaszamy, zamiast po cichu pominąć: literówka
  // dałaby model z mniejszej liczby wzorów, więc symulacja ruszyłaby i
  // pokazała coś innego, niż autor chciał.
  for (const id of spec.formulas ?? []) {
    if (!wszystkie.some((f) => f.id === id)) {
      issues.push(`Blok wskazuje wzór „${id}", którego nie ma w tym dokumencie.`);
    }
  }

  const formulas = spec.formulas?.length
    ? wszystkie.filter((f) => spec.formulas!.includes(f.id))
    : wszystkie;

  // Pełna lista identyfikatorów dokumentu: przy wyborze podzbioru
  // `@derivedFrom` nadal może wskazywać na wzory poza nim i to nie jest błąd.
  const model = compileGraph(buildGraph(formulas, wszystkie.map((f) => f.id)));
  issues.push(...model.issues);

  // Wszystko, co nie jest znanym ustawieniem, jest nadpisaniem parametru.
  const reserved = new Set(['view', 'expose', 'duration', 'formulas', 'model']);
  const overrides = Object.fromEntries(
    Object.entries(spec).filter(([key]) => !reserved.has(key)),
  ) as Record<string, string | number>;

  const applied = applyOverrides(model, overrides);
  issues.push(...applied.issues);

  const exposed = spec.expose?.length
    ? spec.expose.filter((name) => model.parameters.some((p) => p.name === name))
    : model.parameters.map((p) => p.name);

  return { model, usedFormulas: formulas, values: applied.values, exposed, spec, issues };
}

/** Pusty model — gdy zjawiska nie udało się zbudować, blok ma co renderować. */
const PUSTY_MODEL: PhenomenonModel = {
  parameters: [], observables: [], dynamic: false, derivativePairs: [], issues: [],
  run: () => ({ scalars: {}, series: {}, invariants: [] }),
};

/**
 * Model z biblioteki zjawisk zamiast z wzorów dokumentu.
 *
 * Poza źródłem modelu wszystko jest tu takie samo jak wyżej — te same
 * nadpisania z jednostkami, ta sama lista wystawionych parametrów. To nie jest
 * przypadek: gdyby druga droga miała własne reguły, każdy widok i każdy panel
 * musiałby znać dwa przypadki.
 */
function fromLibrary(spec: SimSpec, issues: string[]): SimSetup {
  const opcjeNazwy = new Set(modelOptionNames(spec.model!));
  const opcje = Object.fromEntries(
    Object.entries(spec).filter(([key]) => opcjeNazwy.has(key)),
  );

  const zbudowany = buildModel(spec.model!, opcje);
  issues.push(...zbudowany.issues);
  const model = zbudowany.model ?? PUSTY_MODEL;

  // Zarezerwowane nazwy plus opcje zjawiska; reszta to nadpisania parametrów,
  // więc literówka nadal zostanie zgłoszona.
  const reserved = new Set(['view', 'expose', 'duration', 'formulas', 'model', ...opcjeNazwy]);
  const overrides = Object.fromEntries(
    Object.entries(spec).filter(([key]) => !reserved.has(key)),
  ) as Record<string, string | number>;

  const applied = applyOverrides(model, overrides);
  issues.push(...applied.issues);

  const exposed = spec.expose?.length
    ? spec.expose.filter((name) => model.parameters.some((p) => p.name === name))
    : model.parameters.map((p) => p.name);

  return { model, usedFormulas: [], values: applied.values, exposed, spec, issues };
}
