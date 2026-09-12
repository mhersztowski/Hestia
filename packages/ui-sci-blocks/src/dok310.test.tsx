import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference, parseCalloutBlock } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '3-10-spadek-swobodny.md';
const pliki = [DOK, '3-9-zgodnosc-jednostek.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
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
/** Dokument jest zawijany na 80 kolumn — porównujemy po zwinięciu białych znaków. */
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');

describe('3-10 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  // Pierwszy podrozdział w rozdziale 3 bez śladu matematyki — sama proza.
  it('nie ma ani wzoru, ani rysunku, ani tablicy', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas ?? []).toHaveLength(0);
    expect(d?.figures ?? []).toHaveLength(0);
    expect(widok().container.querySelectorAll('img')).toHaveLength(0);
    expect(bodies[DOK]).not.toMatch(/^\$\$/m);
  });

  it('wprowadza dwa hasła, oba definiowane na tych stronach', () => {
    for (const id of ['rh1-poj-spadek-swobodny', 'rh1-poj-przyspieszenie-ziemskie']) {
      const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
      expect(cel.found, id).toBe(true);
      expect(cel.path, id).toBe('Slownik.md');
    }
    expect(bodies['Slownik.md']).toContain('@source 3-10, s. 57 (skorowidz: „spadek swobodny 57 i n.")');
    expect(bodies['Slownik.md'])
      .toContain('@source 3-10, s. 58 (skorowidz: „przyspieszenie — ziemskie 58, 389, 395 i n.")');
  });

  /**
   * Notka wychodzi od zdania, które Resnick napisał — tytułu *Dialogu* — i mówi
   * to, czego on nie mówi: wyniki badań nad ruchem są w **innej** książce.
   * Bez tego zdania notka byłaby esejem doklejonym do cudzego rozdziału.
   */
  it('ma notkę o Galileuszu, zaczepioną w zdaniu o Dialogu', () => {
    const blok = resolveRef('rh1-nota-galileusz');
    expect(blok?.kind).toBe('callout');
    const nota = parseCalloutBlock('rh1-nota-galileusz', blok!.code!);
    expect(nota.kind).toBe('person');
    expect(nota.title).toBe('Galileusz');
    expect(nota.issues).toEqual([]);
    expect(nota.body).toContain('Discorsi');
    expect(nota.source).toBe('3-10, s. 58');

    // Zaczepienie musi stać w tekście książki, nie tylko w notce.
    expect(tekst()).toContain('Dialog o dwu najważniejszych układach świata');
  });

  /**
   * Wyróżnienia w notce mają się złożyć, a nie wypisać. Pierwsza wersja miała
   * pogrubienie obejmujące zagnieżdżoną kursywę tytułu i markdown rozjechał się
   * na tym cicho: w tekście zostały surowe gwiazdki, a wyróżnienie objęło
   * przypadkowy kawałek zdania. Ta sama pułapka zjadła podpis odsyłacza —
   * `((id|*tekst*))` nie składa kursywy, więc wyróżnienie musi objąć odsyłacz
   * z zewnątrz.
   */
  it('notka składa się bez surowych gwiazdek', () => {
    const nota = [...widok().container.querySelectorAll('*')]
      .filter((e) => (e.textContent ?? '').startsWith('Tytuł, który Resnick'))
      .pop();
    expect(nota?.textContent).not.toContain('*');
    expect([...nota!.querySelectorAll('em')].map((e) => e.textContent))
      .toContain('Discorsi');
  });

  // Jedyna notka w tym podrozdziale: Arystotelesa książka cytuje i sama obala,
  // więc notka powtórzyłaby akapit.
  it('nie mnoży notek — Arystoteles jej nie dostaje', () => {
    expect(bodies[DOK].match(/^```callout:/gm)).toHaveLength(1);
    expect(tekst()).toContain('Arystoteles zapewniał');
  });

  it('usterki druku przetrwały', () => {
    const t = tekst();
    // Kropka mnożenia bez drugiego czynnika.
    expect(t).toContain('9,8 · m/s²');
    // Litera „ż" nie odbiła się na skanie, ale w druku jest — inaczej niż
    // brakujące „j" w 3-5, którego w druku nie ma.
    expect(t).toContain('wzdłuż całej tej odległości');
  });

  /**
   * Trzy przypisy na jednej stronie — najwięcej dotąd. Gwiazdki muszą zostać
   * gwiazdkami; bez ucieczki markdown otwierał nimi kursywę, która połykała
   * resztę akapitu razem z odsyłaczami.
   */
  it('trzy przypisy zostają przypisami, w kolejności z druku', () => {
    const t = tekst();
    expect(t).toContain('jego wartość * wynosi');
    expect(t).toContain('spadającej piłki ** jest taki sam');
    expect(t).toContain('ze zbiornika ***. Galileusz udowodnił');
    expect(t).not.toContain('\\*');

    const cytat = widok().container.querySelector('blockquote')?.textContent ?? '';
    expect(cytat.indexOf('D. R. Tate')).toBeGreaterThanOrEqual(0);
    expect(cytat.indexOf('Galileo’s Discovery') > cytat.indexOf('D. R. Tate')
      || cytat.indexOf("Galileo's Discovery") > cytat.indexOf('D. R. Tate')).toBe(true);
  });

  it('wyróżnienia druku zostają wyróżnieniami', () => {
    const em = [...widok().container.querySelectorAll('em')]
      .map((e) => (e.textContent ?? '').replace(/\s+/g, ' '));
    // Pojęcie wprowadzane kursywą — i jednocześnie odsyłacz do hasła.
    expect(em).toContain('spadkiem swobodnym');
    expect(em.some((t) => t.startsWith('Dialog o dwu najważniejszych'))).toBe(true);
  });

  // Cytat z Arystotelesa ma w druku polskie cudzysłowy i wielokropek w nawiasie.
  it('cytat z Arystotelesa zostaje cytatem', () => {
    expect(tekst()).toContain('„prędkość spadania (...) dowolnego ciała obdarzonego ciężarem');
  });

  // Rusztowanie ma identyfikatory podrozdziałów, ale nie rozdziałów — więc
  // „(rozdział 16)" nie ma w co trafić i zostaje zwykłym tekstem.
  it('odsyłacz do całego rozdziału zostaje tekstem', () => {
    expect(tekst()).toContain('omówimy później (rozdział 16)');
    // Uwagi redakcyjne wolno o tym pisać — chodzi o tekst książki.
    expect(bodies[DOK].split('## Uwagi redakcyjne')[0]).not.toContain('rh1-sec-16');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
