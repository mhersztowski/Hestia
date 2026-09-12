/**
 * Tryb bloku diagramu zapisany w infostringu.
 *
 * Blok otwierał się zawsze w trybie „Code", bo tryb żył wyłącznie w stanie
 * komponentu. Dla diagramu, który jest **ilustracją w dokumencie**, to zły
 * domyślny wybór: czytelnik notatki architektury chce zobaczyć rysunek, a nie
 * źródło, i musiał klikać przy każdym otwarciu.
 *
 * Zapis idzie tam, gdzie w tym projekcie idą już ustawienia bloków `automate`
 * i `pscript` — do parametrów po dwukropku, w samym infostringu.
 */
import { describe, it, expect } from 'vitest';
import { readMode, languageWithMode, matchesDiagramLanguage } from './diagramBlockMode';

describe('readMode', () => {
  it('bez parametru daje tryb tekstu', () => {
    expect(readMode('mermaid')).toBe('code');
  });

  it('czyta zapisany tryb', () => {
    expect(readMode('mermaid:view')).toBe('view');
    expect(readMode('mermaid:edit')).toBe('edit');
    expect(readMode('mermaid:code')).toBe('code');
  });

  it('nieznany parametr nie zmienia trybu', () => {
    // Infostring bywa pisany ręcznie; literówka ma zostawić blok w spokoju,
    // a nie otworzyć go w losowym trybie.
    expect(readMode('mermaid:cokolwiek')).toBe('code');
  });

  it('nie reaguje na inne języki', () => {
    expect(readMode('formula:okres')).toBe('code');
  });
});

describe('languageWithMode', () => {
  it('tryb tekstu zapisuje się jako sam język', () => {
    // Domyślny tryb nie trafia do pliku — inaczej każdy blok diagramu
    // dostawałby parametr, który nic nie zmienia.
    expect(languageWithMode('mermaid', 'code')).toBe('mermaid');
    expect(languageWithMode('mermaid:view', 'code')).toBe('mermaid');
  });

  it('pozostałe tryby dopisują parametr', () => {
    expect(languageWithMode('mermaid', 'view')).toBe('mermaid:view');
    expect(languageWithMode('mermaid', 'edit')).toBe('mermaid:edit');
  });

  it('podmienia poprzedni tryb zamiast dokładać drugi', () => {
    expect(languageWithMode('mermaid:view', 'edit')).toBe('mermaid:edit');
  });

  it('round-trip przez oba kierunki', () => {
    for (const mode of ['code', 'view', 'edit'] as const) {
      expect(readMode(languageWithMode('mermaid', mode))).toBe(mode);
    }
  });
});

describe('projekt UML jako drugi język bloku', () => {
  it('jest rozpoznawany razem z trybem', () => {
    expect(matchesDiagramLanguage('umlproj')).toBe(true);
    expect(readMode('umlproj:view')).toBe('view');
    expect(languageWithMode('umlproj', 'edit')).toBe('umlproj:edit');
  });

  it('zmiana trybu nie podmienia języka', () => {
    // `languageWithMode` bierze przedrostek z tego, co dostało — inaczej blok
    // projektu UML zmieniałby się w blok Mermaida przy kliknięciu „View".
    expect(languageWithMode('umlproj:code', 'view')).toBe('umlproj:view');
  });
});

describe('kolejne języki diagramów', () => {
  it('DOT i PlantUML są rozpoznawane razem z trybem', () => {
    expect(matchesDiagramLanguage('dot')).toBe(true);
    expect(matchesDiagramLanguage('plantuml')).toBe(true);
    expect(readMode('dot:view')).toBe('view');
    expect(languageWithMode('plantuml', 'edit')).toBe('plantuml:edit');
  });
});

describe('matchesDiagramLanguage', () => {
  it('łapie blok z trybem i bez', () => {
    expect(matchesDiagramLanguage('mermaid')).toBe(true);
    expect(matchesDiagramLanguage('mermaid:view')).toBe(true);
    expect(matchesDiagramLanguage('mermaid:edit')).toBe(true);
  });

  it('nie łapie innych bloków', () => {
    expect(matchesDiagramLanguage('formula:okres')).toBe(false);
    expect(matchesDiagramLanguage('json')).toBe(false);
    expect(matchesDiagramLanguage('mermaidish')).toBe(false);
    expect(matchesDiagramLanguage('')).toBe(false);
  });
});
