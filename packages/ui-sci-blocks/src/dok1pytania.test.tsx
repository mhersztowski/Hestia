import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = [
  '1-Pytania.md',
  '1-1-wielkosci.md',
  '1-2-si.md',
  '1-3-dlugosc.md',
  '1-4-masa.md',
  '1-5-czas.md',
  'Slownik.md',
].map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(
    id,
    { anchors: index.anchors, formulaHome: index.formulaHome },
    '1-Pytania.md'
  );
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[cel.path] ?? ''
  );
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () =>
  render(
    <ReaderView markdown={bodies['1-Pytania.md']} path="1-Pytania.md" resolveRef={resolveRef} />
  );

describe('Pytania rozdziału 1', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('dwadzieścia sześć pytań, numeracja od jedynki', () => {
    const { container } = widok();
    expect(container.querySelectorAll('ol > li')).toHaveLength(26);
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('1');
  });

  it('pytania wnoszą dwa hasła do słownika', () => {
    for (const id of ['rh1-poj-miesiac-gwiazdowy', 'rh1-poj-miesiac-ksiezycowy']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
      expect(bodies['1-Pytania.md']).toContain(`((${id}|`);
    }
  });

  it('odsyłacze sięgają do czterech tablic i jednego podrozdziału', () => {
    const zrodlo = bodies['1-Pytania.md'];
    for (const id of ['rh1-1-tab1', 'rh1-1-tab2', 'rh1-1-tab4', 'rh1-sec-1-3']) {
      expect(zrodlo, id).toContain(`((${id}|`);
      expect(index.anchors.has(id), id).toBe(true);
    }
  });

  it('niekonsekwencja „tabeli 1-1" jest przepisana', () => {
    expect(bodies['1-Pytania.md']).toContain('((rh1-1-tab1|tabeli 1-1))');
    expect(bodies['1-Pytania.md']).toContain('((rh1-1-tab1|Tablica 1-1))');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
