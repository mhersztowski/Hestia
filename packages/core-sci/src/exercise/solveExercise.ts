/**
 * solveExercise.ts — wariant zadania, klucz odpowiedzi i sprawdzenie.
 *
 * Trzy rzeczy dzieją się tu inaczej, niż w zwykłym zbiorze zadań:
 *
 *  • **Klucza nikt nie wpisuje.** Autor wskazuje wielkość z grafu, a wartość
 *    liczy ten sam model, co wykres w wykładzie. Poprawka wzoru wyżej zmienia
 *    klucz automatycznie — zadanie nie może się zestarzeć.
 *  • **Dane losuje ziarno**, więc to samo zadanie ma nieskończenie wiele
 *    wariantów, a ten sam wariant da się odtworzyć (powrót do zadania,
 *    porównanie z cudzym rozwiązaniem, test).
 *  • **Odpowiedź porównuje się z tolerancją i wymiarem.** „3.2" i „3.2 s" to
 *    dydaktycznie różne odpowiedzi i nie wolno ich zrównać.
 *
 * Losowość jest własna i deterministyczna. `Math.random()` nie ma tu wstępu z
 * tego samego powodu, co `Date.now()` w fizyce: uniemożliwiłby odtworzenie
 * wariantu i testy snapshotowe.
 */
import { parseQuantity, toSI, UnitError } from '../units/quantity';
import { compileExpression } from '../formula/expression';
import type { PhenomenonModel } from '../graph/compileGraph';
import { defaultValues } from '../graph/compileGraph';
import type { ExerciseBlock } from './parseExercise';

/**
 * Generator liczb pseudolosowych — mulberry32.
 *
 * Trzydzieści znaków, dobry rozkład i pełna powtarzalność. Wystarcza do
 * losowania danych zadania, a nie wciąga zależności.
 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ExerciseVariant {
  /** Ziarno, z którego powstał — wystarcza, żeby odtworzyć wariant. */
  seed: number;
  /** Wylosowane dane w SI, gotowe do podstawienia do modelu. */
  values: Record<string, number>;
  /** Te same dane w zapisie z jednostką — do pokazania w treści. */
  shown: Record<string, string>;
  /** Poprawna wartość odpowiedzi w SI; `undefined`, gdy model jej nie liczy. */
  expected?: number;
  /** Jednostka odpowiedzi — po niej sprawdza się wymiar. */
  expectedUnit?: string;
  issues: string[];
}

/**
 * Zaokrągla do „ładnej" wartości, żeby dane zadania dało się przeczytać.
 *
 * Samo `round(x / step) * step` daje `1.7000000000000002` — mnożenie
 * zmiennoprzecinkowe wraca z ogonem, którego w treści zadania nikt nie chce
 * widzieć. Dlatego wynik przycinamy do liczby miejsc wynikającej z kroku.
 */
