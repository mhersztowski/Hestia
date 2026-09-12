import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const rozdzial = ['2-1-wektory.md', '2-2-dodawanie.md', '2-3-skladowe.md', '2-4-mnozenie.md',
  '2-5-prawa.md', '2-Pytania.md', '2-Zadania.md'];
const pliki = [...rozdzial, 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '2-Zadania.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['2-Zadania.md']} path="2-Zadania.md" resolveRef={resolveRef} />,
);

describe('Zadania rozdziału 2', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('39 zadań: 36 w blokach ćwiczeń, 3 z osadzonym rysunkiem lub tablicą', () => {
    const zadania = index.documents.find((d) => d.path === '2-Zadania.md')?.exercises ?? [];
    expect(zadania).toHaveLength(36);

    // Numeracja z druku jest treścią — podręcznik odsyła „patrz zadanie 31" —
    // więc identyfikator bloku niesie ją wprost.
    const numery = zadania.map((z) => Number(z.id.replace(/^.*-/, ''))).sort((a, b) => a - b);
    expect(numery[0]).toBe(1);
    expect(numery[numery.length - 1]).toBeLessThanOrEqual(39);

    // Zadania z osadzonym blokiem zostały pozycjami listy: blok w bloku
    // wymagałby ogranicznika, którego czytnik nie zna, a rysunek zadania jest
    // wart więcej niż jednolitość zapisu.
    const { container } = widok();
    expect(container.querySelectorAll('ol > li')).toHaveLength(3);
    expect(zadania.length + 3).toBe(39);
  });

  it('odpowiedzi z druku wchodzą do bloków jako „@expected"', () => {
    const zadania = index.documents.find((d) => d.path === '2-Zadania.md')?.exercises ?? [];
    expect(zadania.filter((z) => z.expected)).toHaveLength(10);
    // Tyle z nich zaczyna się liczbą, więc da się je sprawdzić maszynowo;
    // reszta to zdania („(a) równoległe, (b) nierównoległe") i tam zostaje
    // porównanie własnym okiem.
    expect(zadania.filter((z) => z.check)).toHaveLength(2);
  });

  it('żaden blok zadania nie ma zastrzeżeń', () => {
    for (const z of index.documents.find((d) => d.path === '2-Zadania.md')?.exercises ?? []) {
      expect(z.issues, z.id).toEqual([]);
      expect(z.prompt.trim().length, z.id).toBeGreaterThan(10);
    }
  });

  it('cztery nagłówki grup; paragraf 2-1 nie ma zadań', () => {
    const { container } = widok();
    const naglowki = [...container.querySelectorAll('div')]
      .map((d) => d.textContent ?? '').filter((t) => t.startsWith('Paragraf 2-'));
    expect(naglowki).toEqual(['Paragraf 2-2', 'Paragraf 2-3', 'Paragraf 2-4', 'Paragraf 2-5']);
  });

  it('cztery rysunki zadań domykają numerację rozdziału', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(4);
    for (let n = 15; n <= 18; n += 1) {
      expect(index.anchors.get(`rh1-2-rys${n}`)?.path, `rys${n}`).toBe('2-Zadania.md');
    }
    for (let n = 1; n <= 18; n += 1) {
      expect(index.anchors.has(`rh1-2-rys${n}`), `rys${n}`).toBe(true);
    }
  });

  it('zadania odsyłają do rysunku 2-6b z 2-3', () => {
    expect(bodies['2-Zadania.md']).toContain('((rh1-2-rys6|rys. 2-6b))');
    expect(index.anchors.get('rh1-2-rys6')?.path).toBe('2-3-skladowe.md');
  });


  it('rozdział 2 kompletny: siedem dokumentów', () => {
    for (const p of rozdzial) {
      expect(index.documents.some((d) => d.path === p), p).toBe(true);
    }
    expect(index.anchors.get('rh1-zad-2')?.kind).toBe('section');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
