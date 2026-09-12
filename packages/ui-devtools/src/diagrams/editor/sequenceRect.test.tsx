/**
 * Blok `rect` jako tło.
 *
 * `rect rgb(255, 240, 220)` nie ma tytułu — to, co po słowie kluczowym, JEST
 * kolorem. Rysowanie tego jako etykiety `[rgb(255, 240, 220)]` pokazywało zapis
 * zamiast efektu, a blok wyglądał jak każdy inny.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SequenceView } from './SequenceView';
import { parseSequenceDiagram } from '../formats/mermaid/sequenceDiagram';

const render = (source: string) =>
  renderToStaticMarkup(<SequenceView script={parseSequenceDiagram(source).document.sequence!} />);

const Z_KOLOREM = [
  'sequenceDiagram',
  '    rect rgb(255, 240, 220)',
  '        A->>B: x',
  '    end',
].join('\n');

describe('rect z kolorem', () => {
  const svg = render(Z_KOLOREM);

  it('używa podanego koloru jako wypełnienia', () => {
    expect(svg).toContain('rgb(255, 240, 220)');
  });

  it('nie pokazuje koloru jako etykiety', () => {
    expect(svg).not.toContain('[rgb(255, 240, 220)]');
  });

  it('nie rysuje chipa z nazwą bloku', () => {
    expect(svg).not.toContain('>rect<');
  });

  it('blok bez koloru nadal ma chip i etykietę', () => {
    const zwykly = render('sequenceDiagram\n    loop co minutę\n        A->>B: x\n    end');
    expect(zwykly).toContain('>loop<');
    expect(zwykly).toContain('[co minutę]');
  });

  it('`rect` z tytułem niebędącym kolorem zachowuje się jak zwykły blok', () => {
    const opisowy = render('sequenceDiagram\n    rect ważny fragment\n        A->>B: x\n    end');
    expect(opisowy).toContain('[ważny fragment]');
  });
});
