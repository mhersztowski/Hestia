/**
 * generate-fixtures.mjs — regeneracja odniesień ze SciPy.
 *
 * Eksportuje układy z dokumentów bazy wiedzy, oddaje je skryptowi Pythona i
 * zapisuje trajektorie jako golden fixtures. Uruchamiane **ręcznie**, przy
 * zmianie modeli — testy tylko porównują z tym, co tu powstało.
 *
 * Osobne uruchomienie jest celowe: gdyby fixture powstawał w trakcie testu,
 * porównywalibyśmy wynik z samym sobą i cała cross-walidacja byłaby pozorna.
 *
 * Użycie:
 *   node validation/generate-fixtures.mjs [ścieżka-do-pythona]
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFormulaBlock, exportScenario, exportPdeScenario } from '../dist/index.js';

const uruchom = promisify(execFile);
const here = dirname(new URL(import.meta.url).pathname);
const python = process.argv[2] ?? 'python3';

const DOKUMENTY = join(here, '..', '..', 'ui-sci-blocks', 'documents');
const FIXTURES = join(here, 'fixtures');
// Katalog tymczasowy systemu, nie repozytorium: scenariusz jest przekazywany
// Pythonowi i po nim nie ma śladu, a zapisywany obok źródeł zaśmiecał diff przy
// każdej regeneracji odniesień.
const TYMCZASOWE = join(tmpdir(), 'sci-core-scenario.json');

/**
 * Które układy porównujemy i z jakimi parametrami.
 *
 * Lista jest jawna, a nie skanowana: cross-walidacja ma sens dla układów ODE o
 * ustalonych parametrach, a dobór parametrów jest decyzją — chodzi o zakres, w
 * którym zjawisko jest ciekawe, nie o pierwszy z brzegu.
 */
/**
 * Pola na siatce — drugi rodzaj równania w cross-walidacji.
 *
 * Siatka jest **rzadsza niż w dokumencie**: porównanie 96×96 przez sto klatek
 * daje plik na kilkadziesiąt megabajtów, a błąd schematu widać tak samo na
 * 24×24. Gęstość jest tu kosztem, nie dokładnością rozstrzygnięcia.
 */
const POLA = [
  {
    dokument: 'rownanie-ciepla.md',
    formula: 'cieplo-pole',
    parameters: { alpha: 0.01 },
    // Krótko: nasz schemat jest **jawny i pierwszego rzędu**, a krok dobiera
    // z warunku stabilności — czyli tak duży, jak wolno. Na jednostkę czasu
    // daje to kilka procent różnicy wobec solvera adaptacyjnego i jest to
    // cena metody, nie usterka. Porównanie na krótkim odcinku sprawdza
    // schemat; że błąd nie rośnie szybciej, niż powinien, pilnuje osobny test
    // zbieżności.
    tSpan: [0, 0.3],
    frames: 5,
    grid: { nx: 24, ny: 24 },
  },
  {
    dokument: 'rownanie-ciepla.md',
    formula: 'fala-pole',
    parameters: { c: 0.5 },
    tSpan: [0, 0.5],
    frames: 5,
    grid: { nx: 48, ny: 48 },
    /*
     * Warunek początkowy podmieniony na **modę własną**, a nie gaussowską
     * plamkę z dokumentu — i to jest istotna decyzja, nie wygoda.
     *
     * Sprawdzone: przy `exp(-200 r²)` oba silniki rozjeżdżają się o ~20–30%,
     * a zagęszczenie siatki tego nie poprawia. Nie jest to błąd żadnego z nich:
     * stroma plamka niesie wysokie częstości przestrzenne, dla których każda
     * dyskretyzacja ma własną dyspersję numeryczną. Porównywalibyśmy dwa różne
     * przybliżenia, a nie dwa rozwiązania tego samego równania.
     *
     * Moda własna `sin(πx)sin(πy)` ma rozwiązanie zamknięte
     * `cos(cπ√2·t)`, więc oba silniki muszą w nie trafić — i trafiają
     * (SciPy 0,03 pp, nasz schemat zbieżnie: 2,2 → 1,1 → 0,5 pp dla n = 24,
     * 48, 96). To sprawdza solver, a nie różnicę między siatkami.
     */
    initial: '\\sin(\\pi x) \\cdot \\sin(\\pi y)',
  },
];

