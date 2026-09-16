import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '3-6-przyspieszenie.md';
const pliki = [DOK, '3-4-predkosc-chwilowa.md', '3-5-predkosc-zmienna.md', 'Slownik.md'].map(
  (p) => ({ path: p, markdown: readDocument(p) })
);
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[cel.path] ?? ''
  );
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () =>
  render(<ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />);
/** Dokument jest zawijany na 80 kolumn, więc odsyłacz bywa oddzielony od słowa
 *  łamaniem wiersza — porównujemy na tekście ze zwiniętymi białymi znakami. */
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');

describe('3-6 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  // Oba wzory parser odrzuca jako przypisania (po lewej wektor, po prawej
  // granica), więc `@relation` jest tu wymuszone, a nie ostrożnościowe.
  it('dwa wzory numerowane, oba jako relacje', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => [f.id, f.kind])).toEqual([
      ['rh1-3-eq8', 'relation'],
      ['rh1-3-eq9', 'relation'],
    ]);
    for (const f of d!.formulas) expect(f.issues, f.id).toEqual([]);
  });

  /**
   * Zestawienie z (3-3) i (3-7): pułapka „przechodzi bez uwagi" bierze się
   * wtedy, gdy po lewej stronie stoi goły skalar. Tu po lewej jest wektor,
   * więc parser protestuje sam — ten test pilnuje granicy między tymi dwoma
   * przypadkami, żeby ewentualna łatka w parserze nie zatarła różnicy.
   */
  it('bez @relation parser sam protestuje — inaczej niż przy (3-3) i (3-7)', () => {
    const bez = bodies[DOK].replace(/@relation\n/g, '');
    const wzory = buildIndex([{ path: DOK, markdown: bez }]).documents[0].formulas;
    for (const f of wzory) expect(f.issues.length, f.id).toBeGreaterThan(0);
  });

  it('jeden rysunek, osadzony skan', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures?.map((f) => f.id)).toEqual(['rh1-3-rys6']);
    const img = widok().container.querySelectorAll('img');
    expect(img).toHaveLength(1);
    expect(img[0].getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('cztery nowe hasła, trzy z odsyłaczem', () => {
    const zOdsylaczem = [
      'rh1-poj-przyspieszenie-punktu',
      'rh1-poj-przyspieszenie-srednie',
      'rh1-poj-przyspieszenie-chwilowe',
    ];
    for (const id of [...zOdsylaczem, 'rh1-poj-przyspieszenie']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
    for (const id of zOdsylaczem) expect(bodies[DOK], id).toContain(`((${id}|`);
    // Hasło główne wprowadza zdanie złożone antykwą, więc odsyłacza nie ma.
    expect(bodies[DOK]).not.toContain('((rh1-poj-przyspieszenie|');
  });

  // W 3-4 zapowiedź i definicja były obie kursywne i rozstrzygać musiała treść
  // zdania; tutaj zapowiedź jest antykwą, więc rozstrzyga sam krój.
  it('odsyłacz stoi przy definicji, nie przy zapowiedzi', () => {
    expect(bodies[DOK]).toContain('czyli przyspieszenie\nchwilowe.');
    expect(bodies[DOK]).toContain(
      '((rh1-poj-przyspieszenie-chwilowe|Przyspieszenie chwilowe)) zdefiniowane'
    );
  });

  it('odsyłacze do paragrafów zachowują brzmienie druku', () => {
    const t = tekst();
    expect(t).toContain('(jak w paragrafie 3-8)');
    expect(t).toContain('(paragraf 4-4)');
  });

  it('odsyłacz do (3-2) sięga poprzedniego podrozdziału', () => {
    const cel = resolveReference(
      'rh1-3-eq2',
      { anchors: index.anchors, formulaHome: index.formulaHome },
      DOK
    );
    expect(cel.path).toBe('3-4-predkosc-chwilowa.md');
    expect(tekst()).toContain('w równaniu (3-2)');
  });

  // Cztery z siedmiu kursyw to nacisk, nie pojęcie — reguła „kursywa → pojęcie"
  // dałaby tu ponad połowę śmieci.
  it('kursywa z naciskiem zostaje kursywą', () => {
    for (const frag of [
      '*stałe*',
      '*zmienia się*',
      '*nie ma\nżadnej zmiany*',
      '*granicy\nstosunku*',
    ]) {
      expect(bodies[DOK], frag).toContain(frag);
    }
  });

  it('nawiasy druku wokół odsyłaczy przetrwały', () => {
    const t = tekst();
    expect(t).toContain('(rys. 3-6)');
    expect(t).toContain('równaniem (3-8)');
    expect(t).toContain('równaniem (3-9)');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
