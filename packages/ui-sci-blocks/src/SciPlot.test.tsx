/**
 * Testy kalkulatora: lista wyrażeń i jej związek z wykresem.
 *
 * Matematyka jest sprawdzona w `sci-core`, rysowanie w `PlotView`. Tutaj chodzi
 * o obsługę: czy da się dodać i skasować wiersz, czy ukrycie działa, czy suwak
 * przerysowuje wykres **nie brudząc zapisu**, i czy błąd w jednym wierszu jest
 * widoczny zamiast wywracać panel.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { addRow, createPlotDocument, serializePlotDocument } from '@hestia/core-sci';
import { SciPlot } from './SciPlot';

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

describe('lista wyrażeń', () => {
  it('nowy kalkulator ma jeden pusty wiersz', () => {
    render(<SciPlot />);
    expect(screen.getByText('wpisz wyrażenie…')).toBeTruthy();
  });

  it('przycisk plus dodaje wiersz', () => {
    const onDocumentChange = vi.fn();
    render(<SciPlot onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByLabelText('Dodaj wyrażenie'));
    expect(onDocumentChange).toHaveBeenCalled();
    expect(onDocumentChange.mock.calls[0][0].rows).toHaveLength(2);
  });

  it('krzyżyk usuwa wiersz', () => {
    const onDocumentChange = vi.fn();
    const doc = addRow(createPlotDocument(), 'y = x');
    render(<SciPlot initialDocument={doc} onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByLabelText('Usuń wiersz 2'));
    expect(onDocumentChange.mock.calls[0][0].rows).toHaveLength(1);
  });

  it('usunięcie ostatniego wiersza zostawia pusty, a nie pustkę', () => {
    // Lista bez ani jednego wiersza nie ma miejsca, w które można kliknąć.
    const onDocumentChange = vi.fn();
    render(<SciPlot onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByLabelText('Usuń wiersz 1'));
    expect(onDocumentChange.mock.calls[0][0].rows).toHaveLength(1);
  });

  it('wiersze są numerowane od jedynki', () => {
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'y = x')} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });
});

describe('ukrywanie', () => {
  it('kolorowa ikonka ukrywa krzywą, nie kasuje wiersza', () => {
    /*
     * To najczęstsza operacja przy porównywaniu kilku funkcji: schowaj jedną,
     * popatrz na resztę, przywróć. Skasowanie wiersza zamiast ukrycia byłoby
     * utratą wzoru.
     */
    const onDocumentChange = vi.fn();
    const doc = addRow(createPlotDocument(), 'y = x');
    render(<SciPlot initialDocument={doc} onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByLabelText('Ukryj wiersz 2'));
    const next = onDocumentChange.mock.calls[0][0];
    expect(next.rows).toHaveLength(2);
    expect(next.rows[1].hidden).toBe(true);
  });
});

describe('suwaki', () => {
  it('definicja stałej dostaje suwak', () => {
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'a = 2')} />);
    expect(screen.getByLabelText('suwak a')).toBeTruthy();
  });

  it('wykres nie dostaje suwaka', () => {
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'y = x^2')} />);
    expect(screen.queryByLabelText(/suwak/)).toBeNull();
  });

  it('suwak startuje z wartości policzonej z zapisu', () => {
    // Bez tego pierwsze przesunięcie skakałoby z zera do miejsca kliknięcia.
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'a = 7')} />);
    expect((screen.getByLabelText('suwak a') as HTMLInputElement).value).toBe('7');
  });

  it('przesunięcie suwaka nie zapisuje dokumentu', () => {
    /*
     * Ruch suwaka ma przerysować wykres, ale nie zmieniać zapisu — inaczej
     * każde drgnięcie palcem brudziłoby notatkę i zapełniało historię zmian.
     */
    const onDocumentChange = vi.fn();
    render(
      <SciPlot
        initialDocument={addRow(createPlotDocument(), 'a = 2')}
        onDocumentChange={onDocumentChange}
      />
    );

    fireEvent.change(screen.getByLabelText('suwak a'), { target: { value: '5' } });
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it('przesunięcie suwaka zmienia pokazywaną wartość', () => {
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'a = 2')} />);
    fireEvent.change(screen.getByLabelText('suwak a'), { target: { value: '5' } });
    expect(screen.getByText(/a = 5/)).toBeTruthy();
  });
});

describe('błędy', () => {
  it('uwaga o brakującym parametrze jest widoczna przy wierszu', () => {
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'y = q x')} />);
    expect(screen.getByText(/Nie znam wartości: q/)).toBeTruthy();
  });

  it('niezrozumiały zapis nie wywraca panelu', () => {
    const doc = addRow(addRow(createPlotDocument(), '\\frac{1}{'), 'y = x');
    expect(() => render(<SciPlot initialDocument={doc} />)).not.toThrow();
    // Poprawny wiersz obok błędnego nadal ma swój numer i ikonkę.
    expect(screen.getByLabelText('Ukryj wiersz 3')).toBeTruthy();
  });
});

