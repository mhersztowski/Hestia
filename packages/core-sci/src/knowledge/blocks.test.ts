/**
 * Rysunek i tablica jako **bloki z identyfikatorem**.
 *
 * Podręcznik odsyła do rysunków i tablic tak samo gęsto jak do wzorów („na
 * rysunku 15-1a widzimy", „patrz tablica 15-2"). Dopóki rysunek jest luźnym
 * `![…](…)` w tekście, nie ma do czego zrobić odsyłacza — nie ma identyfikatora.
 *
 * Blok niesie to, co dokument i tak pokazuje, więc **dymek odsyłacza rysuje to
 * samo, co treść**. Gdyby podgląd miał własne źródło, obie wersje zaczęłyby się
 * rozjeżdżać przy pierwszej poprawce.
 */
import { describe, it, expect } from 'vitest';
import { parseFigureBlock, parseTableBlock } from './blocks';

describe('parseFigureBlock', () => {
  const RYSUNEK = [
    '![Rys. 15-1](data:image/png;base64,AAA=)',
    '@caption **Rys. 15-1.** (a) Punkt materialny o masie *m*.',
    '@panels a, b, c',
  ].join('\n');

  it('czyta obraz, podpis i panele', () => {
    const r = parseFigureBlock('rh1-15-rys1', RYSUNEK);
    expect(r.image).toBe('data:image/png;base64,AAA=');
    expect(r.caption).toBe('**Rys. 15-1.** (a) Punkt materialny o masie *m*.');
    expect(r.panels).toEqual(['a', 'b', 'c']);
  });

  it('rozpoznaje rysunek liczony kodem', () => {
    // Od 15-3 rysunki wynikające ze wzoru rysujemy kodem. Ten sam blok ma je
    // unieść, żeby odsyłacz i dymek nie potrzebowały drugiego mechanizmu.
    const r = parseFigureBlock('rh1-15-rys3', 'oscylator(k, x)\n@caption **Rys. 15-3.** Parabola.');
    expect(r.image).toBeUndefined();
    expect(r.script).toBe('oscylator(k, x)');
  });

  it('podpis w kilku wierszach skleja się w jeden', () => {
    const r = parseFigureBlock('x', [
      '![R](data:image/png;base64,A=)',
      '@caption **Rys. 15-2.** Całkowita energia mechaniczna',
      '  dla ruchu z rys. 15-1.',
    ].join('\n'));
    expect(r.caption).toBe('**Rys. 15-2.** Całkowita energia mechaniczna dla ruchu z rys. 15-1.');
  });

  it('rysunek bez treści zgłasza problem', () => {
    expect(parseFigureBlock('pusty', '@caption Sam podpis.').issues).toHaveLength(1);
  });

  it('odrzuca źródło obrazu z protokołem skryptu', () => {
    // Dokument bazy bywa cudzy; `src` to jedyne miejsce, gdzie treść trafia
    // wprost do atrybutu DOM.
    const r = parseFigureBlock('zly', '![z](javascript:alert(1))\n@caption X.');
    expect(r.image).toBeUndefined();
    expect(r.issues.some((i) => /źródł/i.test(i.message))).toBe(true);
  });
});

describe('parseTableBlock', () => {
  const TABLICA = [
    '@caption **Tablica 15-1.** Okresy drgań.',
    '| ciało | okres |',
    '|---|---|',
    '| wahadło | 2 s |',
  ].join('\n');

  it('czyta podpis i wiersze', () => {
    const t = parseTableBlock('rh1-15-tab1', TABLICA);
    expect(t.caption).toBe('**Tablica 15-1.** Okresy drgań.');
    expect(t.rows).toHaveLength(2);              // nagłówek + jeden wiersz danych
    expect(t.rows[0]).toEqual(['ciało', 'okres']);
    expect(t.rows[1]).toEqual(['wahadło', '2 s']);
  });

  it('wiersz oddzielający nie jest danymi', () => {
    expect(parseTableBlock('t', TABLICA).rows.some((r) => r.join('').includes('---'))).toBe(false);
  });

  it('tablica bez wierszy zgłasza problem', () => {
    expect(parseTableBlock('pusta', '@caption Sam podpis.').issues).toHaveLength(1);
  });
});
