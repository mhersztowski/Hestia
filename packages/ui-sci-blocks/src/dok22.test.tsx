import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = ['2-2-dodawanie.md', '2-1-wektory.md', 'Slownik.md'].map((p) => ({
  path: p,
  markdown: readDocument(p),
}));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(
    id,
    { anchors: index.anchors, formulaHome: index.formulaHome },
    '2-2-dodawanie.md'
  );
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[cel.path] ?? ''
  );
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () =>
  render(
    <ReaderView
      markdown={bodies['2-2-dodawanie.md']}
      path="2-2-dodawanie.md"
      resolveRef={resolveRef}
    />
  );
const dokument = () => index.documents.find((d) => d.path === '2-2-dodawanie.md');

describe('2-2 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('cztery wzory, wszystkie bez przypisania', () => {
    const { container } = widok();
    for (let n = 1; n <= 4; n += 1) {
      expect(container.querySelector(`#ref-rh1-2-eq${n}`), `eq${n}`).toBeTruthy();
    }
    for (const f of dokument()?.formulas ?? []) {
      expect(f.kind, f.id).toBe('relation');
      expect(f.issues, f.id).toEqual([]);
    }
  });

  it('wektory zapisane grubą literą, jak w druku', () => {
    const eq1 = dokument()?.formulas.find((f) => f.id === 'rh1-2-eq1');
    expect(eq1?.latex).toBe('\\mathbf{a}+\\mathbf{b} = \\mathbf{r}');
  });

  it('trzy rysunki, w tym jeden dwupanelowy', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(dokument()?.figures.find((f) => f.id === 'rh1-2-rys3')?.panels).toEqual(['a', 'b']);
  });

  it('podpis rys. 2-2 odsyła do rysunku z 2-1', () => {
    const { container } = widok();
    const podpis = container.querySelector('#ref-rh1-2-rys2 figcaption');
    expect(podpis?.textContent).toContain('rys. 2-1c');
    expect(index.anchors.get('rh1-2-rys1')?.path).toBe('2-1-wektory.md');
  });

  it('usterka reguły dodawania przepisana, nie poprawiona', () => {
    const zrodlo = bodies['2-2-dodawanie.md'];
    expect(zrodlo).toContain(
      'ostrze wektora\n$\\mathbf{r}$ stykało się z ostrzem wektora $\\mathbf{b}$'
    );
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
