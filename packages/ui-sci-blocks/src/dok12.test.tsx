import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = ['1-2-si.md', '1-1-wielkosci.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '1-2-si.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['1-2-si.md']} path="1-2-si.md" resolveRef={resolveRef} />,
);

describe('1-2 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('pierwsza numerowana tablica bazy ma kotwicę i siedem wierszy', () => {
    const { container } = widok();
    const tab = container.querySelector('#ref-rh1-1-tab1');
    expect(tab).toBeTruthy();
    expect(tab?.querySelectorAll('tbody tr')).toHaveLength(7);
    expect(tab?.querySelectorAll('thead th')).toHaveLength(3);
    expect(index.anchors.get('rh1-1-tab1')?.kind).toBe('table');
  });

  it('trzy odsyłacze do tablicy 1-1 w tym samym dokumencie', () => {
    const zrodlo = bodies['1-2-si.md'];
    expect((zrodlo.match(/\(\(rh1-1-tab1\|/g) ?? [])).toHaveLength(3);
  });

  it('odsyłacz do tablicy 1-2 wychodzi do 1-3, gdzie ją wydrukowano', () => {
    // Tablica 1-2 stoi w 1-3, więc w tym zawężonym indeksie celu nie ma —
    // pełna baza rozwiązuje go bez problemu (patrz dok13.test.tsx).
    expect(index.anchors.has('rh1-1-tab2')).toBe(false);
    expect(bodies['1-2-si.md']).toContain('((rh1-1-tab2|tablicy 1-2))');
  });

  it('trzy nowe hasła słownika', () => {
    for (const id of ['rh1-poj-jednostki-podstawowe-si', 'rh1-poj-uklad-si', 'rh1-poj-uklad-gaussa']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
  });

  it('definicja niutona składa się jako matematyka', () => {
    const { container } = widok();
    // KaTeX wstawia własne odstępy, więc dopasowujemy wzorcem, nie napisem.
    expect(container.textContent).toMatch(/1\s*N\s*=\s*1\s*m/);
    expect(container.textContent).not.toContain('$');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
  });
});
