/**
 * Szkielety nowych diagramów.
 *
 * Muszą być od razu poprawne w formacie docelowym — pusty blok Mermaida kończy
 * się komunikatem o błędzie składni, co wygląda jak usterka edytora.
 */
import { describe, it, expect } from 'vitest';
import { DIAGRAM_STARTERS, starterDiagram } from './starters';
import { mermaidFormat } from '../formats/mermaid';

describe('starterDiagram', () => {
  it('diagram stanów zaczyna się od punktu startowego i jednego stanu', () => {
    const doc = starterDiagram('state');
    expect(doc.kind).toBe('state');
    expect(doc.nodes.some((n) => n.shape === 'start')).toBe(true);
    expect(doc.edges).toHaveLength(1);
  });

  it('schemat blokowy ma początek i krok', () => {
    const doc = starterDiagram('flowchart');
    expect(doc.kind).toBe('flowchart');
    expect(doc.nodes.map((n) => n.label)).toEqual(['Start', 'Krok']);
  });

  it('każdy szkielet zapisuje się do poprawnego Mermaida i wraca tym samym rodzajem', () => {
    for (const { kind } of DIAGRAM_STARTERS) {
      const text = mermaidFormat.serialize(starterDiagram(kind));
      expect(text.length, kind).toBeGreaterThan(10);
      expect(mermaidFormat.parse(text).document.kind, kind).toBe(kind);
    }
  });

  it('szkielet nie używa aliasu — identyfikator jest tym, co widać', () => {
    for (const { kind } of DIAGRAM_STARTERS) {
      const text = mermaidFormat.serialize(starterDiagram(kind));
      expect(text, kind).not.toMatch(/\bas\b/);
    }
  });

  it('szkielet nie zawiera nierozpoznanych linii — nie ma czego zgubić przy zapisie', () => {
    for (const { kind } of DIAGRAM_STARTERS) {
      expect(starterDiagram(kind).unknown, kind).toEqual([]);
    }
  });

  it('lista rodzajów pokrywa to, co obsługuje adapter Mermaida', () => {
    expect(DIAGRAM_STARTERS.map((s) => s.kind).sort()).toEqual([...mermaidFormat.kinds].sort());
  });
});
