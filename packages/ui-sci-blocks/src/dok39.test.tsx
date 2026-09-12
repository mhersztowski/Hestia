import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const DOK = '3-9-zgodnosc-jednostek.md';
const pliki = [DOK, '3-8-przyspieszenie-stale.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />,
);
/** Dokument jest zawijany na 80 kolumn — porównujemy po zwinięciu białych znaków. */
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');

describe('3-9 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * Ten podrozdział jest lustrzanym odbiciem 3-8: tamten postawił cztery
   * równania i tablicę, ten wyłącznie z nich korzysta. Zero własnych bloków,
   * czyli zero nowych celów odsyłacza — a mimo to dokument jest w pełni
   * spięty z bazą.
   */
  it('nie wnosi ani jednego bloku, same odesłania', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas ?? []).toHaveLength(0);
    expect(d?.figures ?? []).toHaveLength(0);
    expect(widok().container.querySelectorAll('img')).toHaveLength(0);
    expect(bodies[DOK]).not.toMatch(/^```(formula|figure|table):/m);
  });

  it('wszystkie odesłania trafiają w 3-8', () => {
    for (const id of ['rh1-3-eq12', 'rh1-3-eq14', 'rh1-3-eq15', 'rh1-3-eq16', 'rh1-3-tab1']) {
      const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
      expect(cel.found, id).toBe(true);
      expect(cel.path, id).toBe('3-8-przyspieszenie-stale.md');
      expect(cel.sameDocument, id).toBe(false);
    }
  });

  // Jedyne hasło z tych stron. Drugi wpis skorowidza („Jednostki 14, 55")
  // wskazuje stronę, na której definicji nie ma — definiuje ją s. 14.
  it('wprowadza hasło „wymiar" i tylko je', () => {
    const cel = resolveReference(
      'rh1-poj-wymiar', { anchors: index.anchors, formulaHome: index.formulaHome }, DOK,
    );
    expect(cel.found).toBe(true);
    expect(cel.path).toBe('Slownik.md');
    expect(bodies['Slownik.md']).toContain('@source 3-9, s. 55-56 (skorowidz: „wymiar 55, 56")');

    const uzyte = [...bodies[DOK].matchAll(/\(\(rh1-poj-([a-z-]+)\|/g)].map((m) => m[1]);
    expect([...new Set(uzyte)]).toEqual(['wymiar']);
  });

  /**
   * Najpoważniejsza usterka druku w całym rozdziale 3: treść Przykładu 6 nie
   * podaje prędkości końcowej, a rozwiązanie od razu podstawia 30 km/h. Zadania
   * w tej postaci **nie da się rozwiązać** — i tak ma zostać.
   */
  it('treść Przykładu 6 zostaje niepełna, tak jak w druku', () => {
    const t = tekst();
    expect(t).toContain('maleje jednostajnie od wartości 45 km/h, na odcinku równym 50 m.');
    const tresc = t.slice(t.indexOf('Przykład 6.'), t.indexOf('(a) Jaka jest'));
    expect(tresc).not.toContain('30');
  });

  it('usterki liczbowe druku przetrwały', () => {
    const zrodlo = bodies[DOK].split('## Uwagi redakcyjne')[0];
    // 0,05 km to 50 m, tyle mówi treść — „+59 m" jest przestawieniem cyfr.
    expect(zrodlo).toContain('x-x_0 = +59$ m $= 0{,}05$ km');
    // Zgubiony kwadrat w jednostce przyspieszenia: raz w mianowniku części (b)…
    expect(zrodlo).toContain('{-1{,}13\\cdot 10^4\\ \\mathrm{km/h}}');
    // …i raz w danych części (d).
    expect(zrodlo).toContain('$a_x = -1{,}13\\cdot 10^4$ km/h,');
    // W częściach (a) i (c) tego samego przykładu jednostka jest poprawna —
    // czyli to skład, nie konwencja autora.
    expect(zrodlo).toContain('\\mathrm{km/h^2}}');
  });

  // 6,3·10¹² to po polsku 6,3 biliona; „trylion" to 10¹⁸. Angielskie
  // „trillion" przeszło przez tłumaczenie bez przeliczenia.
  it('kalka „6 trylionów" zostaje', () => {
    expect(tekst()).toContain('czyli 6 trylionów');
  });

  /**
   * Kursywa jest w tej książce nośnikiem treści, a nie ozdobą: wyróżnia
   * wprowadzane pojęcie i regułę. Zjadło ją już raz łamanie akapitu w 15-1.
   */
  it('wyróżnienia druku zostają wyróżnieniami', () => {
    const em = [...widok().container.querySelectorAll('em')]
      .map((e) => (e.textContent ?? '').replace(/\s+/g, ' '));
    expect(em).toContain('dowolne jednostki');
    expect(em).toContain('wymiarów');
    expect(em.some((t) => t.startsWith('W każdym poprawnym równaniu fizycznym'))).toBe(true);
  });

  it('wzory bez numeru zostają zwykłym LaTeX-em', () => {
    const zrodlo = bodies[DOK].split('## Uwagi redakcyjne')[0];
    const display = zrodlo.match(/^\$\$[\s\S]*?\$\$$/gm) ?? [];
    expect(display).toHaveLength(18);
    // Sprawdzenie wymiarów jest tekstem w środku wzoru, nie symbolem.
    expect(display.some((d) => d.includes('\\text{długość}'))).toBe(true);
  });

  it('nawiasy druku wokół odsyłaczy przetrwały', () => {
    const t = tekst();
    expect(t).toContain('równanie (3-16) (patrz tablica 3-1)');
    expect(t).toContain('w tablicy 3-1');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
