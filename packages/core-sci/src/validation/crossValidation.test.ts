/**
 * Cross-walidacja: nasz solver kontra SciPy.
 *
 * Poziom 2 walidacji z raportu (§7). Testy analityczne (poziom 1) łapią błędy
 * solvera tam, gdzie znamy rozwiązanie zamknięte — ale większość układów go nie
 * ma. Tutaj drugim zdaniem jest **niezależny silnik**: SciPy z adaptacyjnym
 * DOP853 i ciasnymi tolerancjami, całkujący ten sam układ wyeksportowany z tego
 * samego dokumentu.
 *
 * Żeby błąd przeszedł niezauważony, musiałby być identyczny w dwóch niezależnie
 * napisanych całkowaniach — a to jest znacznie mniej prawdopodobne niż błąd w
 * jednym.
 *
 * Fixtures powstają **osobnym poleceniem**, nie w trakcie testu:
 *
 *     node validation/generate-fixtures.mjs <python-ze-scipy>
 *
 * Gdyby powstawały tutaj, porównywalibyśmy wynik z samym sobą.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from '../graph/formulaGraph';
import { compileGraph } from '../graph/compileGraph';

interface Fixture {
  id: string;
  state: string[];
  parameters: Record<string, number>;
  tSpan: [number, number];
  solver: string;
  t: number[];
  y: Record<string, number[]>;
  /** Chwile zdarzeń wyznaczone przez SciPy — po jednej liście na zdarzenie. */
  eventTimes?: number[][];
}

const KATALOG_FIXTURES = join(__dirname, '..', '..', 'validation', 'fixtures');
const KATALOG_DOKUMENTOW = join(__dirname, '..', '..', '..', 'sci-blocks', 'dokumenty');

/** Blok `formula:id` wyjęty z dokumentu — to samo źródło co dla fixture. */
function blokZDokumentu(dokument: string, id: string) {
  const markdown = readFileSync(join(KATALOG_DOKUMENTOW, dokument), 'utf8');
  const dopasowanie = new RegExp('```formula:' + id + '\\n([\\s\\S]*?)```').exec(markdown);
  if (!dopasowanie) throw new Error(`Nie ma bloku formula:${id} w ${dokument}`);
  return parseFormulaBlock(id, dopasowanie[1]);
}

function wczytajFixture(id: string): Fixture | undefined {
  const sciezka = join(KATALOG_FIXTURES, `${id}.json`);
  return existsSync(sciezka) ? JSON.parse(readFileSync(sciezka, 'utf8')) : undefined;
}

/**
 * Największa różnica względna między trajektoriami.
 *
 * Odnosimy do **amplitudy przebiegu**, nie do wartości chwilowej: przy
 * przejściu przez zero różnica względna rośnie do nieskończoności, choć
 * trajektorie leżą na sobie.
 */
function najwiekszaRoznica(nasze: number[], referencyjne: number[]): number {
  const amplituda = Math.max(...referencyjne.map(Math.abs), 1e-12);
  let najwieksza = 0;
  for (let i = 0; i < referencyjne.length; i += 1) {
    najwieksza = Math.max(najwieksza, Math.abs(nasze[i] - referencyjne[i]) / amplituda);
  }
  return najwieksza;
}

/**
 * Tolerancje dobrane do **zmierzonych** rozjazdów, nie „na oko".
 *
 * Przy `dt = 1e-4` faktyczne różnice wynoszą ~2e-7 (wahadło, oscylator) i
 * ~4e-6 (Lorenz). Progi są od nich około dwudziestokrotnie luźniejsze — tyle,
 * żeby przetrwać inną wersję SciPy albo inną maszynę, i nie więcej. Margines
 * rzędu tysiąca przepuściłby realny błąd i test nie sprawdzałby niczego.
 */