const UKLADY = [
  {
    dokument: 'wahadlo.md',
    formula: 'pendulum-ode',
    parameters: { g: 9.80665, L: 1, theta_0: 0.4, m: 1 },
    tSpan: [0, 8],
  },
  {
    dokument: 'rezonans.md',
    formula: 'oscylator-ode',
    parameters: { k: 10, m: 1, beta: 0.15, F_0: 1, Omega: 3.1, omega_0: Math.sqrt(10) },
    tSpan: [0, 20],
  },
  {
    dokument: 'lorenz.md',
    formula: 'lorenz-ode',
    // Krótko: w chaosie dwa solwery rozjeżdżają się z definicji, więc
    // porównanie ma sens tylko na odcinku przed rozejściem się trajektorii.
    parameters: { sigma: 10, rho: 28, beta: 2.667, x_0: 1 },
    tSpan: [0, 3],
  },
  {
    // Orbita ekscentryczna — sprawdzian metody adaptacyjnej (etap 1). Zmienna
    // skala czasu jest tu istotą zjawiska: w peryhelium wszystko dzieje się
    // kilkadziesiąt razy szybciej niż w aphelium.
    dokument: 'orbita.md',
    formula: 'orbita-ode',
    parameters: { mu: 3.986004418e14, r_0: 7e6, v_0: 7546 },
    tSpan: [0, 6000],
  },
  {
    // Obwód sztywny — sprawdzian metody niejawnej (etap 3). Referencja liczona
    // metodą Radau, bo jawna nie ma tu czego szukać.
    dokument: 'uklad-sztywny.md',
    formula: 'sztywny-ode',
    parameters: { R: 1e5, L: 0.01, C: 1e-6, U_0: 5, Omega: 1e4 },
    tSpan: [0, 0.005],
    method: 'Radau',
  },
  {
    // Rzut z oporem, ze zdarzeniem kończącym — sprawdzian etapu 2. Porównujemy
    // nie tylko tor, ale **chwilę lądowania**, którą SciPy wyznacza tą samą
    // drogą: jako miejsce zerowe wewnątrz kroku.
    dokument: 'rzut-ukosny.md',
    formula: 'rzut-ode',
    parameters: { g: 9.80665, b: 0.01, m: 1, v_0: 20, alpha: Math.PI / 4 },
    tSpan: [0, 3],
    events: true,
  },
];

/** Wyciąga treść bloku `formula:id` z dokumentu. */
async function wczytajBlok(dokument, id) {
  const markdown = await readFile(join(DOKUMENTY, dokument), 'utf8');
  const wzorzec = new RegExp('```formula:' + id + '\\n([\\s\\S]*?)```');
  const dopasowanie = wzorzec.exec(markdown);
  if (!dopasowanie) throw new Error(`Nie ma bloku formula:${id} w ${dokument}`);
  return parseFormulaBlock(id, dopasowanie[1]);
}

await mkdir(FIXTURES, { recursive: true });

for (const uklad of UKLADY) {
  const blok = await wczytajBlok(uklad.dokument, uklad.formula);
  const scenariusz = exportScenario(blok, {
    parameters: uklad.parameters,
    tSpan: uklad.tSpan,
    samples: 60,
    method: uklad.method,
    events: uklad.events,
  });

  if (scenariusz.issues.length) {
    console.error(`${uklad.formula}: ${scenariusz.issues.join('; ')}`);
    process.exitCode = 1;
    continue;
  }

  await writeFile(TYMCZASOWE, JSON.stringify(scenariusz, null, 2));
  const cel = join(FIXTURES, `${uklad.formula}.json`);

  try {
    const { stdout } = await uruchom(python, [join(here, 'solve_reference.py'), TYMCZASOWE, cel]);
    process.stdout.write(stdout);
  } catch (error) {
    console.error(`${uklad.formula}: ${error.stderr || error.message}`);
    process.exitCode = 1;
  }
}

for (const pole of POLA) {
  const blok = await wczytajBlok(pole.dokument, pole.formula);
  const scenariusz = exportPdeScenario(blok, {
    parameters: pole.parameters,
    tSpan: pole.tSpan,
    frames: pole.frames,
    grid: pole.grid,
    initial: pole.initial,
  });

  if (scenariusz.issues.length) {
    console.error(`${pole.formula}: ${scenariusz.issues.join('; ')}`);
    process.exitCode = 1;
    continue;
  }

  await writeFile(TYMCZASOWE, JSON.stringify(scenariusz, null, 2));
  const cel = join(FIXTURES, `${pole.formula}.json`);

  try {
    const { stdout } = await uruchom(python, [
      join(here, 'solve_field_reference.py'),
      TYMCZASOWE,
      cel,
    ]);
    process.stdout.write(stdout);
  } catch (error) {
    console.error(`${pole.formula}: ${error.stderr || error.message}`);
    process.exitCode = 1;
  }
}

await readdir(FIXTURES).then((pliki) => console.log(`Gotowe fixtures: ${pliki.join(', ')}`));
