/**
 * Ściąga dyrektyw musi zgadzać się z parserem.
 *
 * To jest cały powód, dla którego ten test istnieje. Katalog opisujący składnię
 * rozjeżdża się z kodem w ciągu tygodnia i staje się gorszy niż jego brak:
 * pokazuje dyrektywy, które przestały działać, i milczy o tych, które doszły.
 *
 * Dlatego listę czytamy **wprost ze źródła parsera** i porównujemy w obie
 * strony. Dyrektywa dodana bez wpisu w katalogu wywala test — i to jest jedyny
 * sposób, żeby ściąga pozostała prawdziwa.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXERCISE_DIRECTIVES, FORMULA_DIRECTIVES, suggestDirectives,
} from './directives';

/** Nazwy z gałęzi `case '…':` w parserze. */
function directivesInParser(file: string): string[] {
  const source = readFileSync(join(__dirname, '..', file), 'utf8');
  const cases = [...source.matchAll(/case '([A-Za-z0-9]+)':/g)].map((m) => m[1]);
  return [...new Set(cases)].sort();
}

describe('katalog bloku formula', () => {
  const wParserze = directivesInParser('formula/parseFormula.ts');
  const wKatalogu = FORMULA_DIRECTIVES.map((d) => d.name).sort();

  it('opisuje każdą dyrektywę, którą parser rozumie', () => {
    const brakujące = wParserze.filter((name) => !wKatalogu.includes(name));
    expect(brakujące, `dyrektywy bez opisu: ${brakujące.join(', ')}`).toEqual([]);
  });

  it('nie opisuje niczego, czego parser nie rozumie', () => {
    const zmyślone = wKatalogu.filter((name) => !wParserze.includes(name));
    expect(zmyślone, `opisy bez pokrycia w parserze: ${zmyślone.join(', ')}`).toEqual([]);
  });
});

describe('katalog bloku exercise', () => {
  const wParserze = directivesInParser('exercise/parseExercise.ts');
  const wKatalogu = EXERCISE_DIRECTIVES.map((d) => d.name).sort();

  it('opisuje każdą dyrektywę, którą parser rozumie', () => {
    expect(wParserze.filter((name) => !wKatalogu.includes(name))).toEqual([]);
  });

  it('nie opisuje niczego, czego parser nie rozumie', () => {
    expect(wKatalogu.filter((name) => !wParserze.includes(name))).toEqual([]);
  });
});

describe('jakość opisów', () => {
  const wszystkie = [...FORMULA_DIRECTIVES, ...EXERCISE_DIRECTIVES];

  it('każda dyrektywa ma zdanie i przykład', () => {
    for (const d of wszystkie) {
      expect(d.summary.length, d.name).toBeGreaterThan(10);
      expect(d.example.startsWith('@'), d.name).toBe(true);
    }
  });

  it('przykład zaczyna się od nazwy dyrektywy', () => {
    // Przykład ma dać się przepisać wprost — rozjazd z nazwą znaczyłby, że
    // ściąga uczy czegoś, czego parser nie przyjmie.
    for (const d of wszystkie) {
      expect(d.example.startsWith(`@${d.name}`), `${d.name}: ${d.example}`).toBe(true);
    }
  });

  it('nazwy się nie powtarzają w obrębie katalogu', () => {
    for (const katalog of [FORMULA_DIRECTIVES, EXERCISE_DIRECTIVES]) {
      const nazwy = katalog.map((d) => d.name);
      expect(new Set(nazwy).size).toBe(nazwy.length);
    }
  });
});

describe('suggestDirectives', () => {
  it('bez przedrostka daje cały katalog', () => {
    expect(suggestDirectives('', FORMULA_DIRECTIVES)).toHaveLength(FORMULA_DIRECTIVES.length);
  });

  it('filtruje po początku nazwy', () => {
    const wynik = suggestDirectives('in', FORMULA_DIRECTIVES).map((d) => d.name);
    expect(wynik).toContain('init');
    expect(wynik).toContain('init2');
    expect(wynik).toContain('invariant');
    expect(wynik).not.toContain('vars');
  });

  it('znak `@` jest opcjonalny', () => {
    expect(suggestDirectives('@st', FORMULA_DIRECTIVES).map((d) => d.name))
      .toEqual(suggestDirectives('st', FORMULA_DIRECTIVES).map((d) => d.name));
  });

  it('nie rozróżnia wielkości liter', () => {
    expect(suggestDirectives('DERIV', FORMULA_DIRECTIVES).map((d) => d.name)).toEqual(['derivedFrom']);
  });

  it('brak dopasowania daje pustą listę, a nie cały katalog', () => {
    expect(suggestDirectives('xyz', FORMULA_DIRECTIVES)).toEqual([]);
  });
});