describe('zapis', () => {
  it('zmiana treści wraca na zewnątrz w postaci do zapisania', () => {
    const onDocumentChange = vi.fn();
    render(<SciPlot onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByLabelText('Dodaj wyrażenie'));
    const zapis = serializePlotDocument(onDocumentChange.mock.calls[0][0]);
    expect(JSON.parse(zapis).version).toBe(1);
  });
});

describe('animacja suwaka', () => {
  /** Pętla klatek pod kontrolą testu — inaczej sprawdzalibyśmy zegar przeglądarki. */
  function przejmijKlatki() {
    const kolejka: FrameRequestCallback[] = [];
    let czas = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      kolejka.push(cb);
      return kolejka.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    return {
      /** Wykonuje jedną klatkę po zadanym czasie. */
      klatka(ms = 50) {
        czas += ms;
        const next = kolejka.shift();
        next?.(czas);
      },
      get oczekujace() {
        return kolejka.length;
      },
    };
  }

  it('przycisk animacji jest przy suwaku', () => {
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'a = 2')} />);
    expect(screen.getByLabelText('Animuj a')).toBeTruthy();
  });

  it('wykres nie dostaje przycisku animacji', () => {
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'y = x^2')} />);
    expect(screen.queryByLabelText(/Animuj/)).toBeNull();
  });

  it('włączenie animacji zmienia wartość parametru', () => {
    const klatki = przejmijKlatki();
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'a = 0')} />);

    fireEvent.click(screen.getByLabelText('Animuj a'));
    // Pierwsza klatka tylko ustawia punkt odniesienia czasu; ruch zaczyna się
    // od drugiej.
    act(() => {
      klatki.klatka(0);
      klatki.klatka(100);
    });

    /*
     * Wartość czytamy z suwaka, nie z tekstu: KaTeX składa wzór wiersza
     * (`a = 0`) w osobnym elemencie, więc selektor tekstowy trafiałby w dwa
     * miejsca naraz.
     *
     * Zakres domyślny to −10…10, prędkość to jego czwarta część na sekundę,
     * więc po 100 ms wartość musi odejść od startowej.
     */
    expect(Number((screen.getByLabelText('suwak a') as HTMLInputElement).value)).not.toBe(0);
    vi.unstubAllGlobals();
  });

  it('ponowne kliknięcie zatrzymuje pętlę', () => {
    const klatki = przejmijKlatki();
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'a = 0')} />);

    fireEvent.click(screen.getByLabelText('Animuj a'));
    act(() => klatki.klatka(50));
    fireEvent.click(screen.getByLabelText('Zatrzymaj a'));

    const suwak = () => (screen.getByLabelText('suwak a') as HTMLInputElement).value;
    const przed = suwak();
    act(() => klatki.klatka(500));
    expect(suwak()).toBe(przed);
    vi.unstubAllGlobals();
  });

  it('chwyt za suwak zatrzymuje animację', () => {
    // Inaczej wartość wyrywałaby się spod palca przy każdej klatce.
    const klatki = przejmijKlatki();
    render(<SciPlot initialDocument={addRow(createPlotDocument(), 'a = 0')} />);

    fireEvent.click(screen.getByLabelText('Animuj a'));
    fireEvent.change(screen.getByLabelText('suwak a'), { target: { value: '3' } });

    expect(screen.getByLabelText('Animuj a')).toBeTruthy();
    act(() => klatki.klatka(500));
    expect((screen.getByLabelText('suwak a') as HTMLInputElement).value).toBe('3');
    vi.unstubAllGlobals();
  });

  it('animacja nie zapisuje dokumentu', () => {
    // Ruch parametru to podgląd, nie zmiana treści notatki.
    const klatki = przejmijKlatki();
    const onDocumentChange = vi.fn();
    render(
      <SciPlot
        initialDocument={addRow(createPlotDocument(), 'a = 0')}
        onDocumentChange={onDocumentChange}
      />
    );

    fireEvent.click(screen.getByLabelText('Animuj a'));
    act(() => {
      klatki.klatka(50);
      klatki.klatka(50);
    });

    expect(onDocumentChange).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('zakres suwaka', () => {
  it('da się zmienić i trafia do dokumentu', () => {
    // Zakres jest własnością wiersza, nie chwilowym stanem podglądu — więc
    // w odróżnieniu od wartości musi wrócić do zapisu.
    const onDocumentChange = vi.fn();
    render(
      <SciPlot
        initialDocument={addRow(createPlotDocument(), 'a = 2')}
        onDocumentChange={onDocumentChange}
      />
    );

    fireEvent.click(screen.getByLabelText('Zakres suwaka a'));
    fireEvent.change(screen.getByLabelText('do suwaka a'), { target: { value: '100' } });

    expect(onDocumentChange.mock.calls[0][0].rows[1].slider.max).toBe(100);
  });
});
