/**
 * Szacowanie rozmiaru węzła na potrzeby układu.
 *
 * Układ rozsuwa elementy na podstawie ich rozmiarów. Dopóki zakładał stałe
 * 150 × 52 px, węzeł z opisem „Oczekiwanie na zdarzenie" wychodził poza swoje
 * miejsce i nachodził na sąsiada — widać to było zwłaszcza w układzie poziomym,
 * gdzie sąsiedzi stoją tuż obok siebie.
 *
 * Mierzymy szacunkowo (bez DOM), bo układ liczy się zanim cokolwiek trafi na
 * ekran. Wynik ma być ostrożny: lepiej zostawić trochę zapasu niż pozwolić na
 * nachodzenie.
 */
import { describe, it, expect } from 'vitest';
import { estimateNodeSize } from './nodeSize';
import type { DiagramNode } from './diagram';

const node = (partial: Partial<DiagramNode>): DiagramNode =>
  ({ id: 'X', label: '', shape: 'rectangle', ...partial });

describe('estimateNodeSize', () => {
  it('krótka etykieta mieści się w rozmiarze minimalnym', () => {
    const size = estimateNodeSize(node({ label: 'Idle' }));
    expect(size.width).toBeGreaterThanOrEqual(90);
    expect(size.width).toBeLessThan(160);
  });

  it('długa etykieta daje szerszy węzeł', () => {
    const short = estimateNodeSize(node({ label: 'Idle' }));
    const long = estimateNodeSize(node({ label: 'Oczekiwanie na zdarzenie' }));
    expect(long.width).toBeGreaterThan(short.width);
  });

  it('bardzo długi opis zawija się zamiast rosnąć w nieskończoność', () => {
    const size = estimateNodeSize(node({ label: 'Bardzo długi opis stanu, który nie zmieściłby się w jednej linii nawet na szerokim ekranie' }));
    expect(size.width).toBeLessThanOrEqual(320);
    // Zawinięcie oznacza większą wysokość — inaczej tekst wyszedłby poza pudełko.
    expect(size.height).toBeGreaterThan(estimateNodeSize(node({ label: 'Idle' })).height);
  });

  it('bez etykiety liczy się identyfikator — to on jest rysowany', () => {
    expect(estimateNodeSize(node({ id: 'BardzoDlugiIdentyfikatorStanu' })).width)
      .toBeGreaterThan(estimateNodeSize(node({ id: 'A' })).width);
  });

  it('pseudostany są małe niezależnie od nazwy', () => {
    expect(estimateNodeSize(node({ id: '__start0', shape: 'start' }))).toEqual({ width: 30, height: 30 });
    expect(estimateNodeSize(node({ id: '__end1', shape: 'end' }))).toEqual({ width: 30, height: 30 });
  });

  it('rozgałęzienie i złączenie to wąskie belki', () => {
    expect(estimateNodeSize(node({ shape: 'fork' })).height).toBeLessThan(30);
    expect(estimateNodeSize(node({ shape: 'join' })).height).toBeLessThan(30);
  });

  it('romb potrzebuje zapasu — tekst leży w wpisanym kwadracie', () => {
    const rect = estimateNodeSize(node({ label: 'Decyzja', shape: 'rectangle' }));
    const rhombus = estimateNodeSize(node({ label: 'Decyzja', shape: 'rhombus' }));
    expect(rhombus.width).toBeGreaterThan(rect.width);
    expect(rhombus.height).toBeGreaterThan(rect.height);
  });

  it('koło jest kwadratowe — inaczej nie da się go narysować', () => {
    const size = estimateNodeSize(node({ label: 'Koniec', shape: 'circle' }));
    expect(size.width).toBe(size.height);
  });
});

/**
 * Klasa ma ciało, więc jej rozmiar nie wynika z samej etykiety.
 *
 * Szacunek liczony z nazwy dawał pudełko wysokości jednej linii, w którym
 * miało się zmieścić kilkanaście pól i metod — klasy nachodziły na siebie,
 * zanim cokolwiek pojawiło się na ekranie.
 */
describe('rozmiar klasy', () => {
  const klasa = (members: number, nazwa = 'Zwierze') => estimateNodeSize({
    id: nazwa, label: nazwa, shape: 'rectangle',
    members: Array.from({ length: members }, (_, i) => ({ raw: `+pole${i} String`, kind: 'field' as const })),
  });

  it('rośnie z liczbą składowych', () => {
    expect(klasa(6).height).toBeGreaterThan(klasa(1).height);
  });

  it('każda składowa zajmuje własny wiersz', () => {
    const jedna = klasa(1).height;
    const piec = klasa(5).height;
    expect(piec - jedna).toBeGreaterThan(4 * 12);
  });

  it('klasa bez ciała nadal ma sensowną wysokość', () => {
    expect(klasa(0).height).toBeGreaterThan(30);
  });

  it('szerokość uwzględnia najdłuższą składową, nie tylko nazwę', () => {
    const krotka = estimateNodeSize({ id: 'A', label: 'A', shape: 'rectangle', members: [{ raw: '+x', kind: 'field' }] });
    const dluga = estimateNodeSize({
      id: 'A', label: 'A', shape: 'rectangle',
      members: [{ raw: '+bardzoDlugaNazwaMetodyZParametrami(a, b, c) String', kind: 'method' }],
    });
    expect(dluga.width).toBeGreaterThan(krotka.width);
  });
});
