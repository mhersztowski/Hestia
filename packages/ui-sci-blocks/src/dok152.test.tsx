import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';
import { readBook } from './test/knowledge';

// One reference points into the textbook, which lives on a user's drive rather
// than in the repository — without it there is nothing to resolve against.
const rozdzial0804 = readBook('08-zasada-zachowania-energii/08-04-jednowymiarowe-uklady-zachowawcze.md');
const pliki = [
  ...['15-2-oscylator.md', 'Slownik.md', '15-1-ruch-harmoniczny.md']
    .map((p) => ({ path: p, markdown: readDocument(p) })),
  { path: '08-04.md', markdown: rozdzial0804 ?? '' },
];
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));

const resolveRef = (id: string) => {
  const cel = resolveReference(id, {
    anchors: index.anchors, formulaHome: index.formulaHome,
    documentTitles: new Map(index.documents.map((d) => [d.path, d.meta.title ?? d.path])),
  }, '15-2-oscylator.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, documentTitle: cel.documentTitle, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['15-2-oscylator.md']} path="15-2-oscylator.md" resolveRef={resolveRef} />,
);

describe.runIf(rozdzial0804)('15-2 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('trzy rysunki z kotwicami i podpisami', () => {
    const { container } = widok();
    for (const n of [3, 4, 5]) {
      expect(container.querySelector(`#ref-rh1-15-rys${n}`), `rys ${n}`).toBeTruthy();
    }
    expect(container.querySelectorAll('img')).toHaveLength(3);
  });

  it('równanie (15-5) pokazuje się mimo braku przypisania', () => {
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-15-eq5')).toBeTruthy();
    // KaTeX składa je jako wzór. Sprawdzamy element, nie `textContent`:
    // KaTeX wstawia źródłowy LaTeX do adnotacji MathML, więc tekst zawiera go
    // zawsze — niewidocznie dla czytelnika.
    expect(container.querySelector('#ref-rh1-15-eq5 .katex')).toBeTruthy();
  });

  it('odsyłacz do 15-1 i do paragrafu 8-4 trafia poza dokument', () => {
    widok();
    expect(screen.getAllByText('rys. 15-1').length).toBeGreaterThan(0);
    expect(screen.getByText('paragraf 8-4')).toBeTruthy();
  });

  it('żaden odsyłacz nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});

describe.runIf(rozdzial0804)('wzory stoją tak, jak w książce', () => {
  it('(15-4) pokazuje pełne wyprowadzenie, nie sam wynik', () => {
    // Książka pisze F(x) = −dU/dx = −d(½kx²)/dx = −kx. Dla podręcznika droga
    // jest treścią, więc sam wynik był realną stratą.
    const { container } = widok();
    const wzor = container.querySelector('#ref-rh1-15-eq4 .katex annotation');
    expect(wzor?.textContent).toContain('\\mathrm{d}U');
    expect(wzor?.textContent).toContain('F(x)');
  });

  it('(15-3) zachowuje zapis funkcyjny U(x)', () => {
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-15-eq3 .katex annotation')?.textContent).toContain('U(x)');
  });
});
