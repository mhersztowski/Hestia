/**
 * Rodzaje diagramów, których adapter nie zna.
 *
 * Mermaid ma ich ponad dwadzieścia, my obsługujemy dziesięć. Dla reszty
 * `parse` zakładał flowchart, bo tak wygląda świeżo wklejony fragment bez
 * nagłówka — tyle że `pie`, `mindmap` czy `journey` nagłówek **mają**, więc
 * zgadywanie było tu nie domysłem, lecz zignorowaniem tego, co napisał autor.
 *
 * Skutek był taki, że edytor graficzny pokazywał gałęzie mindmapy jako węzły
 * flowchartu, a pierwsza operacja nadpisywała blok zapisem, którego Mermaid
 * nie renderuje. To jest utrata pracy użytkownika, więc adapter ma tu odmówić.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from './index';

const PIE = ['pie title Udziały', '    "A" : 40', '    "B" : 60'].join('\n');
const MINDMAP = ['mindmap', '  root((centrum))', '    gałąź1', '    gałąź2'].join('\n');
const JOURNEY = ['journey', '    title Dzień', '    section Rano', '      Kawa: 5: Ja'].join('\n');
const GITGRAPH = ['gitGraph', '   commit', '   branch rozwój', '   checkout rozwój', '   commit'].join('\n');
const QUADRANT = ['quadrantChart', '    title Priorytety', '    x-axis Niska --> Wysoka'].join('\n');

const NIEOBSLUGIWANE: Array<[string, string]> = [
  ['pie', PIE],
  ['mindmap', MINDMAP],
  ['journey', JOURNEY],
  ['gitGraph', GITGRAPH],
  ['quadrantChart', QUADRANT],
];

describe('rodzaje spoza obsługiwanych', () => {
  for (const [nazwa, źródło] of NIEOBSLUGIWANE) {
    describe(nazwa, () => {
      it('jest rozpoznany jako Mermaid, ale oznaczony jako nieobsługiwany', () => {
        // Rozpoznanie musi zadziałać: to *jest* Mermaid i pasek ma o tym mówić.
        // Odmowa dotyczy edycji graficznej, nie przynależności do formatu.
        expect(mermaidFormat.detect(źródło)).toBeGreaterThan(0.5);

        const { document, issues } = mermaidFormat.parse(źródło);
        expect(document.unsupported).toBe(nazwa);
        expect(issues.some((i) => i.message.includes(nazwa))).toBe(true);
      });

      it('nie wymyśla węzłów z treści, której nie rozumie', () => {
        const { document } = mermaidFormat.parse(źródło);
        expect(document.nodes).toHaveLength(0);
        expect(document.edges).toHaveLength(0);
        expect(document.groups).toHaveLength(0);
      });

      it('zapis oddaje źródło bez zmian', () => {
        // Nawet gdyby UI puściło taki dokument do zapisu, treść ma przeżyć.
        const { document } = mermaidFormat.parse(źródło);
        expect(mermaidFormat.serialize(document)).toBe(źródło);
      });
    });
  }

  it('tekst bez żadnego nagłówka nadal jest domyślany na flowchart', () => {
    // Domysł zostaje tam, gdzie jest domysłem: autor nic nie napisał o rodzaju.
    const { document } = mermaidFormat.parse('A --> B');
    expect(document.unsupported).toBeUndefined();
    expect(document.kind).toBe('flowchart');
    expect(document.nodes).toHaveLength(2);
  });

  it('obsługiwane rodzaje nie są oznaczane jako nieobsługiwane', () => {
    for (const źródło of [
      'flowchart TB\n  A --> B',
      'stateDiagram-v2\n  [*] --> A',
      'classDiagram\n  class A',
      'sequenceDiagram\n  A ->> B: cześć',
      'erDiagram\n  A ||--o{ B : ma',
      'kanban\n  Do zrobienia',
      'timeline\n  title Oś',
      'gantt\n  title Plan',
      'C4Context\n  title Kontekst',
      'packet-beta\n  0-7: "Nagłówek"',
    ]) {
      expect(mermaidFormat.parse(źródło).document.unsupported).toBeUndefined();
    }
  });

  it('nagłówek rozpoznaje się niezależnie od wielkości liter i wcięcia', () => {
    expect(mermaidFormat.parse('  PIE title X\n  "A" : 1').document.unsupported).toBe('pie');
  });
});
