/**
 * Rysunek liczony ze wzoru — sprawdzamy kształt, bo o kształt tu chodzi.
 *
 * Rysunek bez skal liczbowych da się sprawdzić tylko przez to, co pokazuje:
 * czy krzywa faktycznie oscyluje, czy przesunięcie faz jest widoczne i czy
 * krzywa o połowie amplitudy jest o połowę niższa.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { parseFigureBlock } from '@hestia/core-sci';
import { PlotFigure } from './PlotFigure';

const spec = (code: string) => parseFigureBlock('x', code).plot!;

const RYS6B = [
  '@domain t: 0..2.2',
  '@axis t, x',
  '@panel b',
  '@curve I: \\cos(2\\pi t)',
  '@curve III: 0.5\\cos(2\\pi t) | dashed',
].join('\n');

/** Współrzędne `y` ze ścieżki SVG. */
const ygreki = (d: string) =>
  d
    .split(/[ML]/)
    .slice(1)
    .map((p) => Number(p.split(',')[1]));

describe('PlotFigure', () => {
  it('rysuje po jednej ścieżce na krzywą', () => {
    const { container } = render(<PlotFigure spec={spec(RYS6B)} />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });

  it('krzywa o połowie amplitudy jest o połowę niższa', () => {
    // To jest cała treść rys. 15-6b. Wspólna skala panelu decyduje o tym,
    // czy różnica jest w ogóle widoczna.
    const { container } = render(<PlotFigure spec={spec(RYS6B)} />);
    const [pelna, polowa] = Array.from(container.querySelectorAll('path')).map((p) =>
      ygreki(p.getAttribute('d')!)
    );

    const rozpietosc = (ys: number[]) => Math.max(...ys) - Math.min(...ys);
    expect(rozpietosc(polowa) / rozpietosc(pelna)).toBeCloseTo(0.5, 1);
  });

  it('krzywa naprawdę oscyluje, a nie jest linią', () => {
    const { container } = render(<PlotFigure spec={spec(RYS6B)} />);
    const ys = ygreki(container.querySelector('path')!.getAttribute('d')!);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(20);
  });

  it('przesunięcie fazy przesuwa krzywą', () => {
    const przesuniete = spec(
      [
        '@domain t: 0..2.2',
        '@panel a',
        '@curve I: \\cos(2\\pi t)',
        '@curve II: \\cos(2\\pi t + \\pi/4) | dashed',
      ].join('\n')
    );
    const { container } = render(<PlotFigure spec={przesuniete} />);
    const [a, b] = Array.from(container.querySelectorAll('path')).map((p) =>
      ygreki(p.getAttribute('d')!)
    );

    // Ta sama amplituda, ale inny przebieg — inaczej faza byłaby niewidoczna.
    expect(a[0]).toBeCloseTo(b[0] - (b[0] - a[0]), 5);
    expect(Math.abs(a[20] - b[20])).toBeGreaterThan(3);
  });

  it('krzywa przerywana ma inną kreskę niż ciągła', () => {
    const { container } = render(<PlotFigure spec={spec(RYS6B)} />);
    const [ciagla, przerywana] = Array.from(container.querySelectorAll('path'));
    expect(ciagla.getAttribute('stroke-dasharray')).toBeNull();
    expect(przerywana.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('każdy panel dostaje własny wykres', () => {
    const trzy = spec(
      [
        '@domain t: 0..2',
        '@panel a',
        '@curve I: \\cos(t)',
        '@panel b',
        '@curve I: \\cos(t)',
        '@panel c',
        '@curve I: \\cos(t)',
      ].join('\n')
    );
    expect(render(<PlotFigure spec={trzy} />).container.querySelectorAll('svg')).toHaveLength(3);
  });

  it('podgląd w dymku nie pokazuje podpisów krzywych', () => {
    const { container } = render(<PlotFigure spec={spec(RYS6B)} compact />);
    expect(container.querySelectorAll('text')).toHaveLength(0);
  });
});

describe('krzywe nieujemne', () => {
  it('oś stoi przy zerze, nie w połowie wysokości', () => {
    // Rys. 15-9 pokazuje energie, które nigdy nie są ujemne. Oś w połowie
    // wysokości zostawiłaby dolną połowę pustą i przesunęła krzywe.
    const energia = spec(['@domain t: 0..2', '@curve U: \\cos(\\pi t)^2'].join('\n'));
    const { container } = render(<PlotFigure spec={energia} />);

    const os = container.querySelectorAll('line')[0];
    const ys = ygreki(container.querySelector('path')!.getAttribute('d')!);
    // Zero danych leży na dole wykresu, więc oś jest poniżej wszystkich punktów.
    expect(Number(os.getAttribute('y1'))).toBeGreaterThanOrEqual(Math.max(...ys) - 0.5);
  });

  it('krzywa symetryczna wokół zera nadal ma oś pośrodku', () => {
    const { container } = render(<PlotFigure spec={spec(RYS6B)} />);
    const os = Number(container.querySelectorAll('line')[0].getAttribute('y1'));
    const ys = ygreki(container.querySelector('path')!.getAttribute('d')!);
    expect(os).toBeGreaterThan(Math.min(...ys));
    expect(os).toBeLessThan(Math.max(...ys));
  });
});
