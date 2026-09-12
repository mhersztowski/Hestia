/**
 * Import diagramu klas z kodu źródłowego i jego odświeżanie.
 *
 * Backend już to potrafi: `POST /api/users/{u}/uml/sync` parsuje TypeScript,
 * JavaScript, Pythona, C i C++ i zwraca projekt UML. Tutaj mieszkają dwie
 * rzeczy, których backend nie zna:
 *
 *   • **skąd wziął się diagram** — zapisane w bloku, żeby dało się go odświeżyć
 *     bez powtarzania wyboru plików;
 *   • **co się zmieniło** — porównanie starego diagramu z nowym, po stronie
 *     klienta, na modelu diagramu.
 *
 * Porównanie jest tutaj, a nie po stronie backendu (`describeChanges`
 * z `devtools`), bo tamto wymagałoby trzymania w notatce całego `UmlProject`
 * razem z historią — czyli kilkudziesięciu kilobajtów JSON-a w bloku kodu.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from '@hestia/ui-devtools/diagrams';
import { readCodeSource, writeCodeSource, describeDiff, type CodeSource } from './diagramCodeImport';

const DIAGRAM = ['classDiagram', '  class Pies {', '    +glos() string', '  }'].join('\n');

const ZRODLO: CodeSource = {
  dir: 'mycastle-code/packages/core/src/nodes',
  files: ['TaskNode.ts', 'EventNode.ts'],
};

describe('zapis źródła w bloku', () => {
  it('round-trip przez front matter', () => {
    const zZrodlem = writeCodeSource(DIAGRAM, ZRODLO);
    expect(readCodeSource(zZrodlem)).toEqual(ZRODLO);
  });

  it('diagram bez importu nie ma sekcji źródła', () => {
    expect(readCodeSource(DIAGRAM)).toBeUndefined();
    expect(DIAGRAM).not.toContain('source:');
  });

  it('zapis nie psuje treści diagramu', () => {
    const zZrodlem = writeCodeSource(DIAGRAM, ZRODLO);
    expect(zZrodlem).toContain('class Pies');
    expect(mermaidFormat.parse(zZrodlem).document.nodes).toHaveLength(1);
  });

  it('źródło współistnieje z zapisanym układem', () => {
    // Obie rzeczy mieszkają w tym samym bloku `---`. Gdyby zapis jednej kasował
    // drugą, utrata wychodziłaby dopiero po zamknięciu notatki.
    const doc = mermaidFormat.parse(DIAGRAM).document;
    doc.nodes[0].position = { x: 120, y: 40 };
    const zUkladem = mermaidFormat.serialize(doc);

    const zOboma = writeCodeSource(zUkladem, ZRODLO);

    expect(readCodeSource(zOboma)).toEqual(ZRODLO);
    expect(mermaidFormat.parse(zOboma).document.nodes[0].position).toEqual({ x: 120, y: 40 });
  });

  it('powtórny import podmienia źródło zamiast dokładać drugie', () => {
    const raz = writeCodeSource(DIAGRAM, ZRODLO);
    const dwa = writeCodeSource(raz, { dir: 'inny/katalog', files: ['A.py'] });

    expect(readCodeSource(dwa)).toEqual({ dir: 'inny/katalog', files: ['A.py'] });
    expect(dwa.match(/source:/g)).toHaveLength(1);
  });

  it('import całego katalogu zapisuje się bez listy plików', () => {
    const bezPlikow = writeCodeSource(DIAGRAM, { dir: 'projekt/src', files: [] });
    expect(readCodeSource(bezPlikow)).toEqual({ dir: 'projekt/src', files: [] });
  });

  it('uszkodzona sekcja nie wywraca odczytu', () => {
    const zepsuty = ['---', 'source:', '  cokolwiek', '---', DIAGRAM].join('\n');
    expect(readCodeSource(zepsuty)).toBeUndefined();
  });
});

describe('describeDiff', () => {
  const stary = ['classDiagram', '  class A {', '    +x() int', '  }', '  class B'].join('\n');

  const dokument = (text: string) => mermaidFormat.parse(text).document;

  it('milczy, gdy nic się nie zmieniło', () => {
    expect(describeDiff(dokument(stary), dokument(stary))).toEqual([]);
  });

  it('wymienia dodane klasy', () => {
    const nowy = `${stary}\n  class C`;
    expect(describeDiff(dokument(stary), dokument(nowy))).toContain('dodano klasę C');
  });

  it('wymienia usunięte klasy', () => {
    const nowy = ['classDiagram', '  class A {', '    +x() int', '  }'].join('\n');
    expect(describeDiff(dokument(stary), dokument(nowy))).toContain('usunięto klasę B');
  });

  it('liczy zmiany składowych, nie wypisując każdej z osobna', () => {
    // Odświeżenie po tygodniu pracy w kodzie dałoby setki linii — liczba mówi
    // to samo, a da się ją przeczytać.
    const nowy = ['classDiagram', '  class A {', '    +x() int', '    +y() int', '  }', '  class B'].join('\n');
    expect(describeDiff(dokument(stary), dokument(nowy))).toContain('A: 1 składowa więcej');
  });

  it('mówi o mniejszej liczbie składowych', () => {
    const nowy = ['classDiagram', '  class A', '  class B'].join('\n');
    expect(describeDiff(dokument(stary), dokument(nowy))).toContain('A: 1 składowa mniej');
  });

  it('zauważa zmianę składowej bez zmiany ich liczby', () => {
    const nowy = ['classDiagram', '  class A {', '    +x() string', '  }', '  class B'].join('\n');
    expect(describeDiff(dokument(stary), dokument(nowy))).toContain('A: zmieniono składowe');
  });

  it('wymienia zmiany relacji', () => {
    const zRelacja = `${stary}\n  A --|> B`;
    expect(describeDiff(dokument(stary), dokument(zRelacja))).toContain('dodano 1 relację');
  });
});
