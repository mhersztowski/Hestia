/**
 * Katalog praw książki — jedna lista na tom, jak słownik.
 *
 * Testy pilnują dwóch rzeczy naraz: że katalog jest **kompletny wobec
 * skorowidza** (32 pozycje, nie tyle, ile zdążyliśmy przenieść) i że pozycja
 * bez treści zachowuje się jak zapowiedź, a nie jak awaria.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readBook } from './test/knowledge';

const markdown = readBook('Prawa.md');
const slownik = readBook('Slownik.md');
const oscylator = readBook('15-drgania/15-02-oscylator-harmoniczny-prosty.md');

describe.runIf(!!markdown && !!slownik && !!oscylator)('katalog praw', () => {
  const pliki = [
    { path: 'Prawa.md', markdown: markdown ?? '' },
    { path: 'Slownik.md', markdown: slownik ?? '' },
    { path: '15-02.md', markdown: oscylator ?? '' },
  ];
  const index = buildIndex(pliki);
  const prawa = index.documents.find((d) => d.path === 'Prawa.md')!.laws;

  it('baza spójna', () => expect(index.issues).toEqual([]));

  // 13 praw + 19 zasad odczytanych z poziomów skorowidza na skanie.
  it('ma wszystkie 32 pozycje ze skorowidza', () => {
    expect(prawa).toHaveLength(32);
    for (const p of prawa) expect(p.issues, p.id).toEqual([]);
  });

  it('każda pozycja wskazuje rozdział i miejsce w książce', () => {
    for (const p of prawa) {
      expect(p.chapter, p.id).toBeGreaterThan(0);
      expect(p.source, p.id).toMatch(/skorowidz/);
    }
  });

  /**
   * Katalog powstaje ze skorowidza w całości, a rozdziały przenosimy po kolei.
   * Rozdział 15 jest jedynym przeniesionym, w którym skorowidz umieszcza
   * jakiekolwiek prawo — więc wypełniona ma być dokładnie jedna pozycja.
   */
  it('wypełnione jest dokładnie to, co da się dziś zacytować', () => {
    const gotowe = prawa.filter((p) => !p.awaiting);
    expect(gotowe.map((p) => p.id)).toEqual(['rh1-prawo-hooke']);
    expect(gotowe[0].statement).toMatch(/proporcjonalna do przemieszczenia/);
  });

  // Bez tego katalog byłby spisem tytułów — `@formula` wiąże prawo z tym samym
  // blokiem, z którego liczy się symulacja w dokumencie.
  it('prawo Hooke\'a sięga wzoru i hasła w bazie', () => {
    const hooke = prawa.find((p) => p.id === 'rh1-prawo-hooke')!;
    expect(hooke.formulas).toEqual(['rh1-15-eq4']);
    expect(hooke.term).toBe('rh1-poj-prawo-hookea');
    for (const cel of [...hooke.formulas, hooke.term!]) {
      const r = resolveReference(cel, { anchors: index.anchors, formulaHome: index.formulaHome }, 'Prawa.md');
      expect(r.found, cel).toBe(true);
    }
  });

  it('identyfikatory są unikalne i mają przedrostek książki', () => {
    const id = prawa.map((p) => p.id);
    expect(new Set(id).size).toBe(id.length);
    for (const x of id) expect(x).toMatch(/^rh1-prawo-/);
  });

  it('pozycja bez treści czyta się jak zapowiedź, nie jak awaria', () => {
    const { container } = render(<ReaderView markdown={markdown ?? ''} path="Prawa.md" />);
    const t = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('Treść czeka na przeniesienie rozdziału 17');
    expect(t).not.toMatch(/undefined|NaN|\[object/);
  });

  it('cały katalog renderuje się bez surowego zapisu', () => {
    const { container } = render(<ReaderView markdown={markdown ?? ''} path="Prawa.md" />);
    const t = container.textContent ?? '';
    expect(t).toContain('Prawo Hooke\'a');
    expect(t).toContain('Zasada zachowania pędu');
    expect(t).not.toContain('@chapter');
    expect(t).not.toContain('```');
  });
});
