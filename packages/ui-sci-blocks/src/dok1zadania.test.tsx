import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const rozdzial = ['1-1-wielkosci.md', '1-2-si.md', '1-3-dlugosc.md', '1-4-masa.md',
  '1-5-czas.md', '1-Pytania.md', '1-Zadania.md'];
const pliki = [...rozdzial, 'Slownik.md']
  .map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '1-Zadania.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['1-Zadania.md']} path="1-Zadania.md" resolveRef={resolveRef} />,
);

describe('Zadania rozdziału 1', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('20 zadań: 19 w blokach ćwiczeń, 1 z osadzonym rysunkiem lub tablicą', () => {
    const zadania = index.documents.find((d) => d.path === '1-Zadania.md')?.exercises ?? [];
    expect(zadania).toHaveLength(19);

    // Numeracja z druku jest treścią — podręcznik odsyła „patrz zadanie 31" —
    // więc identyfikator bloku niesie ją wprost.
    const numery = zadania.map((z) => Number(z.id.replace(/^.*-/, ''))).sort((a, b) => a - b);
    expect(numery[0]).toBe(1);
    expect(numery[numery.length - 1]).toBeLessThanOrEqual(20);

    // Zadania z osadzonym blokiem zostały pozycjami listy: blok w bloku
    // wymagałby ogranicznika, którego czytnik nie zna, a rysunek zadania jest
    // wart więcej niż jednolitość zapisu.
    const { container } = widok();
    expect(container.querySelectorAll('ol > li')).toHaveLength(1);
    expect(zadania.length + 1).toBe(20);
  });

  it('odpowiedzi z druku wchodzą do bloków jako „@expected"', () => {
    const zadania = index.documents.find((d) => d.path === '1-Zadania.md')?.exercises ?? [];
    expect(zadania.filter((z) => z.expected)).toHaveLength(7);
    // Tyle z nich zaczyna się liczbą, więc da się je sprawdzić maszynowo;
    // reszta to zdania („(a) równoległe, (b) nierównoległe") i tam zostaje
    // porównanie własnym okiem.
    expect(zadania.filter((z) => z.check)).toHaveLength(1);
  });

  it('żaden blok zadania nie ma zastrzeżeń', () => {
    for (const z of index.documents.find((d) => d.path === '1-Zadania.md')?.exercises ?? []) {
      expect(z.issues, z.id).toEqual([]);
      expect(z.prompt.trim().length, z.id).toBeGreaterThan(10);
    }
  });

  it('tylko dwa nagłówki grup — brak „Paragraf 1-5" jest w druku', () => {
    const { container } = widok();
    const naglowki = [...container.querySelectorAll('div')]
      .map((d) => d.textContent ?? '').filter((t) => t.startsWith('Paragraf 1-'));
    expect(naglowki).toEqual(['Paragraf 1-3', 'Paragraf 1-4']);
  });

  it('tabela wskazań zegarów ma osiem kolumn i pięć wierszy', () => {
    const { container } = widok();
    const tab = container.querySelector('#ref-rh1-1-tab-zegary');
    expect(tab?.querySelectorAll('thead th')).toHaveLength(8);
    expect(tab?.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('trzy hasła wnoszą zadania, z odsyłaczami z zadania 4', () => {
    for (const id of ['rh1-poj-jednostka-astronomiczna', 'rh1-poj-parsek', 'rh1-poj-rok-swietlny']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
      expect(bodies['1-Zadania.md'], id).toContain(`((${id}|`);
    }
  });

  it('błędny odsyłacz do rys. 1-2 zostaje tekstem, nie jest poprawiany', () => {
    const zrodlo = bodies['1-Zadania.md'];
    expect(zrodlo).toContain('Posługując się rys. 1-2 obliczyć');
    expect(zrodlo).not.toContain('((rh1-1-rys2|');
    expect(zrodlo).not.toContain('((rh1-1-rys4|');
  });

  it('rozdział 1 jest kompletny: siedem dokumentów, dwadzieścia cztery hasła', () => {
    for (const p of rozdzial) {
      expect(index.documents.some((d) => d.path === p), p).toBe(true);
    }
    expect(index.anchors.get('rh1-pyt-1')?.kind).toBe('section');
    expect(index.anchors.get('rh1-zad-1')?.kind).toBe('section');
    // Słownik jest jeden na książkę, więc liczymy hasła z sekcji rozdziału 1.
    const slownik = bodies['Slownik.md'];
    const start = slownik.indexOf('## Rozdział 1. Pomiar');
    // Granicą jest **następny** nagłówek rozdziału, a nie konkretny numer:
    // słownik rośnie w kolejności książki, więc między 1 a 15 przybywa rozdziałów.
    const koniec = slownik.indexOf('\n## Rozdział ', start + 1);
    const sekcja = slownik.slice(start, koniec < 0 ? undefined : koniec);
    expect((sekcja.match(/^```term:/gm) ?? []).length).toBe(24);
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
