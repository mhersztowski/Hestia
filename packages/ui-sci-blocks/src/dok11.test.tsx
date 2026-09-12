import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = ['1-1-wielkosci.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '1-1-wielkosci.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['1-1-wielkosci.md']} path="1-1-wielkosci.md" resolveRef={resolveRef} />,
);

describe('1-1 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('podrozdział bez wzorów, rysunków i tablic', () => {
    const d = index.documents.find((x) => x.path === '1-1-wielkosci.md');
    expect(d?.formulas).toHaveLength(0);
    expect(d?.figures).toHaveLength(0);
    expect(d?.tables).toHaveLength(0);
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('cztery nowe hasła, w osobnej sekcji słownika', () => {
    for (const id of ['rh1-poj-wielkosci-fizyczne', 'rh1-poj-wielkosci-podstawowe',
      'rh1-poj-wielkosci-pochodne', 'rh1-poj-wzorzec']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
    expect(bodies['Slownik.md']).toContain('## Rozdział 1. Pomiar');
    // Rozdział 1 stoi przed 15, tak jak w książce.
    expect(bodies['Slownik.md'].indexOf('## Rozdział 1. Pomiar'))
      .toBeLessThan(bodies['Slownik.md'].indexOf('## Rozdział 15. Drgania'));
  });

  it('odsyłacze do dwóch pojęć i do dwóch podrozdziałów', () => {
    const zrodlo = bodies['1-1-wielkosci.md'];
    expect(zrodlo).toContain('((rh1-poj-wielkosci-podstawowe|wielkościami podstawowymi))');
    expect(zrodlo).toContain('((rh1-sec-1-3|rozdział 1-3))');
    expect(zrodlo).toContain('((rh1-sec-1-2|paragraf 1-2))');
  });

  it('przypis tłumacza stoi jako cytat blokowy', () => {
    const { container } = widok();
    expect(container.querySelector('blockquote')?.textContent).toBe('* Przypis tłumacza.');
  });

  it('wzór chemiczny amoniaku się składa', () => {
    const { container } = widok();
    expect(container.textContent).toContain('NH');
    expect(container.textContent).not.toContain('$');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
  });
});
