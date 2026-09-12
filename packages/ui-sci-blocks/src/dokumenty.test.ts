/**
 * Każdy dokument mechaniki musi liczyć to, co obiecuje w tekście.
 *
 * Testy sprawdzają nie tylko brak błędów, ale prawdziwość zdań, które czytelnik
 * ma w treści — bo to one są wartością dokumentu, nie sam fakt, że coś się
 * narysowało.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildGraph, buildHints, checkNumeric, compileGraph, exerciseVariant,
  parseExerciseBlock, suggestViews, buildIndex, learningGraph, allExercises, documentsByTag,
} from '@hestia/core-sci';
import { buildSimSetup, scanFormulas } from './documentModel';

const DIR = resolve(__dirname, '../dokumenty');
const read = (name: string) => readFileSync(resolve(DIR, name), 'utf8');
const simOf = (markdown: string) => /```sim(?::[\w-]+)?\n([\s\S]*?)```/.exec(markdown)![1];

describe('wszystkie dokumenty', () => {
  const names = readdirSync(DIR).filter((f) => f.endsWith('.md'));
  // Dokumenty z modelem w skrypcie (`simscript`) mają własny plik testów —
  // ich fizyka nie powstaje z grafu wzorów, więc i sprawdzenia są inne.
  const zGrafem = names.filter((name) => /```sim(?::[\w-]+)?\n/.test(read(name)));

  it('katalog nie jest pusty', () => {
    expect(names.length).toBeGreaterThanOrEqual(3);
    expect(zGrafem.length).toBeGreaterThanOrEqual(3);
  });

  for (const name of zGrafem) {
    it(`${name}: buduje się bez uwag i ma widoki`, () => {
      const markdown = read(name);
      const setup = buildSimSetup(markdown, simOf(markdown));

      expect(setup.issues, `${name}: ${setup.issues.join(' | ')}`).toEqual([]);
      expect(scanFormulas(markdown).length).toBeGreaterThan(1);
      expect(suggestViews(setup.model, setup.spec.view).length).toBeGreaterThan(0);
    });
  }
});

describe('rzut ukośny', () => {
  const markdown = read('rzut-ukosny.md');
  const setup = () => buildSimSetup(markdown, simOf(markdown));

  it('bez oporu zasięg zgadza się ze wzorem próżniowym', () => {
    const s = setup();
    const result = s.model.run({ ...s.values, b: 0 }, [0, 20], 0.001);
    const zasieg = result.series.x[result.series.x.length - 1][1];
    expect(zasieg).toBeCloseTo(result.scalars.R, 0);
  });

  it('zdarzenie zatrzymuje pocisk na ziemi, a nie pod nią', () => {
    const s = setup();
    const result = s.model.run(s.values, [0, 20], 0.001);
    const wysokosci = result.series.y.map(([, y]) => y);
    expect(Math.min(...wysokosci)).toBeGreaterThan(-0.5);
    expect(result.trajectory!.t1).toBeLessThan(20);
  });

  it('opór skraca lot — to jest teza dokumentu', () => {
    const s = setup();
    const zasieg = (b: number) => {
      const result = s.model.run({ ...s.values, b }, [0, 20], 0.001);
      return result.series.x[result.series.x.length - 1][1];
    };
    expect(zasieg(0.05)).toBeLessThan(zasieg(0) * 0.7);
  });

  it('przy oporze cięższy pocisk leci dalej, choć w próżni masa nic nie zmienia', () => {
    const s = setup();
    const zasieg = (m: number, b: number) => {
      const result = s.model.run({ ...s.values, m, b }, [0, 20], 0.001);
      return result.series.x[result.series.x.length - 1][1];
    };
    expect(zasieg(5, 0.02)).toBeGreaterThan(zasieg(1, 0.02) * 1.2);
    expect(zasieg(5, 0)).toBeCloseTo(zasieg(1, 0), 3);
  });

  it('dostaje widok toru z równymi osiami', () => {
    const s = setup();
    expect(suggestViews(s.model, s.spec.view).some((v) => v.kind === 'path2d')).toBe(true);
  });
});

describe('rezonans', () => {
  const markdown = read('rezonans.md');
  const setup = () => buildSimSetup(markdown, simOf(markdown));

  it('amplituda ustalona z symulacji zgadza się ze wzorem', () => {
    const s = setup();
    const result = s.model.run(s.values, [0, 200], 0.002);

    // Druga połowa przebiegu to stan ustalony — drgania własne już zanikły.
    const ogon = result.series.x.filter(([t]) => t > 120).map(([, x]) => x);
    const amplituda = (Math.max(...ogon) - Math.min(...ogon)) / 2;
    expect(amplituda).toBeCloseTo(result.scalars.A, 1);
  });

  it('odpowiedź jest największa przy częstości własnej', () => {
    const s = setup();
    const amplituda = (Omega: number) => {
      const result = s.model.run({ ...s.values, Omega }, [0, 200], 0.002);
      const ogon = result.series.x.filter(([t]) => t > 120).map(([, x]) => x);
      return (Math.max(...ogon) - Math.min(...ogon)) / 2;
    };
    const omega0 = s.model.run(s.values, [0, 1], 0.01).scalars.omega_0;

    expect(amplituda(omega0)).toBeGreaterThan(amplituda(omega0 * 0.5));
    expect(amplituda(omega0)).toBeGreaterThan(amplituda(omega0 * 2));
  });

  it('słabsze tłumienie daje wyższy szczyt — sedno rezonansu', () => {
    const s = setup();
    const szczyt = (beta: number) => {
      const result = s.model.run({ ...s.values, beta, Omega: 3.1622 }, [0, 300], 0.002);
      const ogon = result.series.x.filter(([t]) => t > 200).map(([, x]) => x);
      return (Math.max(...ogon) - Math.min(...ogon)) / 2;
    };
    expect(szczyt(0.05)).toBeGreaterThan(szczyt(0.5) * 3);
  });

  it('dostaje przestrzeń fazową, bo `v` jest pochodną `x`', () => {
    const s = setup();
    expect(suggestViews(s.model, s.spec.view).some((v) => v.kind === 'phase')).toBe(true);
  });
});

describe('orbita', () => {
  const markdown = read('orbita.md');
  const setup = () => buildSimSetup(markdown, simOf(markdown));

  it('ruch zostaje w płaszczyźnie, w której się zaczął', () => {
    const s = setup();
    const result = s.model.run(s.values, [0, 6000], 0.5);
    const z = result.series.z.map(([, value]) => Math.abs(value));
    // `z` startuje od zera i nie ma powodu z niego wyjść — to sprawdzian
    // poprawności równań, nie własność orbity.
    expect(Math.max(...z)).toBeLessThan(1e-6);
  });

  it('prędkość kołowa daje okrąg, a mniejsza — elipsę', () => {
    const s = setup();
    const promien = (v_0: number) => {
      const result = s.model.run({ ...s.values, v_0 }, [0, 6000], 0.5);
      const r = result.series.x.map(([, x], i) => Math.hypot(x, result.series.y[i][1]));
      return { min: Math.min(...r), max: Math.max(...r) };
    };

    const kolowa = s.model.run(s.values, [0, 1], 0.5).scalars.v_k;
    const okrag = promien(kolowa);
    expect((okrag.max - okrag.min) / okrag.max).toBeLessThan(0.01);

    const elipsa = promien(kolowa * 0.9);
    expect((elipsa.max - elipsa.min) / elipsa.max).toBeGreaterThan(0.1);
  });

  it('okres z symulacji zgadza się z trzecim prawem Keplera', () => {
    const s = setup();
    const kolowa = s.model.run(s.values, [0, 1], 0.5).scalars.v_k;
    const result = s.model.run({ ...s.values, v_0: kolowa }, [0, 12000], 0.5);

    // Okres mierzymy po przejściach przez dodatnią półoś x.
    const y = result.series.y;
    const przejscia: number[] = [];
    for (let i = 1; i < y.length; i += 1) {
      if (y[i - 1][1] < 0 && y[i][1] >= 0) przejscia.push(y[i][0]);
    }
    const zmierzony = (przejscia[przejscia.length - 1] - przejscia[0]) / (przejscia.length - 1);
    expect(zmierzony).toBeCloseTo(result.scalars.T, -1);
  });

  it('Verlet trzyma orbitę przez wiele obiegów', () => {
    const s = setup();
    const kolowa = s.model.run(s.values, [0, 1], 0.5).scalars.v_k;
    const result = s.model.run({ ...s.values, v_0: kolowa }, [0, 60000], 0.5);
    const r = result.series.x.map(([, x], i) => Math.hypot(x, result.series.y[i][1]));

    // Po dziesięciu obiegach promień nie może zauważalnie zmaleć.
    expect(Math.min(...r) / Math.max(...r)).toBeGreaterThan(0.99);
  });

  it('dostaje tor w przestrzeni', () => {
    const s = setup();
    expect(suggestViews(s.model, s.spec.view).some((v) => v.kind === 'path3d')).toBe(true);
  });
});

describe('Lorenz', () => {
  const markdown = read('lorenz.md');
  const setup = () => buildSimSetup(markdown, simOf(markdown));

  it('trajektoria nie ucieka ani nie zatrzymuje się', () => {
    const s = setup();
    const result = s.model.run(s.values, [0, 40], 0.002);
    const r = result.series.r.map(([, value]) => value);
    expect(Math.max(...r)).toBeLessThan(100);
    expect(Math.min(...r.slice(r.length / 2))).toBeGreaterThan(1);
  });

  it('odwiedza oba skrzydła atraktora', () => {
    const s = setup();
    const result = s.model.run(s.values, [0, 40], 0.002);
    const x = result.series.x.map(([, value]) => value);
    expect(Math.min(...x)).toBeLessThan(-5);
    expect(Math.max(...x)).toBeGreaterThan(5);
  });

  it('setna część różnicy w warunku początkowym rozjeżdża trajektorie — teza dokumentu', () => {
    const s = setup();
    const przebieg = (x_0: number) => s.model.run({ ...s.values, x_0 }, [0, 40], 0.002).series.x;

    const a = przebieg(1);
    const b = przebieg(1.01);

    // Różnicę mierzymy na przedziale, nie w punkcie: po rozejściu się
    // trajektorie są nieskorelowane, więc w losowej chwili mogą akurat być
    // blisko siebie. Chaos widać w typowej odległości, nie w jednej próbce.
    const sredniaRoznica = (od: number, do_: number) => {
      const wybrane = a.filter(([t]) => t >= od && t <= do_);
      const suma = wybrane.reduce((acc, [t, value], i) => {
        const index = a.indexOf(wybrane[i]);
        return acc + Math.abs(value - b[index][1]);
      }, 0);
      return suma / wybrane.length;
    };

    expect(sredniaRoznica(0, 2)).toBeLessThan(0.5);
    // Po kilkudziesięciu sekundach typowa odległość jest rzędu rozmiaru atraktora.
    expect(sredniaRoznica(30, 40)).toBeGreaterThan(5);
  });

  it('dostaje tor w przestrzeni mimo braku jednostek', () => {
    expect(suggestViews(setup().model).some((v) => v.kind === 'path3d')).toBe(true);
  });
});

describe('obwód RLC', () => {
  const markdown = read('obwod-rlc.md');
  const setup = () => buildSimSetup(markdown, simOf(markdown));

  it('w rezonansie napięcie na kondensatorze przekracza zasilanie Q razy', () => {
    const s = setup();
    const omega0 = s.model.run(s.values, [0, 1e-4], 1e-6).scalars.omega_0;
    const result = s.model.run({ ...s.values, Omega: omega0 }, [0, 0.02], 2e-7);

    const ogon = result.series.U_C.filter(([t]) => t > 0.012).map(([, u]) => u);
    const amplituda = (Math.max(...ogon) - Math.min(...ogon)) / 2;
    const Q = result.scalars.Q;

    expect(amplituda).toBeCloseTo(Q * s.values.U_0, 0);
    expect(amplituda).toBeGreaterThan(s.values.U_0);
  });

  it('poza rezonansem napięcie jest mniejsze', () => {
    const s = setup();
    const omega0 = s.model.run(s.values, [0, 1e-4], 1e-6).scalars.omega_0;
    const amplituda = (Omega: number) => {
      const result = s.model.run({ ...s.values, Omega }, [0, 0.02], 2e-7);
      const ogon = result.series.U_C.filter(([t]) => t > 0.012).map(([, u]) => u);
      return (Math.max(...ogon) - Math.min(...ogon)) / 2;
    };
    expect(amplituda(omega0 * 3)).toBeLessThan(amplituda(omega0) * 0.2);
  });

  it('to samo równanie co oscylator mechaniczny — dobroć rośnie przy mniejszym oporze', () => {
    const s = setup();
    const dobroc = (R: number) => s.model.run({ ...s.values, R }, [0, 1e-4], 1e-6).scalars.Q;
    expect(dobroc(10)).toBeGreaterThan(dobroc(100) * 5);
  });
});

describe('zadania w dokumentach', () => {
  const scanExercises = (markdown: string) => {
    const fence = /```exercise:([A-Za-z0-9_-]+)\n([\s\S]*?)```/g;
    const out: Array<{ id: string; body: string }> = [];
    let match = fence.exec(markdown);
    while (match) {
      out.push({ id: match[1], body: match[2] });
      match = fence.exec(markdown);
    }
    return out;
  };

  const zZadaniami = readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((name) => scanExercises(read(name)).length > 0);

  it('są dokumenty z zadaniami', () => {
    expect(zZadaniami.length).toBeGreaterThan(0);
  });

  for (const name of zZadaniami) {
    const markdown = read(name);
    const model = () => compileGraph(buildGraph(scanFormulas(markdown)));

    for (const { id, body } of scanExercises(markdown)) {
      const liczony = Boolean(parseExerciseBlock(id, body).answer);

      // Zadanie przepisane z podręcznika nie liczy klucza i nie ma czego
      // sprawdzać wariantami — od niego wymagamy tylko tego, co ma naprawdę:
      // czytelnej treści i zapisu bez zastrzeżeń.
      if (!liczony) {
        it(`${name} / ${id}: treść bez zastrzeżeń`, () => {
          const block = parseExerciseBlock(id, body);
          expect(block.issues, `${id}: ${block.issues.join(' | ')}`).toEqual([]);
          expect(block.prompt.trim().length, id).toBeGreaterThan(10);
          // Odpowiedź z druku, o ile jest, musi zostać zapisana jako całość —
          // urwana w połowie zdania jest gorsza niż żadna.
          if (block.expected) expect(block.expected.trim().length).toBeGreaterThan(0);
        });
        continue;
      }

      it(`${name} / ${id}: buduje się i liczy klucz`, () => {
        const block = parseExerciseBlock(id, body);
        expect(block.issues, `${id}: ${block.issues.join(' | ')}`).toEqual([]);

        const variant = exerciseVariant(block, model(), 1);
        expect(variant.issues, `${id}: ${variant.issues.join(' | ')}`).toEqual([]);
        expect(variant.expected).toBeDefined();
        expect(Number.isFinite(variant.expected!)).toBe(true);
      });

      it(`${name} / ${id}: własna odpowiedź wzorcowa przechodzi sprawdzenie`, () => {
        const block = parseExerciseBlock(id, body);
        // Dziesięć wariantów: klucz musi być poprawny dla każdego, nie tylko
        // dla tego, na którym autor patrzył.
        for (let seed = 1; seed <= 10; seed += 1) {
          const variant = exerciseVariant(block, model(), seed);
          const odpowiedz = variant.expectedUnit && variant.expectedUnit !== '1'
            ? `${variant.expected} ${variant.expectedUnit}`
            : String(variant.expected);
          expect(checkNumeric(odpowiedz, variant, block.tolerance).verdict, `seed ${seed}`).toBe('correct');
        }
      });

      it(`${name} / ${id}: ma podpowiedzi i żadna nie zdradza wyniku`, () => {
        const block = parseExerciseBlock(id, body);
        const graph = buildGraph(scanFormulas(markdown));
        const variant = exerciseVariant(block, model(), 3);
        const hints = buildHints(graph, block.answer!, model().run(variant.values, [0, 1], 0.01), block.hints);

        expect(hints.length).toBeGreaterThan(0);
        for (const hint of hints) {
          expect(hint.text).not.toContain(variant.expected!.toPrecision(4));
        }
      });
    }
  }
});

describe('baza wiedzy jako całość', () => {
  const index = () => buildIndex(
    readdirSync(DIR).filter((f) => f.endsWith('.md')).map((path) => ({ path, markdown: read(path) })),
  );

  it('jest spójna: bez duplikatów, wiszących odniesień i brakujących prerekwizytów', () => {
    const issues = index().issues;
    expect(issues.map((i) => `${i.path ?? ''}: ${i.message}`)).toEqual([]);
  });

  it('każdy dokument ma tytuł i tagi', () => {
    for (const document of index().documents) {
      expect(document.meta.title, document.path).toBeTruthy();
      expect(document.meta.tags.length, document.path).toBeGreaterThan(0);
    }
  });

  it('graf wiedzy łączy dokumenty w drogę nauki', () => {
    const edges = learningGraph(index());
    expect(edges.length).toBeGreaterThanOrEqual(4);

    // Każda krawędź wskazuje istniejące dokumenty — inaczej graf nie da się
    // narysować, a to on jest nawigacją po bazie.
    const paths = new Set(index().documents.map((d) => d.path));
    for (const edge of edges) {
      expect(paths.has(edge.from), `${edge.from} → ${edge.to}`).toBe(true);
      expect(paths.has(edge.to)).toBe(true);
    }
  });

  it('katalog zadań powstaje sam', () => {
    const zadania = allExercises(index());
    expect(zadania.length).toBeGreaterThanOrEqual(3);

    // `@uses` wpina zadanie w graf wiedzy, więc jest wymagane od tych, które
    // z tego grafu liczą klucz — bez powiązania nie miałyby z czego.
    for (const { exercise } of zadania.filter((z) => z.exercise.answer)) {
      expect(exercise.uses.length, exercise.id).toBeGreaterThan(0);
    }

    // Zadania przepisane z podręcznika wchodzą do bazy bez powiązania z wzorem:
    // wskazanie, którego wzoru dotyczy zadanie 7 z rozdziału 1, jest pracą
    // redakcyjną do wykonania zadanie po zadaniu. Udawanie jej automatem
    // wpisałoby do grafu krawędzie, których nikt nie sprawdził.
    const bezPowiazania = zadania.filter((z) => !z.exercise.answer && !z.exercise.uses.length);
    for (const { exercise } of bezPowiazania) {
      expect(exercise.prompt.trim().length, exercise.id).toBeGreaterThan(10);
    }
  });

  it('wyszukiwanie po tagu działa', () => {
    expect(documentsByTag(index(), 'drgania').length).toBeGreaterThanOrEqual(3);
    // Dwa dokumenty o elektronice: obwód i jego przetłumiony wariant, na którym
    // pokazana jest sztywność.
    expect(documentsByTag(index(), 'elektronika').map((d) => d.meta.title).sort())
      .toEqual(['Obwód RLC', 'Układ sztywny']);
  });
});
