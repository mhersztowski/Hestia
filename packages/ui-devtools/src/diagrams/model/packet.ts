/**
 * packet.ts — model diagramu pakietu (mapa bitów).
 *
 * Znów inny gatunek niż poprzednie: nie ma tu ani grafu, ani przebiegu w
 * czasie. Jest **ciągła przestrzeń bitów** podzielona na pola, a znaczenie
 * niesie zakres każdego pola i to, czy pola pokrywają przestrzeń bez dziur i
 * bez nakładek. Dlatego pole jest opisane zakresem, a nie pozycją na rysunku.
 */

/** Pole pakietu: zakres bitów i opis. */
export interface PacketField {
  /** Pierwszy bit (włącznie), liczony od zera. */
  start: number;
  /** Ostatni bit (włącznie). Dla pola jednobitowego równy `start`. */
  end: number;
  label: string;
}

/** Linia, której nie rozumiemy — wraca nietknięta na swoje miejsce. */
export interface PacketRaw {
  kind: 'raw';
  text: string;
}

export interface PacketSpec {
  title?: string;
  fields: PacketField[];
  /**
   * Ile bitów mieści się w wierszu rysunku.
   *
   * Mermaid używa 32 i nie pozwala tego zmienić w składni; trzymamy to w
   * modelu, bo od tego zależy cały układ, a inny format może mieć własną
   * szerokość słowa.
   */
  bitsPerRow: number;
  /** Nierozpoznane linie z numerem, żeby wróciły na swoje miejsce. */
  unknown: Array<{ index: number; text: string }>;
}

export const DEFAULT_BITS_PER_ROW = 32;

export function emptyPacket(): PacketSpec {
  return { fields: [], bitsPerRow: DEFAULT_BITS_PER_ROW, unknown: [] };
}

/** Szerokość pola w bitach. */
export function fieldWidth(field: PacketField): number {
  return field.end - field.start + 1;
}

/** Ostatni zajęty bit — stąd wiadomo, ile wierszy zajmie rysunek. */
export function packetSize(spec: PacketSpec): number {
  return spec.fields.reduce((max, field) => Math.max(max, field.end + 1), 0);
}

/** Rodzaj usterki w podziale przestrzeni bitów. */
export type PacketIssueKind = 'overlap' | 'gap' | 'reversed';

export interface PacketIssue {
  kind: PacketIssueKind;
  /** Bit, od którego zaczyna się problem. */
  from: number;
  to: number;
  message: string;
}

/**
 * Sprawdza podział przestrzeni bitów.
 *
 * Pola nakładające się albo zostawiające dziurę to błąd w opisie protokołu, a
 * nie kwestia estetyki — Mermaid odmawia wtedy narysowania diagramu. Zwracamy
 * je jako listę, żeby edytor mógł je pokazać, zamiast po cichu poprawiać.
 */
export function validatePacket(spec: PacketSpec): PacketIssue[] {
  const issues: PacketIssue[] = [];
  const sorted = [...spec.fields].sort((a, b) => a.start - b.start);

  for (const field of sorted) {
    if (field.end < field.start) {
      issues.push({
        kind: 'reversed',
        from: field.start,
        to: field.end,
        message: `Pole „${field.label}" ma koniec przed początkiem (${field.start}-${field.end}).`,
      });
    }
  }

  let expected = 0;
  for (const field of sorted) {
    if (field.end < field.start) continue;
    if (field.start > expected) {
      issues.push({
        kind: 'gap',
        from: expected,
        to: field.start - 1,
        message: `Bity ${expected}-${field.start - 1} nie należą do żadnego pola.`,
      });
    } else if (field.start < expected) {
      issues.push({
        kind: 'overlap',
        from: field.start,
        to: Math.min(expected - 1, field.end),
        message: `Pole „${field.label}" nachodzi na poprzednie (bity ${field.start}-${Math.min(expected - 1, field.end)}).`,
      });
    }
    expected = Math.max(expected, field.end + 1);
  }

  return issues;
}
