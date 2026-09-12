import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = [
  '15-9-tlumiony.md', 'Slownik.md', '15-1-ruch-harmoniczny.md', '15-2-oscylator.md',
  '15-3-ruch-prosty.md', '15-4-energia.md', '15-5-zastosowania.md', '15-6-okrag.md',
  '15-7-skladanie.md', '15-8-dwa-ciala.md',
].map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '15-9-tlumiony.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['15-9-tlumiony.md']} path="15-9-tlumiony.md" resolveRef={resolveRef} />,
);
const dokument = () => index.documents.find((d) => d.path === '15-9-tlumiony.md');

describe('15-9 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('trzy wzory z kotwicami, wszystkie bez przypisania', () => {
    const { container } = widok();
    for (const n of [37, 38, 39]) {
      expect(container.querySelector(`#ref-rh1-15-eq${n}`), `eq${n}`).toBeTruthy();
    }
    for (const f of dokument()?.formulas ?? []) {
      expect(f.kind, f.id).toBe('relation');
      expect(f.issues, f.id).toEqual([]);
    }
  });

  it('prim w zapisie zostaje taki jak w druku', () => {
    const eq39 = dokument()?.formulas.find((f) => f.id === 'rh1-15-eq39');
    expect(eq39?.latex).toContain("\\omega'");
    expect(eq39?.latex).toContain("\\nu'");
  });

  it('dwa rysunki na miejscu, oba ze skanu', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(2);
    for (const n of [18, 19]) {
      expect(container.querySelector(`#ref-rh1-15-rys${n} img`), `rys ${n}`).toBeTruthy();
    }
  });

  it('nowe hasło słownika i odsyłacz do hasła z 15-1', () => {
    expect(index.anchors.get('rh1-poj-sredni-czas-zycia')?.kind).toBe('term');
    expect(index.anchors.get('rh1-poj-ruch-drgajacy-harmoniczny-tlumiony')?.path).toBe('Slownik.md');
  });

  it('przypis tłumacza stoi jako cytat blokowy', () => {
    const { container } = widok();
    const cytat = container.querySelector('blockquote');
    expect(cytat?.textContent).toContain('Rubinowicz');
    expect(cytat?.textContent).toContain('przyp. tłum.');
  });

  it('usterka ze zgubionym primem jest opisana, a nie poprawiona', () => {
    const tekst = bodies['15-9-tlumiony.md'];
    expect(tekst).toContain('a $\\omega$ byłoby równe $\\sqrt{k/m}$, czyli $\\omega$');
    expect(tekst).toContain('powinno być $\\omega\'$');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
