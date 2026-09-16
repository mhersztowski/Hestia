/**
 * Testy rysowania dokumentu.
 *
 * Matematyka jest sprawdzona w `sci-core`; tutaj chodzi o to, co widać na
 * płótnie: czy krzywa w ogóle powstaje, czy ukryty wiersz znika, czy prosta
 * pionowa (`x = 3`) jest rysowana — a nie gubiona, bo po osi x ma tylko jedną
 * wartość.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { addRow, createPlotDocument, type PlotDocument } from '@hestia/core-sci';
import { PlotView } from './PlotView';

/** Kontekst 2D zapisujący, co zostało narysowane. */
function zapisujacyKontekst() {
  const sciezki: Array<Array<[number, number]>> = [];
  const kola: Array<[number, number]> = [];
  const prostokaty: Array<[number, number, number, number]> = [];
  let biezaca: Array<[number, number]> = [];

  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      // Tło płótna to jeden prostokąt na cały obszar — nie liczy się jako
      // wypełnienie obszaru nierówności.
      if (w < 390) prostokaty.push([x, y, w, h]);
    }),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(() => {
      biezaca = [];
    }),
    moveTo: vi.fn((x: number, y: number) => {
      biezaca.push([x, y]);
    }),
    lineTo: vi.fn((x: number, y: number) => {
      biezaca.push([x, y]);
    }),
    stroke: vi.fn(() => {
      if (biezaca.length > 1) sciezki.push([...biezaca]);
    }),
    arc: vi.fn((x: number, y: number) => {
      kola.push([x, y]);
    }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    lineJoin: '',
    lineCap: '',
    globalAlpha: 1,
  };
  return { ctx, sciezki, kola, prostokaty };
}

let biezacy: ReturnType<typeof zapisujacyKontekst>;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 400 });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => biezacy.ctx) as never;
});

/** Renderuje dokument i oddaje to, co trafiło na płótno. */
function narysuj(doc: PlotDocument) {
  biezacy = zapisujacyKontekst();
  render(<PlotView document={doc} onViewportChange={vi.fn()} />);
  return biezacy;
}

/**
 * Ścieżki krzywych, czyli wszystko poza siatką.
 *
 * Siatka to odcinki dokładnie pionowe albo poziome, rysowane od krawędzi do
 * krawędzi; krzywa ma punkty pośrednie.
 */
function krzywe(sciezki: Array<Array<[number, number]>>) {
  return sciezki.filter((p) => p.length > 2);
}

describe('rysowanie krzywych', () => {
  it('funkcja daje ścieżkę na płótnie', () => {
    const { sciezki } = narysuj(addRow(createPlotDocument(), 'y = x'));
    expect(krzywe(sciezki).length).toBeGreaterThan(0);
  });

  it('pusty dokument rysuje samą siatkę', () => {
    const { sciezki } = narysuj(createPlotDocument());
    expect(krzywe(sciezki)).toHaveLength(0);
  });

  it('ukryty wiersz nie jest rysowany', () => {
    const doc = addRow(createPlotDocument(), 'y = x');
    const ukryty = { ...doc, rows: doc.rows.map((r) => ({ ...r, hidden: true })) };
    expect(krzywe(narysuj(ukryty).sciezki)).toHaveLength(0);
  });

  it('dwie krzywe dają dwie ścieżki', () => {
    const doc = addRow(addRow(createPlotDocument(), 'y = x'), 'y = -x');
    expect(krzywe(narysuj(doc).sciezki).length).toBeGreaterThanOrEqual(2);
  });

  it('prosta pionowa też powstaje', () => {
    /*
     * `x = 3` po osi x ma jedną wartość, więc próbkowanie po x dałoby jeden
     * punkt i nic by nie narysowało. Ten wiersz musi być próbkowany po y.
     */
    const { sciezki } = narysuj(addRow(createPlotDocument(), 'x = 3'));
    const pionowe = krzywe(sciezki).filter((p) => {
      const xs = p.map(([x]) => x);
      return Math.max(...xs) - Math.min(...xs) < 1;
    });
    expect(pionowe.length).toBeGreaterThan(0);
  });

  it('punkt jest rysowany jako kółko, nie ścieżka', () => {
    const { kola } = narysuj(addRow(createPlotDocument(), '(2, 3)'));
    expect(kola).toHaveLength(1);
    // Środek widoku to (0,0) na płótnie 400×400, więc (2,3) leży w prawym
    // górnym ćwiartkowaniu — na prawo i powyżej środka.
    expect(kola[0][0]).toBeGreaterThan(200);
    expect(kola[0][1]).toBeLessThan(200);
  });

  it('asymptota dzieli krzywą na osobne ścieżki', () => {
    // Bez podziału `1/x` byłoby jedną ścieżką z pionową kreską przez zero.
    const { sciezki } = narysuj(addRow(createPlotDocument(), 'y = \\frac{1}{x}'));
    expect(krzywe(sciezki).length).toBeGreaterThanOrEqual(2);
  });

  it('wiersz z błędem nie przerywa rysowania pozostałych', () => {
    // Jedna literówka nie może zostawić pustego ekranu.
    const doc = addRow(addRow(createPlotDocument(), '\\frac{1}{'), 'y = x');
    expect(krzywe(narysuj(doc).sciezki).length).toBeGreaterThan(0);
  });
});

