/**
 * Round-trip na diagramie z pełnym przeglądem składni.
 *
 * To jest odtworzony plik użytkownika, na którym parser się wyłożył: po zapisie
 * Mermaid odmawiał renderowania. Test pilnuje trzech rzeczy naraz —
 * że rozumiemy każdą linię, że zapis nie gubi treści i że drugie czytanie daje
 * dokładnie ten sam model (bo to zapis wraca do bloku po każdej edycji).
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from './index';
import type { DiagramDocument } from '../../model/diagram';

const SOURCE = [
  'flowchart TB',
  '    %% ===== KSZTALTY WEZLOW (skladnia klasyczna) =====',
  '    A[Prostokat]',
  '    B(Zaokraglony)',
  '    C([Stadion])',
  '    D[[Podprogram]]',
  '    E[(Baza danych)]',
  '    F((Okrag))',
  '    G>Choragiewka]',
  '    H{Romb}',
  '    I{{Szesciokat}}',
  '    J[/Rownoleglobok/]',
  '    K[\\Rownoleglobok alt\\]',
  '    L[/Trapez\\]',
  '    M[\\Trapez alt/]',
  '    N(((Podwojny okrag)))',
  '',
  '    %% ===== RODZAJE POLACZEN =====',
  '    A --> B',
  '    B --- C',
  '    C -.-> D',
  '    D ==> E',
  '    E --o F',
  '    F --x G',
  '    G --Etykieta--> H',
  '    H -->|Etykieta inaczej| I',
  '    I -. kropki z tekstem .-> J',
  '    J --grube z tekstem--> K',
  '    K ~~~ L',
  '    L ----> M',
  '    M -...-> N',
  '    N <--> A2[Dwukierunkowa]',
  '    A2 o--o A3[Kolka]',
  '    A3 x--x A4[Krzyzyki]',
  '',
  '    %% ===== LANCUCHY I WIELOKROTNE =====',
  '    Q1[Start] --> Q2[Krok] --> Q3[Koniec]',
  '    R1 & R2 --> R3 & R4',
  '',
  '    linkStyle 4 stroke-width:4px',
].join('\n');

const doc = mermaidFormat.parse(SOURCE).document;

/** Porównywalny odcisk modelu — pozycje pomijamy, tekst ich nie niesie. */
const fingerprint = (d: DiagramDocument) => ({
  nodes: d.nodes.map((n) => `${n.id}:${n.shape}:${n.label}`).sort(),
  edges: d.edges
    .map((e) => [e.source, e.target, e.lineStyle, e.arrow, e.label ?? '', e.length ?? '', JSON.stringify(e.meta ?? {})].join('|'))
    .sort(),
});

describe('pełny przegląd składni flowchartu', () => {
  it('każdy kształt trafia na swój typ', () => {
    const shapes = Object.fromEntries(doc.nodes.map((n) => [n.id, n.shape]));
    expect(shapes).toMatchObject({
      A: 'rectangle', B: 'rounded', C: 'stadium', D: 'subroutine', E: 'cylinder',
      F: 'circle', G: 'asymmetric', H: 'rhombus', I: 'hexagon', J: 'parallelogram',
      K: 'parallelogramAlt', L: 'trapezoid', M: 'trapezoidAlt', N: 'doubleCircle',
    });
  });

  it('nie powstają węzły-widma z fragmentów operatorów', () => {
    // `-...->` dawało kiedyś węzeł o identyfikatorze `..-`.
    for (const node of doc.nodes) expect(node.id).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });

  it('łańcuch daje wszystkie ogniwa', () => {
    const ids = doc.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['Q1', 'Q2', 'Q3']));
    expect(doc.edges).toContainEqual(expect.objectContaining({ source: 'Q2', target: 'Q3' }));
  });

  it('`&` rozwija się w iloczyn', () => {
    const pairs = doc.edges.filter((e) => e.source.startsWith('R')).map((e) => `${e.source}->${e.target}`);
    expect(pairs.sort()).toEqual(['R1->R3', 'R1->R4', 'R2->R3', 'R2->R4']);
  });

  it('nierozpoznane zostają tylko komentarze i `linkStyle`', () => {
    // Wszystko inne parser ma rozumieć; gdy tu coś dojdzie, znaczy że jakaś
    // składnia znów wymyka się modelowi.
    for (const line of doc.unknown) {
      expect(line.text.trim()).toMatch(/^(%%|linkStyle)/);
    }
  });

  it('zapis nie gubi treści i drugie czytanie daje ten sam model', () => {
    const written = mermaidFormat.serialize(doc);
    expect(fingerprint(mermaidFormat.parse(written).document)).toEqual(fingerprint(doc));
  });

  it('zapis oddaje operatory w ich oryginalnej postaci', () => {
    const written = mermaidFormat.serialize(doc);
    expect(written).toContain('K ~~~ L');
    expect(written).toContain('L ----> M');
    expect(written).toContain('M -...-> N');
    expect(written).toContain('N <--> A2');
    expect(written).toContain('A2 o--o A3');
    expect(written).toContain('A3 x--x A4');
  });

  it('komentarze sekcji zostają przy swojej sekcji, a nie na końcu pliku', () => {
    const lines = mermaidFormat.serialize(doc).split('\n');
    const at = (needle: string) => lines.findIndex((l) => l.includes(needle));
    expect(at('KSZTALTY WEZLOW')).toBeLessThan(at('A[Prostokat]'));
    expect(at('RODZAJE POLACZEN')).toBeLessThan(at('A --> B'));
  });
});
