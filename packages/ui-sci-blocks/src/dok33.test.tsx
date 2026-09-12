import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const DOK = '3-3-predkosc-srednia.md';
const pliki = [DOK, '3-2-kinematyka.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />,
);

describe('3-3 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  // (3-1) ma po prawej stronie opis słowny, a po lewej wektor z poziomą kreską —
  // silnik nie weźmie takiej lewej strony za wielkość, więc blok jest `@relation`.
  it('wzór (3-1) jest relacją, nie przypisaniem', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas).toHaveLength(1);
    const eq = d!.formulas[0];
    expect(eq.id).toBe('rh1-3-eq1');
    expect(eq.kind).toBe('relation');
    expect(eq.issues).toEqual([]);
  });

  // Łańcuch równości niesie wyprowadzenie: skrócenie do samego ilorazu zgubiłoby
  // zdanie książki o tym, czym prędkość średnia jest z definicji.
  it('wzór niesie oba człony łańcucha, razem z opisem słownym', () => {
    const latex = index.documents.find((x) => x.path === DOK)!.formulas[0].latex!;
    expect(latex).toContain('\\frac{\\Delta\\mathbf{r}}{\\Delta t}');
    expect(latex).toContain('przemieszczenie (wektor)');
    expect(latex).toContain('przedział czasu (skalar)');
  });

  it('rysunek 3-2 ma dwa panele pod jednym identyfikatorem', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures?.map((f) => f.id)).toEqual(['rh1-3-rys2']);
    const { container } = widok();
    const img = container.querySelectorAll('img');
    expect(img).toHaveLength(1);
    expect(img[0].getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('sześć nowych haseł, każde z odsyłaczem z tego dokumentu', () => {
    const nowe = [
      'rh1-poj-predkosc-punktu', 'rh1-poj-wektor-polozenia', 'rh1-poj-promien-wodzacy',
      'rh1-poj-wektor-przemieszczenia', 'rh1-poj-predkosc-srednia', 'rh1-poj-predkosc-stala',
    ];
    for (const id of nowe) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
      expect(bodies[DOK], id).toContain(`((${id}|`);
    }
  });

  // Skorowidz wiąże „prędkość chwilową" ze stroną 46, czyli z 3-4 — w podpisie
  // rys. 3-2b książka ją tylko zapowiada. Hasło powstaje więc w 3-4, a stąd
  // nie wychodzi do niego żaden odsyłacz, choć słowo w tekście jest.
  it('„prędkość chwilowa" zostaje kursywą, bez odsyłacza z tego dokumentu', () => {
    expect(bodies[DOK]).toContain('*prędkości chwilowej*');
    expect(bodies[DOK]).not.toContain('rh1-poj-predkosc-chwilowa');
    expect(bodies['Slownik.md']).toMatch(/rh1-poj-predkosc-chwilowa[\s\S]*?@source 3-4/);
  });

  // Nawiasy z książki muszą zostać poza odsyłaczem, bo `))` kończy zapis.
  // Druk pisze na s. 44 „rys. (3.2a)", a na s. 45 „rys. 3-2a" — oba zostają.
  it('obie notacje odsyłacza do rys. 3-2 przetrwały', () => {
    const { container } = widok();
    expect(container.textContent).toContain('na rys. (3.2a)');
    expect(container.textContent).toContain('na rys. 3-2a');
  });

  it('odsyłacz do wzoru zachowuje nawiasy druku', () => {
    const { container } = widok();
    expect(container.textContent).toContain('równaniem (3-1)');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toMatch(/\$|```/);
  });
});
