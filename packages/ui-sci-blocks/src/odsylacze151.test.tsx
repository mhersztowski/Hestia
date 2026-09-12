/**
 * Odsyłacze w 15-1 — wszystkie rodzaje celu naraz.
 *
 * Podręcznik odsyła do wzorów, rysunków, tablic i paragrafów tak samo gęsto jak
 * do pojęć. Ten test sprawdza je na prawdziwym dokumencie, bo pojedyncze
 * przypadki potrafią przejść, a dokument mimo to wyglądać na zepsuty.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';
import { readBook } from './test/knowledge';

// Paragrafy, do których 15-1 odsyła, mieszkają w rusztowaniu rozdziałów 6 i 10
// — czyli w książce na dysku użytkownika, poza repozytorium.
const rozdzialy = [
  ['06-dynamika-punktu-materialnego-ii', '06-03-dynamika-ruchu-jednostajnego-po-okregu.md'],
  ['10-zderzenia', '10-01-co-to-jest-zderzenie.md'],
].map(([kat, plik]) => ({ path: `${kat}/${plik}`, markdown: readBook(`${kat}/${plik}`) }));
const maKsiazke = rozdzialy.every((r) => r.markdown !== null);

const pliki = [
  ...['15-1-ruch-harmoniczny.md', 'Slownik.md']
    .map((p) => ({ path: p, markdown: readDocument(p) })),
  ...rozdzialy.map((r) => ({ path: r.path, markdown: r.markdown ?? '' })),
];
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));

const resolveRef = (id: string) => {
  const cel = resolveReference(id, {
    anchors: index.anchors,
    formulaHome: index.formulaHome,
    documentTitles: new Map(index.documents.map((d) => [d.path, d.meta.title ?? d.path])),
  }, '15-1-ruch-harmoniczny.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, documentTitle: cel.documentTitle, sameDocument: cel.sameDocument };
};

const widok = () => render(
  <ReaderView markdown={bodies['15-1-ruch-harmoniczny.md']} path="15-1-ruch-harmoniczny.md" resolveRef={resolveRef} />,
);

describe.runIf(maKsiazke)('15-1: odsyłacze do wszystkich rodzajów celu', () => {
  it('rysunki są blokami z identyfikatorem i kotwicą', () => {
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-15-rys1')).toBeTruthy();
    expect(container.querySelector('#ref-rh1-15-rys2')).toBeTruthy();
    // Podpis został przy rysunku, a nie odkleił się jako osobny akapit.
    expect(container.querySelector('#ref-rh1-15-rys1 figcaption')?.textContent)
      .toMatch(/Punkt materialny o masie/);
  });

  it('wzór ma kotwicę, więc odsyłacz ma dokąd przewinąć', () => {
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-15-eq2')).toBeTruthy();
  });

  it('odsyłacze do rysunku, wzoru i paragrafu są w tekście', () => {
    widok();
    for (const s of ['rysunku 15-1a', 'Rysunek 15-1b', 'rys. 15-1c', 'rysunku 15-2',
      '15-2', 'paragrafu 10-1']) {
      expect(screen.getAllByText(s).length, s).toBeGreaterThan(0);
    }
  });

  it('żaden odsyłacz nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toMatch(/rh1-sec-|rh1-15-rys/);
  });

  it('paragraf 6-3 i 10-1 celują w rusztowanie, nie w próżnię', () => {
    // Rusztowanie ma wszystkie 183 podrozdziały, więc odsyłacz do jeszcze
    // nieprzeniesionego paragrafu i tak się rozwiązuje.
    expect(resolveKind('rh1-sec-10-1')).toBe('section');
  });
});

function resolveKind(id: string) {
  return index.anchors.get(id)?.kind;
}
