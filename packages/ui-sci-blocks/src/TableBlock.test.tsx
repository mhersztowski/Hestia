import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TableBlock } from './TableBlock';

/**
 * Komórka tablicy jest takim samym tekstem jak akapit i podpis: bywa w niej
 * symbol matematyczny. Podręcznik podpisuje kolumny `θ` i `sinθ`, więc komórka
 * musi iść przez ten sam renderer, co reszta dokumentu — inaczej czytelnik
 * zobaczy w nagłówku dolary.
 */
describe('tablica w czytniku', () => {
  const kod = [
    '| $\\theta$ | $\\sin\\theta$ | Różnica w % |',
    '|---|---|---|',
    '| 0° = 0,00000 rad | 0,00000 | 0,00 |',
    '| 2° = 0,03491 rad | 0,03490 | 0,03 |',
    '@caption **Na przykład:** wartości $\\sin\\theta$ dla małych kątów',
  ].join('\n');

  it('matematyka w nagłówku i w komórkach się składa', () => {
    const { container } = render(<TableBlock id="t1" code={kod} />);
    expect(container.textContent).not.toContain('$');
    expect(container.querySelectorAll('th .katex').length).toBe(2);
  });

  it('podpis dalej działa i niesie wyróżnienia', () => {
    const { container } = render(<TableBlock id="t1" code={kod} />);
    expect(container.querySelector('figcaption strong')?.textContent).toBe('Na przykład:');
  });

  it('treść komórek zostaje nietknięta', () => {
    const { container } = render(<TableBlock id="t1" code={kod} />);
    const wiersze = [...container.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));
    expect(wiersze).toEqual([
      ['0° = 0,00000 rad', '0,00000', '0,00'],
      ['2° = 0,03491 rad', '0,03490', '0,03'],
    ]);
  });

  it('kotwica odsyłacza jest na miejscu', () => {
    const { container } = render(<TableBlock id="rh1-15-tab1" code={kod} />);
    expect(container.querySelector('#ref-rh1-15-tab1')).toBeTruthy();
  });
});
