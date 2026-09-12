import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = ['15-3-ruch-prosty.md', 'Slownik.md', '15-1-ruch-harmoniczny.md', '15-2-oscylator.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '15-3-ruch-prosty.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['15-3-ruch-prosty.md']} path="15-3-ruch-prosty.md" resolveRef={resolveRef} />,
);

describe('15-3 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('osiem wzorów z kotwicami, w tym cztery równania bez przypisania', () => {
    const { container } = widok();
    for (const n of [6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(container.querySelector(`#ref-rh1-15-eq${n}`), `eq${n}`).toBeTruthy();
    }
  });

  it('trzy rysunki na miejscu, wszystkie ze skanu', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(3);
    for (const n of [6, 7, 8]) {
      expect(container.querySelector(`#ref-rh1-15-rys${n}`), `rys ${n}`).toBeTruthy();
    }
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });

  it('odsyłacz do 15-2 i do paragrafu 15-6 wychodzi poza dokument', () => {
    expect(index.anchors.get('rh1-poj-czestosc-kolowa')?.kind).toBe('term');
    expect(index.anchors.get('rh1-15-rys6')?.kind).toBe('figure');
  });

  it('rysunki niosą obraz, a nie krzywe', () => {
    // Świadomy wybór: skan jest wierny z definicji, rysunek kodem jest
    // interpretacją wymagającą porównania z drukiem przy każdej zmianie.
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-15-rys6 img')).toBeTruthy();
    expect(container.querySelector('#ref-rh1-15-rys6 svg')).toBeNull();
  });
});
