/**
 * Testy modelu dokumentu wykresu.
 *
 * Dokument jest tym, co ląduje w bloku markdown, więc dwie rzeczy muszą być
 * pewne: że zapis i odczyt dają to samo, i że plik nie puchnie od ustawień,
 * których nikt nie ruszał.
 */

import { describe, it, expect } from 'vitest';
import {
  createPlotDocument, parsePlotDocument, serializePlotDocument, addRow, updateRow,
  DEFAULT_VIEWPORT,
} from './document';

describe('nowy dokument', () => {
  it('ma jeden pusty wiersz', () => {
    // Lista Desmosa nigdy nie jest pusta — zawsze czeka wiersz do wpisania.
    const doc = createPlotDocument();
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0].parsed.kind).toBe('blank');
  });

  it('ma domyślny widok −10…10 w obu osiach', () => {
    expect(createPlotDocument().viewport).toEqual(DEFAULT_VIEWPORT);
  });

  it('każdy wiersz dostaje własny identyfikator', () => {
    const doc = addRow(addRow(createPlotDocument(), 'y = x'), 'y = 2x');
    const ids = doc.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('zapis i odczyt', () => {
  it('przechodzi w obie strony bez zmiany treści', () => {
    const doc = addRow(addRow(createPlotDocument(), 'y = a \\sin(x)'), 'a = 2');
    const wrocil = parsePlotDocument(serializePlotDocument(doc));

    expect(wrocil.rows.map((r) => r.latex)).toEqual(doc.rows.map((r) => r.latex));
    expect(wrocil.viewport).toEqual(doc.viewport);
  });

  it('zapisuje wyrażenie, a nie wynik jego rozpoznania', () => {
    // Rodzaj wiersza jest pochodną zapisu. Gdyby leżał w pliku, dokument
    // trzymałby dwie prawdy, które przy zmianie parsera się rozjeżdżają.
    const doc = addRow(createPlotDocument(), 'y = x^2');
    const zapis = JSON.parse(serializePlotDocument(doc));

    expect(JSON.stringify(zapis)).toContain('y = x^2');
    expect(JSON.stringify(zapis)).not.toContain('explicit-y');
  });

  it('odtwarza rozpoznanie przy wczytaniu', () => {
    const wrocil = parsePlotDocument(serializePlotDocument(addRow(createPlotDocument(), 'x^2 + y^2 = 4')));
    expect(wrocil.rows[1].parsed.kind).toBe('implicit');
  });

  it('nie zapisuje ustawień pozostawionych domyślnymi', () => {
    // Inaczej każdy wykres wnosiłby do repozytorium trzydzieści linii, z których
    // żadna nic nie znaczy — a różnica w pliku przestałaby pokazywać zmianę.
    const zapis = serializePlotDocument(createPlotDocument());
    expect(zapis).not.toContain('minorGrid');
    expect(zapis).not.toContain('angleUnit');
  });

  it('zapisuje ustawienie zmienione względem domyślnego', () => {
    const doc = createPlotDocument();
    doc.settings.angleUnit = 'degrees';
    expect(serializePlotDocument(doc)).toContain('degrees');
  });

  it('pusty tekst daje nowy dokument, a nie wyjątek', () => {
    // Blok dopiero co wstawiony do notatki nie ma jeszcze treści.
    expect(parsePlotDocument('').rows).toHaveLength(1);
    expect(parsePlotDocument('   ').rows).toHaveLength(1);
  });

  it('uszkodzony zapis zgłasza uwagę i daje pusty dokument', () => {
    // Blok w markdownie bywa edytowany ręcznie; wyjątek wywróciłby cały
    // dokument, w którym wykres jest jednym z wielu elementów.
    const doc = parsePlotDocument('{to nie jest JSON');
    expect(doc.rows).toHaveLength(1);
    expect(doc.issues.length).toBeGreaterThan(0);
  });

  it('nieznana wersja formatu jest wczytywana z uwagą', () => {
    const doc = parsePlotDocument(JSON.stringify({ version: 99, rows: [{ latex: 'y = x' }] }));
    expect(doc.rows[0].latex).toBe('y = x');
    expect(doc.issues.join(' ')).toContain('wersj');
  });
});

describe('suwaki', () => {
  it('parametr definicji dostaje domyślny zakres', () => {
    // Suwak bez zakresu nie ma czego pokazać; Desmos przyjmuje −10…10.
    const doc = addRow(createPlotDocument(), 'a = 3');
    const wiersz = doc.rows[1];
    expect(wiersz.slider).toEqual({ min: -10, max: 10, step: 0.1 });
  });

  it('wykres nie dostaje suwaka', () => {
    expect(addRow(createPlotDocument(), 'y = x^2').rows[1].slider).toBeUndefined();
  });

  it('zakres suwaka przeżywa zapis i odczyt', () => {
    const doc = addRow(createPlotDocument(), 'a = 3');
    doc.rows[1].slider = { min: 0, max: 100, step: 1 };
    const wrocil = parsePlotDocument(serializePlotDocument(doc));
    expect(wrocil.rows[1].slider).toEqual({ min: 0, max: 100, step: 1 });
  });
});

describe('zmiana wiersza', () => {
  it('rozpoznaje wiersz na nowo po edycji', () => {
    const doc = addRow(createPlotDocument(), 'y = x');
    const zmieniony = updateRow(doc, doc.rows[1].id, 'a = 5');

    expect(zmieniony.rows[1].parsed.kind).toBe('constant');
    expect(zmieniony.rows[1].slider).toBeDefined();
  });

  it('zachowuje kolor wiersza przy edycji treści', () => {
    // Kolor jest wyborem autora, a nie własnością wyrażenia — zmiana wzoru
    // nie może przemalować krzywej.
    const doc = addRow(createPlotDocument(), 'y = x');
    const kolor = doc.rows[1].style.color;
    expect(updateRow(doc, doc.rows[1].id, 'y = 2x').rows[1].style.color).toBe(kolor);
  });

  it('kolejne wiersze dostają różne kolory', () => {
    const doc = addRow(addRow(createPlotDocument(), 'y = x'), 'y = 2x');
    expect(doc.rows[1].style.color).not.toBe(doc.rows[2].style.color);
  });
});
