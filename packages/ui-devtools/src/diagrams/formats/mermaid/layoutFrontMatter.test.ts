/**
 * Utrwalanie układu diagramu w bloku `---` na początku źródła.
 *
 * Składnie tekstowe nie mają współrzędnych — układ liczy renderer. Dla edytora
 * graficznego znaczyło to, że ręczne rozmieszczenie żyło wyłącznie w pamięci
 * komponentu: zamknięcie notatki i `autoLayout` liczył wszystko od zera.
 * Praca włożona w ułożenie diagramu była więc pracą do wyrzucenia, więc nikt
 * jej nie wykonywał, a edytor graficzny zostawał narzędziem do drobnych
 * poprawek zamiast do projektowania.
 *
 * Front matter jest na to właściwym miejscem: Mermaid go czyta, nieznane
 * klucze pomija, a plik zostaje jednym plikiem.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from './index';
import { readPositions, writePositions } from './layoutFrontMatter';

const PROSTY = ['flowchart TB', '  A[Start] --> B[Koniec]'].join('\n');

describe('readPositions', () => {
  it('czyta pozycje węzłów', () => {
    const fm = ['---', 'positions:', '  A: [120, 40]', '  B: [120, 160]', '---'].join('\n');
    expect(readPositions(fm)).toEqual({ A: { x: 120, y: 40 }, B: { x: 120, y: 160 } });
  });

  it('czyta ramkę grupy jako cztery liczby', () => {
    const fm = ['---', 'positions:', '  G: [0, 0, 300, 200]', '---'].join('\n');
    expect(readPositions(fm)).toEqual({ G: { x: 0, y: 0, width: 300, height: 200 } });
  });

  it('pomija klucze spoza sekcji pozycji', () => {
    const fm = ['---', 'title: Algorytm', 'positions:', '  A: [1, 2]', '---'].join('\n');
    expect(readPositions(fm)).toEqual({ A: { x: 1, y: 2 } });
  });

  it('kończy sekcję na kluczu bez wcięcia', () => {
    const fm = ['---', 'positions:', '  A: [1, 2]', 'title: Po sekcji', '---'].join('\n');
    expect(readPositions(fm)).toEqual({ A: { x: 1, y: 2 } });
  });

  it('brak sekcji daje pustą mapę, a nie wyjątek', () => {
    expect(readPositions('---\ntitle: X\n---')).toEqual({});
    expect(readPositions('')).toEqual({});
  });

  it('nieczytelny wpis jest pomijany, a reszta wczytana', () => {
    // Blok bywa edytowany ręcznie; jeden zepsuty wiersz nie może kasować układu.
    const fm = ['---', 'positions:', '  A: [nie, liczba]', '  B: [3, 4]', '---'].join('\n');
    expect(readPositions(fm)).toEqual({ B: { x: 3, y: 4 } });
  });
});

describe('writePositions', () => {
  it('zakłada blok, gdy go nie było', () => {
    const fm = writePositions(undefined, { A: { x: 1, y: 2 } });
    expect(fm).toBe('---\npositions:\n  A: [1, 2]\n---');
  });

  it('dokłada sekcję do istniejącego bloku, nie ruszając reszty', () => {
    const fm = writePositions('---\ntitle: Algorytm\n---', { A: { x: 1, y: 2 } });
    expect(fm).toBe('---\ntitle: Algorytm\npositions:\n  A: [1, 2]\n---');
  });

  it('zastępuje poprzednią sekcję zamiast dokładać drugą', () => {
    const stary = '---\npositions:\n  A: [1, 2]\n---';
    const fm = writePositions(stary, { A: { x: 9, y: 9 } });
    expect(fm).toBe('---\npositions:\n  A: [9, 9]\n---');
  });

  it('pusty układ usuwa sekcję', () => {
    const fm = writePositions('---\ntitle: X\npositions:\n  A: [1, 2]\n---', {});
    expect(fm).toBe('---\ntitle: X\n---');
  });

  it('pusty układ bez innych kluczy usuwa cały blok', () => {
    // Inaczej każdy diagram, którego nikt nie ruszał, dostawałby pusty nagłówek.
    expect(writePositions('---\npositions:\n  A: [1, 2]\n---', {})).toBeUndefined();
  });

  it('zaokrągla współrzędne', () => {
    // Piksel to najmniejsza jednostka, jaką widać; ogon zmiennoprzecinkowy
    // robiłby różnicę w pliku przy każdym najdrobniejszym ruchu myszą.
    const fm = writePositions(undefined, { A: { x: 12.3456, y: -7.8 } });
    expect(fm).toBe('---\npositions:\n  A: [12, -8]\n---');
  });

  it('round-trip zachowuje układ', () => {
    const uklad = { A: { x: 10, y: 20 }, G: { x: 0, y: 0, width: 300, height: 200 } };
    expect(readPositions(writePositions(undefined, uklad)!)).toEqual(uklad);
  });
});

describe('adapter Mermaida', () => {
  it('nie dopisuje niczego, gdy diagram nie ma pozycji', () => {
    const doc = mermaidFormat.parse(PROSTY).document;
    expect(mermaidFormat.serialize(doc)).not.toContain('positions:');
  });

  it('zapisuje pozycje ustawione w edytorze', () => {
    const doc = mermaidFormat.parse(PROSTY).document;
    doc.nodes[0].position = { x: 120, y: 40 };
    doc.nodes[1].position = { x: 120, y: 160 };

    const zapis = mermaidFormat.serialize(doc);

    expect(zapis).toContain('positions:');
    expect(zapis).toContain('A: [120, 40]');
    expect(zapis.startsWith('---')).toBe(true);
  });

  it('odczytuje pozycje z powrotem — układ przeżywa zapis i wczytanie', () => {
    const doc = mermaidFormat.parse(PROSTY).document;
    doc.nodes[0].position = { x: 120, y: 40 };
    doc.nodes[1].position = { x: 120, y: 160 };

    const wrocil = mermaidFormat.parse(mermaidFormat.serialize(doc)).document;

    expect(wrocil.nodes.find((n) => n.id === 'A')?.position).toEqual({ x: 120, y: 40 });
    expect(wrocil.nodes.find((n) => n.id === 'B')?.position).toEqual({ x: 120, y: 160 });
  });

  it('dwa zapisy pod rząd dają ten sam tekst', () => {
    const doc = mermaidFormat.parse(PROSTY).document;
    doc.nodes[0].position = { x: 5, y: 5 };

    const raz = mermaidFormat.serialize(doc);
    const dwa = mermaidFormat.serialize(mermaidFormat.parse(raz).document);

    expect(dwa).toBe(raz);
  });

  it('pozycja węzła, którego już nie ma, znika z zapisu', () => {
    const zRozjazdem = ['---', 'positions:', '  A: [1, 2]', '  Z: [9, 9]', '---', PROSTY].join('\n');
    const doc = mermaidFormat.parse(zRozjazdem).document;

    expect(mermaidFormat.serialize(doc)).not.toContain('Z:');
  });

  it('zachowuje tytuł obok pozycji', () => {
    const zTytulem = ['---', 'title: Algorytm', '---', PROSTY].join('\n');
    const doc = mermaidFormat.parse(zTytulem).document;
    doc.nodes[0].position = { x: 1, y: 2 };

    const zapis = mermaidFormat.serialize(doc);

    expect(zapis).toContain('title: Algorytm');
    expect(zapis).toContain('A: [1, 2]');
  });

  it('działa też dla diagramu stanów z grupą', () => {
    const stany = [
      'stateDiagram-v2',
      '  [*] --> Praca',
      '  state Praca {',
      '    Pomiar --> Wysylka',
      '  }',
    ].join('\n');
    const doc = mermaidFormat.parse(stany).document;
    doc.groups[0].position = { x: 40, y: 80 };
    doc.groups[0].size = { width: 300, height: 200 };

    const wrocil = mermaidFormat.parse(mermaidFormat.serialize(doc)).document;

    expect(wrocil.groups[0].position).toEqual({ x: 40, y: 80 });
    expect(wrocil.groups[0].size).toEqual({ width: 300, height: 200 });
  });
});