function quantize(value: number, step?: number): number {
  if (!step) return Number(value.toPrecision(3));
  const decimals = decimalsOf(step);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/** Ile miejsc po przecinku ma krok — tyle wystarczy wynikowi. */
function decimalsOf(step: number): number {
  const text = String(step);
  if (text.includes('e') || text.includes('E')) return 12;
  return text.split('.')[1]?.length ?? 0;
}

/**
 * Buduje wariant zadania dla zadanego ziarna.
 *
 * Wartości spoza `@given` biorą się z modelu (stałe fizyczne, wartości domyślne
 * parametrów) — zadanie nie musi wymieniać wszystkiego, tylko to, co ma się
 * różnić między wariantami.
 */
export function exerciseVariant(
  block: ExerciseBlock,
  model: PhenomenonModel,
  seed: number,
): ExerciseVariant {
  const random = rng(seed);
  const issues: string[] = [...block.issues];
  const values = defaultValues(model);
  const shown: Record<string, string> = {};

  for (const given of block.given) {
    const raw = given.min + random() * (given.max - given.min);
    const value = quantize(raw, given.step);

    if (!model.parameters.some((p) => p.name === given.name)) {
      issues.push(`Dana „${given.name}" nie jest parametrem żadnego wzoru w tym dokumencie.`);
      continue;
    }

    try {
      values[given.name] = given.unit ? toSI(`${value} ${given.unit}`) : value;
      shown[given.name] = given.unit ? `${value} ${given.unit}` : String(value);
    } catch (error) {
      issues.push((error as Error).message);
    }
  }

  const variant: ExerciseVariant = { seed, values, shown, issues };
  if (!block.answer) return variant;

  const result = model.run(values, [0, 10], 0.005);
  const expected = result.scalars[block.answer];

  if (expected === undefined || !Number.isFinite(expected)) {
    issues.push(
      `Odpowiedź „${block.answer}" nie jest wielkością stałą w tym dokumencie `
      + '— zadanie numeryczne wymaga liczby, a nie przebiegu.',
    );
    return variant;
  }

  variant.expected = expected;
  variant.expectedUnit = model.observables.find((o) => o.name === block.answer)?.unit;
  return variant;
}

export type CheckVerdict = 'correct' | 'wrong' | 'wrong-unit' | 'unreadable';

export interface CheckResult {
  verdict: CheckVerdict;
  /** Wyjaśnienie dla czytelnika — po polsku, konkretne. */
  message: string;
  /** Błąd względny, gdy dało się go policzyć. */
  relativeError?: number;
}

/**
 * Sprawdza odpowiedź numeryczną.
 *
 * Brak jednostki tam, gdzie jest wymagana, to osobny werdykt, a nie zwykła
 * pomyłka: uczeń, który policzył dobrze, ale nie napisał „s", zrobił inny błąd
 * niż ten, który policzył źle — i zasługuje na inną odpowiedź.
 */
export function checkNumeric(answer: string, variant: ExerciseVariant, tolerance: number): CheckResult {
  if (variant.expected === undefined) {
    return { verdict: 'unreadable', message: 'Zadanie nie ma policzonej odpowiedzi wzorcowej.' };
  }

  // Przecinek dziesiętny jest tym, co pisze uczący się po polsku — i tym, czego
  // nie rozumie parser wielkości. Zamiana tutaj, a nie w interfejsie, bo przez
  // to miejsce przechodzi każda sprawdzana odpowiedź.
  const text = answer.trim().replace(/(\d),(\d)/g, '$1.$2');
  if (!text) return { verdict: 'unreadable', message: 'Wpisz odpowiedź.' };

  let value: number;
  try {
    const parsed = parseQuantity(text);
    if (variant.expectedUnit && variant.expectedUnit !== '1' && !parsed.unit) {
      return {
        verdict: 'wrong-unit',
        message: `Sama liczba to za mało — dopisz jednostkę (oczekiwana: ${variant.expectedUnit}).`,
      };
    }
    // Wymiar sprawdzamy przez ponowne odczytanie z oczekiwaną jednostką:
    // niezgodność rzuca `UnitError`, więc rozróżnienie jest jednoznaczne.
    value = variant.expectedUnit && variant.expectedUnit !== '1'
      ? toSI(text, variant.expectedUnit)
      : parsed.si;
  } catch (error) {
    if (error instanceof UnitError && /wymiar/.test(error.message)) {
      return { verdict: 'wrong-unit', message: `Jednostka nie pasuje: oczekiwana ${variant.expectedUnit}.` };
    }
    return { verdict: 'unreadable', message: `Nie umiem odczytać odpowiedzi: ${(error as Error).message}` };
  }

  const scale = Math.abs(variant.expected) || 1;
  const relativeError = Math.abs(value - variant.expected) / scale;

  if (relativeError <= tolerance) {
    return { verdict: 'correct', message: 'Dobrze.', relativeError };
  }
  return {
    verdict: 'wrong',
    // Świadomie bez podawania poprawnej wartości: zadanie ma podpowiedzi i to
    // one są następnym krokiem, a nie gotowy wynik.
    message: relativeError < tolerance * 5
      ? 'Blisko, ale poza tolerancją — sprawdź zaokrąglenia i jednostki pośrednie.'
      : 'To nie ta wartość. Zajrzyj do podpowiedzi.',
    relativeError,
  };
}

/**
 * Sprawdza odpowiedź symboliczną — równoważność wyrażeń, nie zgodność napisów.
 *
 * `2\pi\sqrt{L/g}` i `2\pi L^{0.5} g^{-0.5}` to ta sama odpowiedź; porównanie
 * tekstowe uznałoby drugą za błędną. Sprawdzamy więc numerycznie, na losowych
 * wartościach: dwa wyrażenia równoważne dają te same liczby dla każdego
 * podstawienia, a różne rozjadą się natychmiast.
 */
export function checkSymbolic(answer: string, expected: string, symbols: string[], seed = 1): CheckResult {
  const mine = compileExpression(answer, symbols);
  if (mine.issues.length) {
    return { verdict: 'unreadable', message: `Nie umiem odczytać wyrażenia: ${mine.issues[0]}` };
  }
  const reference = compileExpression(expected, symbols);
  if (reference.issues.length) {
    return { verdict: 'unreadable', message: 'Wzorcowe wyrażenie zadania jest błędne.' };
  }

  const random = rng(seed);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    // Wartości z przedziału (0.5, 2.5) — dodatnie, żeby pierwiastki i logarytmy
    // miały sens, i różne od 1, bo przy jedynkach zbyt wiele wyrażeń się zgadza.
    const scope = Object.fromEntries(symbols.map((name) => [name, 0.5 + random() * 2]));
    const a = mine.evaluate(scope);
    const b = reference.evaluate(scope);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a - b) > 1e-8 * Math.max(1, Math.abs(b))) {
      return { verdict: 'wrong', message: 'To wyrażenie nie jest równoważne oczekiwanemu.' };
    }
  }

  return { verdict: 'correct', message: 'Dobrze — wyrażenie jest równoważne.' };
}

/**
 * Wariant zbudowany z odpowiedzi **przepisanej z podręcznika**.
 *
 * Nic tu nie jest liczone: wartość wzorcowa jest tą, którą podał autor książki.
 * Odrębna funkcja zamiast gałęzi w `exerciseVariant`, bo to inna sytuacja —
 * tam wariant powstaje z ziarna i modelu, tu jest jeden i pochodzi z zewnątrz.
 *
 * Dzięki temu sprawdzanie odpowiedzi jest **dokładnie to samo** w obu trybach:
 * ta sama tolerancja, ta sama kontrola wymiaru, te same komunikaty. Osobna
 * ścieżka porównywania rozjechałaby się przy pierwszej poprawce.
 */
export function statedVariant(check: string): ExerciseVariant {
  // Podręcznik pisze „20,5°", a nie „20.5°". Bez tej zamiany sprawdzanie
  // odpadałoby dokładnie tam, gdzie miało pomóc.
  const tekst = check.trim().replace(/(\d),(\d)/g, '$1.$2');

  try {
    const parsed = parseQuantity(tekst);
    return {
      seed: 0,
      values: {},
      shown: {},
      expected: parsed.si,
      ...(parsed.unit ? { expectedUnit: parsed.unit } : {}),
      issues: [],
    };
  } catch (error) {
    return {
      seed: 0,
      values: {},
      shown: {},
      issues: [`Nie umiem odczytać odpowiedzi „${check}" jako wielkości: ${(error as Error).message}`],
    };
  }
}