const UKLADY = [
  { dokument: 'wahadlo.md', id: 'pendulum-ode', tolerancja: 5e-6, dt: 1e-4 },
  { dokument: 'rezonans.md', id: 'oscylator-ode', tolerancja: 5e-6, dt: 1e-4 },
  // Chaos rozjeżdża się z definicji — na krótkim odcinku trajektorie muszą się
  // jeszcze pokrywać, ale luźniej, bo błąd rośnie tam wykładniczo.
  { dokument: 'lorenz.md', id: 'lorenz-ode', tolerancja: 1e-4, dt: 1e-4 },
  /**
   * Trzy układy dołożone w etapie 7 — **po jednym na każdą metodę**, która nie
   * miała dotąd potwierdzenia spoza tego pakietu. Metodę wybiera dokument
   * dyrektywą `@solver`, więc walidacja dotyczy tego, co czytelnik naprawdę
   * dostaje, a nie konfiguracji wymyślonej na potrzeby testu:
   *
   *  • orbita — `verlet` (symplektyczny, stały krok),
   *  • układ sztywny — `rosenbrock` (niejawny, etap 3),
   *  • rzut ukośny — `dopri5` (adaptacyjny, etap 1) i do tego ze zdarzeniem.
   *
   * Progi znów z pomiaru: 3,3·10⁻⁶ · 3,3·10⁻⁶ · 1,4·10⁻⁹, z marginesem rzędu
   * trzydziestu. Rzut wychodzi o trzy rzędy dokładniej od pozostałych, bo tam
   * krok dobiera sterowanie błędem, a nie dokument.
   */
  { dokument: 'orbita.md', id: 'orbita-ode', tolerancja: 1e-4, dt: 1 },
  { dokument: 'uklad-sztywny.md', id: 'sztywny-ode', tolerancja: 1e-4, dt: 1e-5 },
  { dokument: 'rzut-ukosny.md', id: 'rzut-ode', tolerancja: 5e-8, dt: 1e-3 },
];

describe('cross-walidacja ze SciPy', () => {
  for (const { dokument, id, tolerancja, dt } of UKLADY) {
    const fixture = wczytajFixture(id);

    it.skipIf(!fixture)(`${id}: trajektoria zgadza się z niezależnym solverem`, () => {
      const model = compileGraph(buildGraph([blokZDokumentu(dokument, id)]));
      const wynik = model.run(fixture!.parameters, fixture!.tSpan, dt);

      expect(wynik.trajectory, wynik.error).toBeDefined();

      for (const nazwa of fixture!.state) {
        // Do ostatniej policzonej chwili: gdy zdarzenie kończy symulację,
        // obie strony zatrzymują się w tym samym miejscu, ale punkty `t_eval`
        // za nim nie mają odpowiednika po żadnej ze stron.
        const nasze = fixture!.t.map((t) => wynik.trajectory!.value(nazwa, t));
        const roznica = najwiekszaRoznica(nasze, fixture!.y[nazwa]);

        expect(
          roznica,
          `${id}/${nazwa}: rozjazd ${roznica.toExponential(2)} względem ${fixture!.solver}`,
        ).toBeLessThan(tolerancja);
      }
    });
  }

  /**
   * Chwila zdarzenia z niezależnego źródła.
   *
   * To jest domknięcie etapu 2. Obie strony rozwiązują to samo równanie
   * `g(t, y) = 0` wewnątrz kroku, ale zupełnie inaczej: SciPy metodą Brenta na
   * własnym interpolancie, my metodą Illinois na dense outpucie Dormanda–Prince'a.
   * Zgodność co do ósmej cyfry znaczy, że obie implementacje mówią o tej samej
   * chwili, a nie o dwóch bliskich.
   */
  it('rzut-ode: chwila lądowania zgadza się z niezależnym solverem', () => {
    const fixture = wczytajFixture('rzut-ode');
    if (!fixture?.eventTimes?.[0]?.length) {
      throw new Error('Fixture rzutu nie zawiera chwil zdarzeń — zregeneruj odniesienia.');
    }

    const model = compileGraph(buildGraph([blokZDokumentu('rzut-ukosny.md', 'rzut-ode')]));
    const wynik = model.run(fixture.parameters, fixture.tSpan, 1e-3);
    const nasze = wynik.trajectory!.events?.[0]?.t;

    expect(nasze).toBeDefined();
    expect(
      Math.abs(nasze! - fixture.eventTimes[0][0]),
      `nasze ${nasze}, SciPy ${fixture.eventTimes[0][0]}`,
    ).toBeLessThan(1e-8);
  });

  it('fixtures są obecne — inaczej cross-walidacja tylko udaje, że działa', () => {
    // Brakujący fixture ucisza testy powyżej przez `skipIf`. Bez tego
    // sprawdzenia zielony przebieg nie znaczyłby nic.
    const brakujace = UKLADY.filter(({ id }) => !wczytajFixture(id)).map(({ id }) => id);

    expect(
      brakujace,
      `Brak odniesień: ${brakujace.join(', ')}. Wygeneruj je poleceniem `
      + '`node validation/generate-fixtures.mjs <python-ze-scipy>`.',
    ).toEqual([]);
  });
});
