/**
 * format.ts — kontrakt adaptera formatu i rejestr.
 *
 * Adapter tłumaczy konkretną składnię (Mermaid, PlantUML, JSON…) na
 * {@link DiagramDocument} i z powrotem. Edytor graficzny nie wie, z jakiego
 * formatu przyszedł diagram — dostaje model i oddaje model.
 *
 * Rozpoznawanie formatu jest oparte na ocenie pewności (`detect`), a nie na
 * pierwszym pasującym adapterze: „stateDiagram-v2" pasuje do Mermaida mocno,
 * ale kilka formatów potrafi zwrócić słabe dopasowanie i wtedy wygrywa
 * najpewniejszy, zamiast tego, który akurat zarejestrowano wcześniej.
 */
import type { DiagramDocument, DiagramKind } from './diagram';

export interface ParseIssue {
  /** Numer linii w źródle (0-based), jeśli znany. */
  line?: number;
  message: string;
}

export interface ParseResult {
  document: DiagramDocument;
  /** Problemy, które nie przerwały parsowania (np. krawędź do nieznanego węzła). */
  issues: ParseIssue[];
}

export interface DiagramFormat {
  /** Identyfikator techniczny, np. `mermaid`. */
  id: string;
  /** Nazwa do UI. */
  label: string;
  /** Rodzaje diagramów, które adapter obsługuje. */
  kinds: DiagramKind[];
  /**
   * Pewność, że tekst jest w tym formacie: 0 = na pewno nie, 1 = na pewno tak.
   * Adapter powinien być ostrożny — zawyżona pewność odbiera tekst właściwemu.
   */
  detect(text: string): number;
  parse(text: string): ParseResult;
  serialize(doc: DiagramDocument): string;
}

export class DiagramFormatRegistry {
  private formats = new Map<string, DiagramFormat>();

  register(format: DiagramFormat): this {
    this.formats.set(format.id, format);
    return this;
  }

  get(id: string): DiagramFormat | undefined {
    return this.formats.get(id);
  }

  list(): DiagramFormat[] {
    return [...this.formats.values()];
  }

  /** Adaptery obsługujące dany rodzaj diagramu. */
  forKind(kind: DiagramKind): DiagramFormat[] {
    return this.list().filter((f) => f.kinds.includes(kind));
  }

  /** Najpewniejszy adapter dla tekstu; `undefined`, gdy żaden nie jest pewny. */
  detect(text: string, minConfidence = 0.5): DiagramFormat | undefined {
    let best: { format: DiagramFormat; score: number } | undefined;
    for (const format of this.formats.values()) {
      const score = format.detect(text);
      if (score >= minConfidence && (!best || score > best.score)) best = { format, score };
    }
    return best?.format;
  }
}

/** Wspólny rejestr — adaptery wbudowane rejestrują się przy imporcie `index.ts`. */
export const diagramFormats = new DiagramFormatRegistry();