describe('parametry', () => {
  it('wartość z suwaka zmienia kształt krzywej', () => {
    const doc = addRow(addRow(createPlotDocument(), 'a = 1'), 'y = a x');

    biezacy = zapisujacyKontekst();
    render(<PlotView document={doc} onViewportChange={vi.fn()} parameters={{ a: 1 }} />);
    const przy1 = krzywe(biezacy.sciezki)[0];

    biezacy = zapisujacyKontekst();
    render(<PlotView document={doc} onViewportChange={vi.fn()} parameters={{ a: 5 }} />);
    const przy5 = krzywe(biezacy.sciezki)[0];

    // Ta sama współrzędna x, inna wysokość na płótnie.
    expect(przy1[10][1]).not.toBeCloseTo(przy5[10][1], 1);
  });
});

describe('krzywe uwikłane', () => {
  /** Odcinki konturu: krótkie, dwupunktowe — inaczej niż długie ścieżki krzywych. */
  function odcinki(sciezki: Array<Array<[number, number]>>) {
    return sciezki.filter((p) => p.length === 2);
  }

  it('okrąg powstaje jako zbiór odcinków', () => {
    // `marchImplicit` daje kontur w kawałkach, nie jedną ścieżkę — krzywa
    // uwikłana nie ma naturalnej kolejności punktów.
    const { ctx, sciezki } = (() => {
      biezacy = zapisujacyKontekst();
      render(
        <PlotView
          document={addRow(createPlotDocument(), 'x^2 + y^2 = 4')}
          onViewportChange={vi.fn()}
        />
      );
      return biezacy;
    })();
    void ctx;
    expect(odcinki(sciezki).length + krzywe(sciezki).length).toBeGreaterThan(0);
  });

  it('nierówność wypełnia obszar', () => {
    const { prostokaty } = narysuj(addRow(createPlotDocument(), 'x^2 + y^2 < 4'));
    expect(prostokaty.length).toBeGreaterThan(10);
  });

  it('równanie nie wypełnia niczego', () => {
    // Krzywa ma zerową grubość; wypełnienie znaczyłoby, że rysujemy nierówność.
    const { prostokaty } = narysuj(addRow(createPlotDocument(), 'x^2 + y^2 = 4'));
    expect(prostokaty).toHaveLength(0);
  });

  it('obszar leży wokół środka płótna dla koła w zerze', () => {
    // Środek widoku to (0,0); wnętrze koła musi otaczać środek płótna, a nie
    // trzymać się krawędzi.
    const { prostokaty } = narysuj(addRow(createPlotDocument(), 'x^2 + y^2 < 4'));
    const srodkowe = prostokaty.filter(
      ([x, y]) => Math.abs(x - 200) < 60 && Math.abs(y - 200) < 60
    );
    expect(srodkowe.length).toBeGreaterThan(0);
  });
});
