import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const rozdzial = [
  '15-1-ruch-harmoniczny.md', '15-2-oscylator.md', '15-3-ruch-prosty.md', '15-4-energia.md',
  '15-5-zastosowania.md', '15-6-okrag.md', '15-7-skladanie.md', '15-8-dwa-ciala.md',
  '15-9-tlumiony.md', '15-10-rezonans.md',
];
const pliki = [...rozdzial, 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '15-10-rezonans.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['15-10-rezonans.md']} path="15-10-rezonans.md" resolveRef={resolveRef} />,
);
const dokument = () => index.documents.find((d) => d.path === '15-10-rezonans.md');

describe('15-10 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('cztery wzory z kotwicami, wszystkie bez przypisania', () => {
    const { container } = widok();
    for (const n of [40, 41, 42, 43]) {
      expect(container.querySelector(`#ref-rh1-15-eq${n}`), `eq${n}`).toBeTruthy();
    }
    for (const f of dokument()?.formulas ?? []) {
      expect(f.kind, f.id).toBe('relation');
      expect(f.issues, f.id).toEqual([]);
    }
  });

  it('podwójny prim zostaje taki jak w druku', () => {
    const eq42 = dokument()?.formulas.find((f) => f.id === 'rh1-15-eq42');
    expect(eq42?.latex).toContain("\\omega''");
  });

  it('dwa rysunki, w tym wkładka ze zdjęciami mostu', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(2);
    for (const n of [20, 21]) {
      expect(container.querySelector(`#ref-rh1-15-rys${n} img`), `rys ${n}`).toBeTruthy();
    }
  });

  it('oba przypisy stoją jako cytaty blokowe', () => {
    const { container } = widok();
    const cytaty = [...container.querySelectorAll('blockquote')].map((b) => b.textContent ?? '');
    expect(cytaty).toHaveLength(2);
    expect(cytaty[0]).toContain('str. 372');
    expect(cytaty[1]).toContain('Definicje te nie są równoważne');
  });

  it('trzy nowe hasła słownika', () => {
    for (const id of ['rh1-poj-drgania-wymuszone', 'rh1-poj-rezonans', 'rh1-poj-czestosc-rezonansowa']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
  });

  it('usterki druku są przepisane, a nie poprawione', () => {
    const zrodlo = bodies['15-10-rezonans.md'];
    expect(zrodlo).toContain("\\omega' = 2\\pi\\nu' \\sqrt{");
    expect(zrodlo).toContain('Niech siła zenętrzna');
    expect(zrodlo).toContain('stabilnymi pod względem aerodynamicznym\n');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });

  it('cały rozdział 15 jest przeniesiony i spójny', () => {
    for (const p of rozdzial) {
      const d = index.documents.find((x) => x.path === p);
      expect(d?.meta, p).toBeTruthy();
    }
    // Wzory 15-1…15-43 mają komplet kotwic w całym rozdziale.
    for (let n = 1; n <= 43; n += 1) {
      expect(index.anchors.has(`rh1-15-eq${n}`), `eq${n}`).toBe(true);
    }
    for (let n = 1; n <= 21; n += 1) {
      expect(index.anchors.has(`rh1-15-rys${n}`), `rys${n}`).toBe(true);
    }
  });
});
