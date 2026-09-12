/**
 * Zadania: wariant z ziarna, klucz z grafu, sprawdzanie i podpowiedzi.
 *
 * Najważniejszy test w tym pliku to ten, który zmienia wzór w dokumencie i
 * sprawdza, że klucz odpowiedzi zmienił się sam. Na tym stoi cała teza raportu
 * o zadaniach: nie ma dwóch źródeł prawdy, bo nie ma drugiego miejsca z fizyką.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from '../graph/formulaGraph';
import { compileGraph } from '../graph/compileGraph';
import { parseExerciseBlock, serializeExerciseBlock } from './parseExercise';
import { statedVariant } from './solveExercise';
import { exerciseVariant, checkNumeric, checkSymbolic } from './solveExercise';
import { buildHints } from './hints';

const WAHADLO = [
  ['ode', ['@ode', '@state theta, omega', '@d theta = \\omega',
    '@d omega = -\\frac{g}{L}\\sin(\\theta)', '@init theta = \\theta_0, omega = 0',
    '@vars g: m/s^2, L: m, theta_0: rad, theta: rad, omega: rad/s'].join('\n')],
  ['okres', ['T = 2\\pi\\sqrt{\\frac{L}{g}}', '@vars T: s, L: m, g: m/s^2',
    '@derivedFrom ode', '@assume male-katy'].join('\n')],
] as Array<[string, string]>;

const graphOf = (defs: Array<[string, string]>) =>
  buildGraph(defs.map(([id, body]) => parseFormulaBlock(id, body)));

const ZADANIE = parseExerciseBlock('okres-zadanie', [
  'Oblicz okres wahadła o długości $L$ przy przyspieszeniu ziemskim.',
  '@given L: 0.5..2 m step 0.1',
  '@answer T',
  '@tolerance 2%',
  '@level 1',
  '@uses okres',
].join('\n'));

describe('blok zadania', () => {
  it('czyta treść, dane i odpowiedź', () => {
    expect(ZADANIE.prompt).toContain('Oblicz okres');
    expect(ZADANIE.given).toEqual([{ name: 'L', min: 0.5, max: 2, unit: 'm', step: 0.1 }]);
    expect(ZADANIE.answer).toBe('T');
    expect(ZADANIE.tolerance).toBeCloseTo(0.02, 9);
    expect(ZADANIE.uses).toEqual(['okres']);
    expect(ZADANIE.issues).toEqual([]);
  });

  it('zadanie bez treści jest błędem — reszta jest opcjonalna', () => {
    // Kontrakt zmienił się świadomie: wskazanie wielkości z grafu jest jednym
    // z trzech sposobów na zadanie, a nie warunkiem jego istnienia. Zadania
    // podręcznikowe i jakościowe też mają wchodzić do powtórek.
    expect(parseExerciseBlock('x', '@answer T').issues.join(' ')).toMatch(/treści/);
    expect(parseExerciseBlock('x', 'Policz coś.').issues).toEqual([]);
  });

  it('odwrócony zakres jest błędem', () => {
    expect(parseExerciseBlock('x', ['Treść', '@given L: 5..1 m', '@answer T'].join('\n')).issues.join(' '))
      .toMatch(/odwrócony/);
  });

  it('round-trip zachowuje zapis', () => {
    expect(serializeExerciseBlock(ZADANIE)).toBe([
      'Oblicz okres wahadła o długości $L$ przy przyspieszeniu ziemskim.',
      '@given L: 0.5..2 m step 0.1',
      '@answer T',
      '@level 1',
      '@uses okres',
    ].join('\n'));
  });
});

describe('wariant z ziarna', () => {
  const model = () => compileGraph(graphOf(WAHADLO));

  it('to samo ziarno daje ten sam wariant', () => {
    const a = exerciseVariant(ZADANIE, model(), 42);
    const b = exerciseVariant(ZADANIE, model(), 42);
    expect(a.values.L).toBe(b.values.L);
    expect(a.expected).toBe(b.expected);
  });

  it('różne ziarna dają różne dane', () => {
    const wartosci = [1, 2, 3, 4, 5].map((seed) => exerciseVariant(ZADANIE, model(), seed).values.L);
    expect(new Set(wartosci).size).toBeGreaterThan(3);
  });

  it('dane mieszczą się w zadanym zakresie', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { values } = exerciseVariant(ZADANIE, model(), seed);
      expect(values.L).toBeGreaterThanOrEqual(0.5);
      expect(values.L).toBeLessThanOrEqual(2);
    }
  });

  it('dane są zaokrąglone do kroku, żeby dało się je przeczytać', () => {
    // Bez przycięcia wychodzi „1.7000000000000002 m" — poprawny wynik mnożenia
    // zmiennoprzecinkowego i zupełnie nieczytelna treść zadania.
    for (let seed = 0; seed < 40; seed += 1) {
      expect(exerciseVariant(ZADANIE, model(), seed).shown.L).toMatch(/^\d+(\.\d)? m$/);
    }
  });

  it('klucz odpowiedzi liczy graf, nie autor', () => {
    const variant = exerciseVariant(ZADANIE, model(), 42);
    expect(variant.expected).toBeCloseTo(2 * Math.PI * Math.sqrt(variant.values.L / variant.values.g), 9);
    expect(variant.expectedUnit).toBe('s');
  });

  it('zmiana wzoru w dokumencie zmienia klucz odpowiedzi', () => {
    // To jest sedno: zadanie nie może się zestarzeć, bo nie ma własnej kopii
    // fizyki. Gdyby ktoś poprawił wzór okresu, klucz idzie za nim.
    const inny = compileGraph(graphOf([
      WAHADLO[0],
      ['okres', ['T = 4\\pi\\sqrt{\\frac{L}{g}}', '@vars T: s, L: m, g: m/s^2'].join('\n')],
    ]));
    const domyslny = exerciseVariant(ZADANIE, model(), 42);
    const zmieniony = exerciseVariant(ZADANIE, inny, 42);

    expect(zmieniony.expected).toBeCloseTo(domyslny.expected! * 2, 6);
  });

  it('dana spoza parametrów dokumentu jest zgłaszana', () => {
    const złe = parseExerciseBlock('x', ['Treść', '@given nieistnieje: 1..2', '@answer T'].join('\n'));
    expect(exerciseVariant(złe, model(), 1).issues.join(' ')).toMatch(/nie jest parametrem/);
  });

  it('odpowiedź będąca przebiegiem, a nie liczbą, jest zgłaszana', () => {
    const złe = parseExerciseBlock('x', ['Treść', '@answer theta'].join('\n'));
    expect(exerciseVariant(złe, model(), 1).issues.join(' ')).toMatch(/nie jest wielkością stałą/);
  });
});

describe('sprawdzanie odpowiedzi numerycznej', () => {
  const variant = () => exerciseVariant(ZADANIE, compileGraph(graphOf(WAHADLO)), 42);

  it('poprawna wartość z jednostką przechodzi', () => {
    const v = variant();
    expect(checkNumeric(`${v.expected!.toFixed(3)} s`, v, 0.02).verdict).toBe('correct');
  });

  it('wartość w innej jednostce tego samego wymiaru też przechodzi', () => {
    const v = variant();
    expect(checkNumeric(`${(v.expected! * 1000).toFixed(1)} ms`, v, 0.02).verdict).toBe('correct');
  });

  it('brak jednostki to osobny werdykt, nie zwykły błąd', () => {
    const v = variant();
    const result = checkNumeric(String(v.expected), v, 0.02);
    expect(result.verdict).toBe('wrong-unit');
    expect(result.message).toMatch(/jednostk/);
  });

  it('zły wymiar jest rozpoznany', () => {
    expect(checkNumeric('2 kg', variant(), 0.02).verdict).toBe('wrong-unit');
  });

  it('wartość poza tolerancją nie przechodzi', () => {
    const v = variant();
    expect(checkNumeric(`${v.expected! * 1.5} s`, v, 0.02).verdict).toBe('wrong');
  });

  it('bliski wynik dostaje inną wskazówkę niż zupełnie chybiony', () => {
    const v = variant();
    const bliski = checkNumeric(`${v.expected! * 1.03} s`, v, 0.02);
    const chybiony = checkNumeric(`${v.expected! * 10} s`, v, 0.02);
    expect(bliski.message).not.toBe(chybiony.message);
  });

  it('żadna odpowiedź nie zdradza poprawnej wartości', () => {
    const v = variant();
    const wynik = v.expected!.toPrecision(4);
    for (const answer of ['1 s', '999 s', '']) {
      expect(checkNumeric(answer, v, 0.02).message).not.toContain(wynik);
    }
  });

  it('bełkot jest odróżniony od złej odpowiedzi', () => {
    expect(checkNumeric('nie wiem', variant(), 0.02).verdict).toBe('unreadable');
  });
});

describe('sprawdzanie odpowiedzi symbolicznej', () => {
  it('inny zapis tego samego wyrażenia przechodzi', () => {
    const result = checkSymbolic(
      '2\\pi \\cdot L^{0.5} \\cdot g^{-0.5}',
      '2\\pi\\sqrt{\\frac{L}{g}}',
      ['L', 'g'],
    );
    expect(result.verdict).toBe('correct');
  });

  it('inne wyrażenie nie przechodzi', () => {
    expect(checkSymbolic('2\\pi\\sqrt{\\frac{g}{L}}', '2\\pi\\sqrt{\\frac{L}{g}}', ['L', 'g']).verdict).toBe('wrong');
  });

  it('drobna różnica stałej jest wychwycona', () => {
    expect(checkSymbolic('\\pi\\sqrt{\\frac{L}{g}}', '2\\pi\\sqrt{\\frac{L}{g}}', ['L', 'g']).verdict).toBe('wrong');
  });

  it('bełkot jest odróżniony', () => {
    expect(checkSymbolic('\\sqrtt{L}', '2 \\cdot L', ['L']).verdict).toBe('unreadable');
  });
});

describe('podpowiedzi z grafu', () => {
  const graph = graphOf(WAHADLO);
  const model = compileGraph(graph);

  it('pierwsza mówi, który wzór, i wymienia założenie', () => {
    const hints = buildHints(graph, 'T');
    expect(hints[0].text).toContain('okres');
    expect(hints[0].text).toContain('male-katy');
  });

  it('druga wymienia potrzebne wielkości, ale nie podaje wyniku', () => {
    const hints = buildHints(graph, 'T');
    expect(hints[1].text).toContain('L');
    expect(hints[1].text).toContain('g');
  });

  it('kolejne stopnie odsłaniają coraz więcej', () => {
    const hints = buildHints(graph, 'T');
    expect(hints.length).toBeGreaterThanOrEqual(2);
    expect(hints.map((h) => h.level)).toEqual(hints.map((_, i) => i + 1));
  });

  it('żadna podpowiedź nie zawiera odpowiedzi', () => {
    const variant = exerciseVariant(ZADANIE, model, 42);
    const result = model.run(variant.values, [0, 1], 0.01);
    const hints = buildHints(graph, 'T', result);
    const wynik = variant.expected!.toPrecision(4);
    for (const hint of hints) expect(hint.text).not.toContain(wynik);
  });

  it('podpowiedzi autora mają pierwszeństwo', () => {
    const hints = buildHints(graph, 'T', undefined, ['Pomyśl o izochronizmie.']);
    expect(hints).toEqual([{ level: 1, text: 'Pomyśl o izochronizmie.' }]);
  });

  it('wielkość spoza grafu nie ma podpowiedzi', () => {
    expect(buildHints(graph, 'nieistnieje')).toEqual([]);
  });
});

describe('zadanie z podręcznika — bez obliczeń', () => {
  it('odpowiedź wpisana wprost zwalnia z modelu', () => {
    const block = parseExerciseBlock('rh1-zad-2-5', `
Grający w golfa uderzył trzykrotnie: 12 m na północ, 6 m na południowy wschód,
3 m na południowy zachód. Jakie przemieszczenie wbiłoby piłkę za pierwszym razem?

@expected 6 m, o kąt 20,5° od kierunku północnego ku wschodowi
@level 2
@uses rh1-2-eq10a
`);
    expect(block.issues).toEqual([]);
    expect(block.expected).toBe('6 m, o kąt 20,5° od kierunku północnego ku wschodowi');
    expect(block.answer).toBeUndefined();
    // Nic nie jest losowane: treść zadania jest taka, jak w książce.
    expect(block.given).toEqual([]);
  });

  it('wyłuskuje wiodącą wielkość, żeby dało się sprawdzić wpisaną odpowiedź', () => {
    const block = parseExerciseBlock('z', 'Treść.\n@expected 6 m, o kąt 20,5°');
    expect(block.check).toBe('6 m');
  });

  it('gdy odpowiedź nie zaczyna się liczbą, nie ma czego sprawdzać', () => {
    const block = parseExerciseBlock('z', 'Treść.\n@expected wektory muszą być prostopadłe');
    expect(block.check).toBeUndefined();
    expect(block.expected).toBe('wektory muszą być prostopadłe');
  });

  it('wielkość do sprawdzenia można podać wprost', () => {
    const block = parseExerciseBlock('z', 'Treść.\n@expected 6 m pod kątem 20,5°\n@check 6 m');
    expect(block.check).toBe('6 m');
  });

  it('zadanie jakościowe nie ma żadnej odpowiedzi i to jest w porządku', () => {
    // Podręcznik jest ich pełen („co można powiedzieć o wektorach a i b…").
    // Odrzucanie ich zamykałoby im drogę do powtórek, a to główny powód,
    // dla którego trafiają do bazy.
    const block = parseExerciseBlock('z', 'Co można powiedzieć o wektorach $a$ i $b$?');
    expect(block.issues).toEqual([]);
    expect(block.answer).toBeUndefined();
    expect(block.expected).toBeUndefined();
  });

  it('dane do losowania bez wskazanej wielkości to pomyłka i mówimy o tym', () => {
    const block = parseExerciseBlock('z', 'Treść.\n@given L: 1..2 m');
    expect(block.issues.join(' ')).toMatch(/@answer/);
  });

  it('zapis i odczyt wracają tym samym', () => {
    const kod = 'Treść zadania.\n@expected 6 m pod kątem 20,5°\n@check 6 m\n@level 2\n@uses rh1-2-eq10a\n@hint Rozłóż na składowe.';
    const raz = parseExerciseBlock('z', kod);
    const dwa = parseExerciseBlock('z', serializeExerciseBlock(raz));
    expect(dwa).toEqual(raz);
  });
});

describe('sprawdzanie odpowiedzi przepisanej z podręcznika', () => {
  it('porównuje z tolerancją i wymiarem, bez żadnego modelu', () => {
    const wariant = statedVariant('6 m');
    expect(checkNumeric('6.05 m', wariant, 0.02).verdict).toBe('correct');
    expect(checkNumeric('7 m', wariant, 0.02).verdict).toBe('wrong');
    expect(checkNumeric('6', wariant, 0.02).verdict).toBe('wrong-unit');
    expect(checkNumeric('6 s', wariant, 0.02).verdict).toBe('wrong-unit');
  });

  it('czyta przecinek dziesiętny — podręcznik pisze „20,5°"', () => {
    expect(statedVariant('20,5').expected).toBeCloseTo(20.5, 9);
  });

  it('odpowiedź czytelnika też może mieć przecinek — tak się pisze po polsku', () => {
    const wariant = statedVariant('6 m');
    expect(checkNumeric('6,1 m', wariant, 0.02).verdict).toBe('correct');
  });

  it('odpowiedź, której nie da się odczytać jako wielkości, nie ma wartości wzorcowej', () => {
    expect(statedVariant('prostopadłe').expected).toBeUndefined();
    expect(statedVariant('prostopadłe').issues.length).toBeGreaterThan(0);
  });
});
