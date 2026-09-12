import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '4-Zadania.md';
const pliki = [DOK, '4-2-stale-przyspieszenie.md', '4-4-ruch-po-okregu.md',
  '3-10-spadek-swobodny.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const cel = (id: string) =>
  resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
const resolveRef = (id: string) => {
  const c = cel(id);
  if (!c.found || !c.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${c.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[c.path] ?? '');
  return { code: m?.[1], kind: c.kind, sameDocument: c.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />,
);
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');
const tresc = () => bodies[DOK].split('## Uwagi redakcyjne')[0];

describe('Zadania rozdziału 4 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * Sześć grup „Paragraf 4-N", numeracja biegnie ciągiem przez wszystkie —
   * pierwszy raz w bazie **każdy** podrozdział ma zadania, choć rozkład jest
   * skrajnie nierówny (4-3 i 4-4 biorą 29 z 42).
   */
  it('42 zadania w sześciu grupach, numeracja ciągiem', () => {
    const d = index.documents.find((x) => x.path === DOK);
    const id = d?.exercises.map((e) => e.id) ?? [];
    expect(id).toHaveLength(42);
    expect(id[0]).toBe('rh1-zad-4-1');
    expect(id[41]).toBe('rh1-zad-4-42');
    const grupy = tresc().match(/^### Paragraf 4-\d$/gm) ?? [];
    expect(grupy).toEqual(['### Paragraf 4-1', '### Paragraf 4-2', '### Paragraf 4-3',
      '### Paragraf 4-4', '### Paragraf 4-5', '### Paragraf 4-6']);
  });

  /**
   * Zadania są już kotwicą — `buildIndex` rejestruje bloki `exercise` obok
   * wzorów, haseł i rysunków. Wcześniej ich nie znał, więc odsyłacz „patrz
   * zadanie 7" musiał zostawać zwykłym tekstem; ten test utrwalał tamten stan.
   *
   * Sam tekst rozdziału 4 zostaje bez zmian: podpinanie odsyłaczy w już
   * przeniesionym rozdziale to osobna praca, a nie skutek uboczny zmiany
   * w indeksie. Test pilnuje teraz dwóch rzeczy naraz — że cel istnieje
   * i że tekst nadal go nie używa.
   */
  it('zadanie jest kotwicą, choć tekst rozdziału jeszcze jej nie używa', () => {
    expect(cel('rh1-zad-4-7').found).toBe(true);
    expect(cel('rh1-zad-4-7').kind).toBe('exercise');
    expect(tresc()).toContain('(patrz zadanie 7)');
    expect(tresc()).not.toContain('((rh1-zad-4-7');
    // Pytania to co innego: ich pozycje w ogóle nie są blokami, więc odsyłacz
    // do pytania nadal nie ma czego znaleźć.
    expect(tekst()).toContain('(Patrz pytanie 10.)');
    expect(tresc()).not.toContain('rh1-pyt-4-10');
  });

  it('siedemnaście odpowiedzi z druku, wszystkie jako @expected', () => {
    const zrodlo = tresc();
    expect(zrodlo.match(/^@expected/gm) ?? []).toHaveLength(17);
    // Klucza nie liczymy — odpowiedź jest przepisana, nie wyprowadzona.
    expect(zrodlo).not.toContain('@answer');
    expect(zrodlo).toContain('@expected 36 s.');
  });

  /**
   * Podręcznik przypisuje twierdzenie o równych zasięgach *Dialogowi*, a stoi
   * ono w *Discorsi* — ta sama zamiana tytułów, którą prostuje notka z 3-10.
   * Notka mówi tylko, gdzie twierdzenie stoi; czego zadanie każe dowieść, nie
   * rozstrzyga.
   */
  it('notka przy zadaniu 15 odsyła do 3-10 i nie rozwiązuje zadania', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.callouts.map((c) => c.id)).toEqual(['rh1-nota-dialog-czy-discorsi']);
    const notka = resolveRef('rh1-nota-dialog-czy-discorsi')?.code ?? '';
    expect(notka).toContain('((rh1-sec-3-10|');
    expect(notka).toContain('Czego zadanie każe dowieść, notka nie rozstrzyga.');
    expect(cel('rh1-sec-3-10').path).toBe('3-10-spadek-swobodny.md');
  });

  it('sięga do tablicy 4-1, rys. 4-8 i równania (4-11) z wykładu', () => {
    expect(cel('rh1-4-tab1').path).toBe('4-2-stale-przyspieszenie.md');
    expect(cel('rh1-4-rys8').path).toBe('4-4-ruch-po-okregu.md');
    expect(cel('rh1-4-eq11').path).toBe('4-4-ruch-po-okregu.md');
    // Zadanie 3 powołuje się na sześć wierszy tablicy naraz.
    for (const n of ['4-4b', '4-4b′', '4-4c', '4-4c′', '4-4d', '4-4d′']) {
      expect(tresc(), n).toContain(`((rh1-4-tab1|${n}))`);
    }
  });

  it('pięć rysunków, jeden służy dwóm zadaniom', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id))
      .toEqual(['rh1-4-rys14', 'rh1-4-rys15', 'rh1-4-rys16', 'rh1-4-rys17', 'rh1-4-rys18']);
    expect(widok().container.querySelectorAll('img')).toHaveLength(5);
    expect(tekst()).toContain('Rys. 4-14. Zadania 7 i 15');
  });

  /**
   * Kreska średniej jest treścią zadania 32: chodzi o przyspieszenie **średnie**
   * w przedziale, a nie chwilowe. OCR jej nie widzi.
   */
  it('usterki druku i kreska średniej przetrwały', () => {
    const zrodlo = tresc();
    expect(zrodlo).toContain('\\bar{a}_y = -0,9v^2/r');
    // (c) w druku bez minusa, choć (b) i (d) go mają.
    expect(zrodlo).toContain('\\bar{a}_y = 0,99 v^2/r');
    // Odpowiedź do zadania 37 kończy się przecinkiem.
    expect(zrodlo).toContain('@expected 2,2 m/s; 1,8 m/s,');
    // Zadania 5 i 20 kończą się kropką zamiast pytajnika.
    expect(tekst()).toContain('w odległości 1,5 m od stołu.');
    expect(tekst()).toContain('50 m naprzeciwko bramki.');
  });

  it('nie stawia haseł i nie zostawia surowego zapisu', () => {
    expect(bodies['Slownik.md']).not.toContain('@source Zadania rozdz. 4');
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
