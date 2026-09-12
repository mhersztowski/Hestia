import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = ['2-3-skladowe.md', '2-1-wektory.md', '2-2-dodawanie.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '2-3-skladowe.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['2-3-skladowe.md']} path="2-3-skladowe.md" resolveRef={resolveRef} />,
);
const dokument = () => index.documents.find((d) => d.path === '2-3-skladowe.md');

describe('2-3 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('dziewięć wzorów; tylko trzy wchodzą do grafu', () => {
    const { container } = widok();
    for (const id of ['eq5', 'eq6a', 'eq6b', 'eq7', 'eq8a', 'eq8b', 'eq9', 'eq10a', 'eq10b']) {
      expect(container.querySelector(`#ref-rh1-2-${id}`), id).toBeTruthy();
    }
    const rodzaje = Object.fromEntries((dokument()?.formulas ?? []).map((f) => [f.id, f.kind]));
    for (const id of ['rh1-2-eq6a', 'rh1-2-eq10a', 'rh1-2-eq10b']) {
      expect(rodzaje[id], id).toBe('definition');
    }
    for (const id of ['rh1-2-eq5', 'rh1-2-eq6b', 'rh1-2-eq7', 'rh1-2-eq8a', 'rh1-2-eq8b', 'rh1-2-eq9']) {
      expect(rodzaje[id], id).toBe('relation');
    }
  });

  it('odwrócony wzór (2-6b) przepisany, a poprawna wersja stoi obok w tekście', () => {
    const eq6b = dokument()?.formulas.find((f) => f.id === 'rh1-2-eq6b');
    expect(eq6b?.latex).toContain('\\frac{a_x}{a_y}');
    // Ta sama zależność, zapisana w książce poprawnie trzy strony dalej:
    expect(bodies['2-3-skladowe.md']).toContain('\\operatorname{tg}\\theta = r_y/r_x');
  });

  it('sześć rysunków, trzy dwupanelowe', () => {
    const { container } = widok();
    // Rys. 2-5 … 2-10 — sześć bloków `figure`, każdy z jednym obrazem.
    expect(container.querySelectorAll('img')).toHaveLength(6);
    const figury = dokument()?.figures ?? [];
    expect(figury.filter((f) => f.panels.length === 2)).toHaveLength(3);
  });

  it('dwa nowe hasła; wektor jednostkowy zostaje kursywą', () => {
    for (const id of ['rh1-poj-skladowe-wektora', 'rh1-poj-rozkladanie-wektora']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
    expect(index.anchors.has('rh1-poj-wektor-jednostkowy')).toBe(false);
    expect(bodies['2-3-skladowe.md']).toContain('*wektorem jednostkowym*');
  });

  it('literówki druku przepisane', () => {
    const z = bodies['2-3-skladowe.md'];
    expect(z).toContain('wygodnie jest cząsami');
    expect(z).toContain('proces dadawania');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
