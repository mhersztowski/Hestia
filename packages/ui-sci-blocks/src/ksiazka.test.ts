/**
 * Kontrola całej bazy wiedzy, a nie pojedynczego dokumentu.
 *
 * Testy `dokNN` budują mały indeks z `documents/` i dlatego **nie widzą
 * rusztowania** — 183 stubów podrozdziałów, w które celują odsyłacze typu
 * „patrz paragraf 4-4". Tamte odsyłacze da się sprawdzić dopiero tutaj.
 *
 * Katalog `data/` jest gitignorowany, więc test uruchamia się warunkowo.
 */
import { describe, it, expect } from 'vitest';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { collectMarkdown, hasKnowledge, knowledgeDir } from './test/knowledge';

const pliki = collectMarkdown(knowledgeDir('marcin'));

describe.runIf(hasKnowledge('marcin'))('baza wiedzy w całości', () => {
  const index = buildIndex(pliki);
  const cel = (id: string, skad: string) =>
    resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, skad);

  it('indeks nie zgłasza uwag', () => {
    expect(index.issues.map((i) => `${i.path}: ${i.message}`)).toEqual([]);
  });

  /**
   * Odsyłacz w próżnię jest cichy — renderuje się jak każdy inny, tylko nic nie
   * pokazuje. Jedyne, co go wykrywa, to przejście po wszystkich `((…))` w bazie.
   */
  it('żaden odsyłacz nie prowadzi w próżnię', () => {
    const wProzni: string[] = [];
    for (const { path, markdown } of pliki) {
      for (const m of markdown.matchAll(/\(\(([A-Za-z][\w-]*)(?:\|[^)]*)?\)\)/g)) {
        if (!cel(m[1], path).found) wProzni.push(`${path}: ${m[1]}`);
      }
    }
    expect(wProzni).toEqual([]);
  });

  // Rusztowanie ma wszystkie 183 podrozdziały, więc tekst może odsyłać w przód
  // od pierwszego dnia — 3-6 korzysta z tego dwa razy.
  it('odsyłacz do nieprzeniesionego paragrafu trafia w stub', () => {
    const skad = 'book/Resnick-Halliday-Fizyka-tom-1/03-ruch-jednowymiarowy/03-06-przyspieszenie.md';
    for (const id of ['rh1-sec-3-8', 'rh1-sec-4-4']) {
      const c = cel(id, skad);
      expect(c.found, id).toBe(true);
      expect(c.kind, id).toBe('section');
      expect(c.sameDocument, id).toBe(false);
    }
  });

  /**
   * `@formula` i `@term` w katalogu praw to odsyłacze, tylko zapisane inaczej
   * niż `((…))` — więc skaner odsyłaczy ich nie widzi i cicho przepuściłby
   * wskazanie na nieistniejący wzór.
   */
  it('katalog praw nie wskazuje wzorów ani haseł, których nie ma', () => {
    const wProzni: string[] = [];
    for (const dokument of index.documents) {
      for (const prawo of dokument.laws) {
        for (const c of [...prawo.formulas, ...(prawo.term ? [prawo.term] : [])]) {
          if (!cel(c, dokument.path).found) wProzni.push(`${prawo.id} → ${c}`);
        }
      }
    }
    expect(wProzni).toEqual([]);
  });

  it('każde hasło słownika ma definicję', () => {
    const slownik = pliki.find((p) => p.path.endsWith('Resnick-Halliday-Fizyka-tom-1/Slownik.md'))!;
    const bloki = [...slownik.markdown.matchAll(/^ {0,3}```term:([\w-]+)\n([\s\S]*?)^ {0,3}```/gm)];
    expect(bloki.length).toBeGreaterThan(80);
    for (const [, id, tresc] of bloki) {
      expect(tresc, id).toContain('@definition');
      expect(tresc, id).toContain('@source');
    }
  });
});
