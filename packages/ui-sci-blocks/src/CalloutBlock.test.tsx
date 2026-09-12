import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CalloutBlock } from './CalloutBlock';
import { ReaderView } from './ReaderView';
import { splitDocument } from './ReaderView';

const NOTKA = [
  '```callout:rh1-nota-glaser',
  '@kind device',
  'Komora pęcherzykowa',
  '@body Zbudował ją Donald Glaser w 1952 roku; za ten pomysł dostał',
  '  Nagrodę Nobla w 1960.',
  '@source 3-1, s. 43',
  '```',
].join('\n');

describe('notka kontekstowa w czytniku', () => {
  it('jest osobnym rodzajem bloku, nie kodem', () => {
    const [segment] = splitDocument(NOTKA);
    expect(segment.kind).toBe('callout');
    expect((segment as { id: string }).id).toBe('rh1-nota-glaser');
  });

  it('pokazuje tytuł, treść i rodzaj', () => {
    const { container } = render(<CalloutBlock id="rh1-nota-glaser" code={NOTKA.split('\n').slice(1, -1).join('\n')} />);
    const t = container.textContent ?? '';
    expect(t).toContain('Komora pęcherzykowa');
    expect(t).toContain('Donald Glaser');
    expect(t).toContain('Urządzenie i doświadczenie');
  });

  /**
   * Cała reszta bazy jest przepisaną książką i da się ją sprawdzić ze skanem.
   * Notki w skanie nie ma, więc jedyne, co odróżnia ją od Resnicka, to ten
   * podpis — bez niego znika gwarancja „wiadomo, co jest czyje".
   */
  it('mówi wprost, że nie pochodzi z książki', () => {
    const { container } = render(<CalloutBlock id="x" code={'@kind law\nPrawo\n@body Treść.'} />);
    expect(container.textContent).toContain('poza książką');
  });

  it('treść łamana na wiersze skleja się z powrotem', () => {
    const { container } = render(<CalloutBlock id="x" code={NOTKA.split('\n').slice(1, -1).join('\n')} />);
    expect(container.textContent).toContain('dostał Nagrodę Nobla w 1960');
  });

  it('trzy rodzaje mają różne etykiety', () => {
    const etykiety = (['law', 'person', 'device'] as const).map((kind) => {
      const { container } = render(<CalloutBlock id="x" code={`@kind ${kind}\nT\n@body B.`} />);
      return container.textContent ?? '';
    });
    expect(etykiety[0]).toContain('Prawo fizyczne');
    expect(etykiety[1]).toContain('Postać nauki');
    expect(etykiety[2]).toContain('Urządzenie i doświadczenie');
  });

  it('niekompletna notka mówi, czego brakuje, zamiast milczeć', () => {
    const { container } = render(<CalloutBlock id="x" code={'Sam tytuł'} />);
    expect(container.textContent).toMatch(/@kind|@body/);
  });

  it('w dokumencie stoi między akapitami i ma kotwicę odsyłacza', () => {
    const md = `Akapit książki.\n\n${NOTKA}\n\nDalszy akapit książki.`;
    const { container } = render(<ReaderView markdown={md} path="x.md" />);
    expect(container.querySelector('#ref-rh1-nota-glaser')).toBeTruthy();
    const t = container.textContent ?? '';
    expect(t).toContain('Akapit książki.');
    expect(t).toContain('Dalszy akapit książki.');
    // nie wyszła jako surowe ogrodzenie
    expect(t).not.toContain('```');
    expect(t).not.toContain('@kind');
  });
});
