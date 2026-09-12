/**
 * Tryb bloku diagramu musi przeżyć drogę markdown → edytor → markdown.
 *
 * Ustawienie zapisane w infostringu (` ```mermaid:view `) jest bezużyteczne,
 * jeśli konwerter gubi je przy pierwszym zapisie dokumentu — a właśnie tam
 * ginęłoby najciszej, bo blok dalej wyglądałby poprawnie.
 */
import { describe, it, expect } from 'vitest';
import { markdownToHtml, htmlToMarkdown } from './markdownConverter';

const DIAGRAM = ['flowchart TB', '  A[Start] --> B[Koniec]'].join('\n');

function roundTrip(infostring: string): string {
  const markdown = ['```' + infostring, DIAGRAM, '```'].join('\n');
  return htmlToMarkdown(markdownToHtml(markdown));
}

describe('infostring bloku diagramu', () => {
  it('zachowuje tryb podglądu', () => {
    expect(roundTrip('mermaid:view')).toContain('```mermaid:view');
  });

  it('zachowuje tryb edytora graficznego', () => {
    expect(roundTrip('mermaid:edit')).toContain('```mermaid:edit');
  });

  it('zachowuje blok bez trybu', () => {
    const wynik = roundTrip('mermaid');
    expect(wynik).toContain('```mermaid');
    expect(wynik).not.toContain('mermaid:');
  });

  it('nie gubi treści diagramu', () => {
    expect(roundTrip('mermaid:view')).toContain('A[Start] --> B[Koniec]');
  });
});
