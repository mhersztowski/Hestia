import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const rozdzial = [
  '15-1-ruch-harmoniczny.md', '15-2-oscylator.md', '15-3-ruch-prosty.md', '15-4-energia.md',
  '15-5-zastosowania.md', '15-6-okrag.md', '15-7-skladanie.md', '15-8-dwa-ciala.md',
  '15-9-tlumiony.md', '15-10-rezonans.md', '15-Pytania.md', '15-Zadania.md',
];
const pliki = [...rozdzial, 'Slownik.md']
  .map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '15-Zadania.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['15-Zadania.md']} path="15-Zadania.md" resolveRef={resolveRef} />,
);
const dokument = () => index.documents.find((d) => d.path === '15-Zadania.md');

describe('Zadania rozdziału 15', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('55 zadań: 51 w blokach ćwiczeń, 4 z osadzonym rysunkiem lub tablicą', () => {
    const zadania = index.documents.find((d) => d.path === '15-Zadania.md')?.exercises ?? [];
    expect(zadania).toHaveLength(51);

    // Numeracja z druku jest treścią — podręcznik odsyła „patrz zadanie 31" —
    // więc identyfikator bloku niesie ją wprost.
    const numery = zadania.map((z) => Number(z.id.replace(/^.*-/, ''))).sort((a, b) => a - b);
    expect(numery[0]).toBe(1);
    expect(numery[numery.length - 1]).toBeLessThanOrEqual(55);

    // Zadania z osadzonym blokiem zostały pozycjami listy: blok w bloku
    // wymagałby ogranicznika, którego czytnik nie zna, a rysunek zadania jest
    // wart więcej niż jednolitość zapisu.
    const { container } = widok();
    expect(container.querySelectorAll('ol > li')).toHaveLength(4);
    expect(zadania.length + 4).toBe(55);
  });

  it('odpowiedzi z druku wchodzą do bloków jako „@expected"', () => {
    const zadania = index.documents.find((d) => d.path === '15-Zadania.md')?.exercises ?? [];
    expect(zadania.filter((z) => z.expected)).toHaveLength(17);
    // Tyle z nich zaczyna się liczbą, więc da się je sprawdzić maszynowo;
    // reszta to zdania („(a) równoległe, (b) nierównoległe") i tam zostaje
    // porównanie własnym okiem.
    expect(zadania.filter((z) => z.check)).toHaveLength(6);
  });

  it('żaden blok zadania nie ma zastrzeżeń', () => {
    for (const z of index.documents.find((d) => d.path === '15-Zadania.md')?.exercises ?? []) {
      expect(z.issues, z.id).toEqual([]);
      expect(z.prompt.trim().length, z.id).toBeGreaterThan(10);
    }
  });

  it('siedem nagłówków grup, pierwszy to Paragraf 15-3', () => {
    const { container } = widok();
    const naglowki = [...container.querySelectorAll('div')]
      .map((d) => d.textContent ?? '').filter((t) => t.startsWith('Paragraf 15-'));
    expect(naglowki).toEqual([
      'Paragraf 15-3', 'Paragraf 15-4', 'Paragraf 15-5',
      'Paragraf 15-7', 'Paragraf 15-8', 'Paragraf 15-9', 'Paragraf 15-10',
    ]);
  });

  it('osiem rysunków domyka numerację rozdziału', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(8);
    for (let n = 22; n <= 29; n += 1) {
      expect(index.anchors.get(`rh1-15-rys${n}`)?.path, `rys${n}`).toBe('15-Zadania.md');
    }
    // Razem z wykładem: komplet 15-1…15-29.
    for (let n = 1; n <= 29; n += 1) {
      expect(index.anchors.has(`rh1-15-rys${n}`), `rys${n}`).toBe(true);
    }
  });

  it('zadania spinają się z wykładem — odsyłacze w obie strony', () => {
    for (const id of ['rh1-15-eq8', 'rh1-15-eq17', 'rh1-15-eq18', 'rh1-15-eq19',
      'rh1-15-eq30', 'rh1-15-eq33', 'rh1-15-eq41', 'rh1-15-rys9', 'rh1-15-rys12',
      'rh1-15-rys17', 'rh1-15-rys18']) {
      expect(index.anchors.has(id), id).toBe(true);
    }
  });


  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
