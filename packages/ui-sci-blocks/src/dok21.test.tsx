import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = ['2-1-wektory.md', 'Slownik.md', '15-1-ruch-harmoniczny.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '2-1-wektory.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['2-1-wektory.md']} path="2-1-wektory.md" resolveRef={resolveRef} />,
);

describe('2-1 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('rysunek 2-1 ma trzy panele i kotwicę', () => {
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-2-rys1 img')).toBeTruthy();
    expect(index.documents.find((d) => d.path === '2-1-wektory.md')
      ?.figures.find((f) => f.id === 'rh1-2-rys1')?.panels).toEqual(['a', 'b', 'c']);
  });

  it('trzy przypisy jako osobne cytaty blokowe', () => {
    const { container } = widok();
    const cytaty = [...container.querySelectorAll('blockquote')].map((b) => b.textContent ?? '');
    expect(cytaty).toHaveLength(3);
    expect(cytaty[0]).toContain('przewoźnik');
    expect(cytaty[1]).toContain('Karaśkiewicz');
    expect(cytaty[2]).toContain('Przyp. tłum.');
  });

  it('nowe hasło „wektor" i odsyłacz do niego', () => {
    expect(index.anchors.get('rh1-poj-wektor')?.kind).toBe('term');
    expect(bodies['2-1-wektory.md']).toContain('((rh1-poj-wektor|wektorami))');
  });

  it('przemieszczenie definiowane tutaj, mimo że hasło powstało przy 15-1', () => {
    expect(bodies['2-1-wektory.md']).toContain('((rh1-poj-przemieszczenie|przemieszczeniem))');
    const slownik = bodies['Slownik.md'];
    expect(slownik).toContain('@source 2-1, s. 26; 15-1, s. 345');
    expect(slownik).toContain('Zmiana położenia punktu materialnego');
  });

  it('skalar zostaje kursywą, bez hasła', () => {
    expect(index.anchors.has('rh1-poj-skalar')).toBe(false);
    expect(bodies['2-1-wektory.md']).toContain('nazywane są *skalarami*');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
