/**
 * Szerokość rysunku w widoku i w pasku edycji.
 *
 * Dwie rzeczy naraz: rysunek ma zajmować tyle miejsca, ile mówi blok, a autor
 * ma móc to zmienić bez wchodzenia w kod. Kontrolka pojawia się **tylko wtedy,
 * gdy host potrafi zapisać** — w trybie czytania i w eksporcie statycznym
 * nie ma czego zapisywać, więc nie ma też czym mylić.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FigureBlock } from './FigureBlock';

const OBRAZ = 'data:image/png;base64,iVBORw0KGgo=';
const KOD = (extra: string[]) => [`![Rys.](${OBRAZ})`, '@caption Podpis.', ...extra].join('\n');

describe('szerokość w widoku', () => {
  it('bez dyrektywy rysunek nie ma narzuconej szerokości', () => {
    render(<FigureBlock id="15-1" code={KOD([])} />);
    expect((screen.getByRole('img') as HTMLImageElement).style.width).toBe('');
  });

  it('z dyrektywą rysunek dostaje zadaną szerokość', () => {
    render(<FigureBlock id="15-1" code={KOD(['@width 60%'])} />);
    expect((screen.getByRole('img') as HTMLImageElement).style.width).toBe('60%');
  });

  it('w podglądzie odsyłacza szerokość z bloku nie obowiązuje', () => {
    // Dymek ma własne ograniczenia — rysunek szeroki na 100 % kolumny wypchnąłby
    // go poza ekran telefonu.
    render(<FigureBlock id="15-1" code={KOD(['@width 100%'])} compact />);
    expect((screen.getByRole('img') as HTMLImageElement).style.maxHeight).toBe('220px');
  });
});

describe('zmiana szerokości', () => {
  it('bez możliwości zapisu nie ma kontrolki', () => {
    render(<FigureBlock id="15-1" code={KOD([])} />);
    expect(screen.queryByLabelText(/szerokość/i)).toBeNull();
  });

  it('z możliwością zapisu kontrolka jest', () => {
    render(<FigureBlock id="15-1" code={KOD([])} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/szerokość/i)).toBeTruthy();
  });

  it('zapisuje zmienioną szerokość do treści bloku', () => {
    const onChange = vi.fn();
    render(<FigureBlock id="15-1" code={KOD([])} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/szerokość/i), { target: { value: '40' } });

    expect(onChange).toHaveBeenCalled();
    const zapisane = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string;
    expect(zapisane).toContain('@width 40%');
    // Podpis i obraz zostają nietknięte.
    expect(zapisane).toContain('@caption Podpis.');
    expect(zapisane).toContain('![Rys.]');
  });

  it('pełna szerokość usuwa dyrektywę zamiast zapisywać 100 %', () => {
    const onChange = vi.fn();
    render(<FigureBlock id="15-1" code={KOD(['@width 50%'])} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/szerokość/i), { target: { value: '100' } });

    const zapisane = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string;
    expect(zapisane).not.toContain('@width');
  });

  it('pokazuje obecną wartość, a nie domyślną', () => {
    render(<FigureBlock id="15-1" code={KOD(['@width 35%'])} onChange={vi.fn()} />);
    expect((screen.getByLabelText(/szerokość/i) as HTMLInputElement).value).toBe('35');
  });

  it('szerokość w pikselach pokazuje wprost, bo nie da się jej wyrazić w procentach', () => {
    render(<FigureBlock id="15-1" code={KOD(['@width 420px'])} onChange={vi.fn()} />);
    expect(screen.getByText(/420px/)).toBeTruthy();
  });
});
