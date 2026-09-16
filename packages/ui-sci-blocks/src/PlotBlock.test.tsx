/**
 * Testy bloku wykresu w dokumencie.
 *
 * Blok jest tym, co odróżnia kalkulator od zabawki: wykres ma wrócić do notatki
 * w postaci, którą da się otworzyć jutro. Sprawdzamy więc drogę tam i z powrotem
 * oraz to, czego zapisywać nie wolno — bo najgorszy błąd tej warstwy to notatka
 * zapisująca się przy każdym drgnięciu myszy.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  addRow,
  createPlotDocument,
  serializePlotDocument,
  parsePlotDocument,
} from '@hestia/core-sci';
import { PlotBlock } from './PlotBlock';
import { registerSciBlocks, PLOT_LANG } from './register';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 400 });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    lineJoin: '',
    lineCap: '',
  })) as never;
});

describe('infostring', () => {
  it('rozpoznaje `sci-plot` z etykietą i bez', () => {
    expect(PLOT_LANG.test('sci-plot')).toBe(true);
    expect(PLOT_LANG.test('sci-plot:parabola')).toBe(true);
  });

  it('nie łapie cudzych bloków', () => {
    // `sim` i `formula` mają własne renderery; pomyłka tutaj podmieniłaby
    // wykresy w wykładach na kalkulator.
    expect(PLOT_LANG.test('sim')).toBe(false);
    expect(PLOT_LANG.test('formula:rh1-7-eq1')).toBe(false);
    expect(PLOT_LANG.test('sci-plotter')).toBe(false);
  });

  it('jest zarejestrowany wśród bloków sci', () => {
    const zarejestrowane: string[] = [];
    registerSciBlocks((renderer) => {
      zarejestrowane.push(renderer.name);
      return () => {};
    });
    expect(zarejestrowane).toContain('sci-plot');
  });
});

describe('wczytywanie', () => {
  it('pusta treść daje nowy kalkulator', () => {
    // Blok dopiero wstawiony do notatki nie ma jeszcze treści.
    render(<PlotBlock code="" />);
    expect(screen.getByText('wpisz wyrażenie…')).toBeTruthy();
  });

  it('wczytuje zapisane wyrażenia', () => {
    const doc = addRow(addRow(createPlotDocument(), 'a = 2'), 'y = a x');
    render(<PlotBlock code={serializePlotDocument(doc)} />);

    expect(screen.getByLabelText('suwak a')).toBeTruthy();
    expect(screen.getByLabelText('Ukryj wiersz 3')).toBeTruthy();
  });

  it('uszkodzony zapis pokazuje uwagę i pusty kalkulator', () => {
    /*
     * Blok w markdownie bywa edytowany ręcznie, a wykres jest jednym z wielu
     * elementów dokumentu — wyjątek wywróciłby całą notatkę zamiast jednego
     * bloku.
     */
    render(<PlotBlock code="{to nie jest JSON" />);
    expect(screen.getByText(/Nie umiem odczytać zapisu wykresu/)).toBeTruthy();
    expect(screen.getByText('wpisz wyrażenie…')).toBeTruthy();
  });
});

describe('zapis', () => {
  it('zmiana treści wraca jako JSON gotowy do wklejenia', () => {
    const onChange = vi.fn();
    render(<PlotBlock code="" onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Dodaj wyrażenie'));
    const zapis = onChange.mock.calls[0][0] as string;
    expect(() => JSON.parse(zapis)).not.toThrow();
    expect(parsePlotDocument(zapis).rows).toHaveLength(2);
  });

  it('ruch suwaka nie zapisuje bloku', () => {
    // Najgorszy błąd tej warstwy: notatka zapisująca się przy każdym drgnięciu.
    const onChange = vi.fn();
    const doc = addRow(createPlotDocument(), 'a = 2');
    render(<PlotBlock code={serializePlotDocument(doc)} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('suwak a'), { target: { value: '5' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('bez `onChange` kalkulator działa, ale niczego nie zapisuje', () => {
    // Tryb czytania: `ReaderView` i eksport statyczny nie dają zapisu.
    const doc = addRow(createPlotDocument(), 'a = 2');
    render(<PlotBlock code={serializePlotDocument(doc)} />);

    fireEvent.change(screen.getByLabelText('suwak a'), { target: { value: '5' } });
    expect((screen.getByLabelText('suwak a') as HTMLInputElement).value).toBe('5');
  });

  it('droga tam i z powrotem zachowuje wyrażenia', () => {
    const onChange = vi.fn();
    const doc = addRow(createPlotDocument(), 'y = x^2');
    render(<PlotBlock code={serializePlotDocument(doc)} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Dodaj wyrażenie'));
    const wrocil = parsePlotDocument(onChange.mock.calls[0][0]);
    expect(wrocil.rows.map((r) => r.latex)).toContain('y = x^2');
  });
});
