import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '4-5-przyspieszenie-styczne.md';
const pliki = [DOK, '4-4-ruch-po-okregu.md', '3-1-mechanika.md', 'Slownik.md'].map((p) => ({
  path: p,
  markdown: readDocument(p),
}));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const cel = (id: string) =>
  resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
const resolveRef = (id: string) => {
  const c = cel(id);
  if (!c.found || !c.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${c.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[c.path] ?? ''
  );
  return { code: m?.[1], kind: c.kind, sameDocument: c.sameDocument };
};
const widok = () =>
  render(<ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />);
/** Dokument jest zawijany na 80 kolumn — porównujemy po zwinięciu białych znaków. */
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');
const wyklad = () => bodies[DOK].split('## Uwagi redakcyjne')[0];

describe('4-5 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('trzy wzory numerowane, wszystkie jako relacje', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => [f.id, f.kind])).toEqual([
      ['rh1-4-eq15', 'relation'],
      ['rh1-4-eq16', 'relation'],
      ['rh1-4-eq17', 'relation'],
    ]);
    expect(d!.formulas.flatMap((f) => f.issues)).toEqual([]);
    expect(resolveRef('rh1-4-eq17')?.code).toContain('a = \\sqrt{a_t^2+a_r^2}.');
  });

  /**
   * Przy wzorze stoi „(4-15)", ale tekst dwa razy powołuje się na „(4.15)" —
   * ta sama niekonsekwencja co (15.1) w rozdziale 15. Cel jest jeden, podpisy
   * dwa, i oba muszą brzmieć jak w druku.
   */
  it('numer wzoru raz z myślnikiem, raz z kropką', () => {
    expect(tekst()).toContain('(4-15)');
    expect(wyklad().match(/\(\(rh1-4-eq15\|4\.15\)\)/g)).toHaveLength(2);
    expect(tekst()).toContain('Drugi wyraz równania (4.15) jest równy');
  });

  it('dwa rysunki: panelowy schemat i zdjęcie z komory', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id)).toEqual(['rh1-4-rys9', 'rh1-4-rys10']);
    expect(widok().container.querySelectorAll('img')).toHaveLength(2);
    expect(resolveRef('rh1-4-rys9')?.code).toContain('@panels a, b, c');
  });

  /**
   * Notka o komorze pęcherzykowej mieszka w 3-1 i to ona jest tu celem —
   * pierwszy w bazie odsyłacz do notki spoza własnego dokumentu.
   */
  it('odsyła się do notki z 3-1 zamiast ją powtarzać', () => {
    const c = cel('rh1-nota-komora-pecherzykowa');
    expect(c.path).toBe('3-1-mechanika.md');
    expect(c.sameDocument).toBe(false);
    expect(index.documents.find((x) => x.path === DOK)?.callouts ?? []).toEqual([]);
  });

  /**
   * Skorowidz wiąże `komorę pęcherzykową` ze stronami 80 i 234, ale na żadnej
   * książka nie mówi, czym ona jest — a s. 234 należy do nieprzeniesionego
   * rozdziału 10. Hasło czeka, mimo że notka o komorze w bazie jest.
   */
  it('stawia hasło o przyspieszeniu stycznym, ale nie o komorze', () => {
    expect(cel('rh1-poj-przyspieszenie-styczne').path).toBe('Slownik.md');
    expect(resolveRef('rh1-poj-przyspieszenie-styczne')?.code).toContain('@source 4-5');
    expect(bodies['Slownik.md']).not.toContain('rh1-poj-komora-pecherzykowa');
  });

  /**
   * `przyspieszenie dośrodkowe` jest w bazie od 4-4, a książka definiuje je tu
   * po raz drugi, znowu kursywą. Odsyłacz prowadzi do tamtego hasła — nowego
   * nie ma.
   */
  it('drugie wprowadzenie hasła z 4-4 prowadzi do niego, a nie tworzy nowego', () => {
    expect(resolveRef('rh1-poj-przyspieszenie-dosrodkowe')?.code).toContain('@source 4-4');
    expect(wyklad()).toContain('((rh1-poj-przyspieszenie-dosrodkowe|przyspieszeniem dośrodkowym))');
    // Podsumowanie na s. 80–81 zostaje kursywą, bez trzeciego znacznika.
    expect(wyklad()).toContain('istnieje więc *przyspieszenie styczne*');
    expect(wyklad()).toContain('*Przyspieszenie dośrodkowe* $a_r$');
  });

  it('usterki druku przetrwały', () => {
    const t = tekst();
    // Wyraz przełamany w druku jako „omów-" + „wieniem".
    expect(t).toContain('wraz z omówwieniem');
    // Brak kropki po „w omawianym punkcie" zlewa dwa zdania w jedno.
    expect(t).toContain('w omawianym punkcie w miarę jak cząstka traci energię, maleje');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
