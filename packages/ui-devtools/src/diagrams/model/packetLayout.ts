/**
 * packetLayout.ts — rozłożenie mapy bitów na wiersze.
 *
 * Jedyna trudność tego układu: pole może **przekroczyć koniec wiersza** i musi
 * zostać pocięte na kawałki, po jednym na wiersz. Kawałek zna swoje miejsce w
 * całości, żeby rysunek mógł pokazać etykietę tylko raz i zaznaczyć ciągłość.
 *
 * Czysta geometria, bez DOM-u — da się sprawdzić co do bitu.
 */
import { fieldWidth, packetSize, type PacketField, type PacketSpec } from './packet';

export interface PacketLayoutOptions {
  /** Szerokość jednego bitu w pikselach. */
  bitWidth?: number;
  rowHeight?: number;
  /** Wysokość paska z numerami bitów nad każdym wierszem. */
  rulerHeight?: number;
}

/** Kawałek pola mieszczący się w jednym wierszu. */
export interface LaidOutSegment {
  /** Indeks pola w `spec.fields` — po nim wraca się do modelu. */
  fieldIndex: number;
  label: string;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pierwszy i ostatni bit TEGO kawałka. */
  fromBit: number;
  toBit: number;
  /** Czy to pierwszy kawałek pola — tylko on dostaje etykietę. */
  first: boolean;
  /** Czy pole ciągnie się dalej w następnym wierszu. */
  continues: boolean;
}

export interface PacketLayout {
  segments: LaidOutSegment[];
  /** Podziałki nad wierszami: numer bitu i jego pozycja. */
  ticks: Array<{ row: number; bit: number; x: number; y: number }>;
  rows: number;
  width: number;
  height: number;
  rowHeight: number;
  rulerHeight: number;
}

export function layoutPacket(spec: PacketSpec, options: PacketLayoutOptions = {}): PacketLayout {
  const { bitWidth = 26, rowHeight = 44, rulerHeight = 16 } = options;
  const perRow = Math.max(spec.bitsPerRow, 1);
  const size = packetSize(spec);
  const rows = Math.max(Math.ceil(size / perRow), spec.fields.length ? 1 : 0);

  const segments: LaidOutSegment[] = [];
  spec.fields.forEach((field: PacketField, fieldIndex) => {
    if (field.end < field.start) return;
    let bit = field.start;
    let first = true;
    while (bit <= field.end) {
      const row = Math.floor(bit / perRow);
      const rowEnd = (row + 1) * perRow - 1;
      const toBit = Math.min(field.end, rowEnd);
      const column = bit - row * perRow;
      segments.push({
        fieldIndex,
        label: field.label,
        row,
        x: column * bitWidth,
        y: row * (rowHeight + rulerHeight) + rulerHeight,
        width: (toBit - bit + 1) * bitWidth,
        height: rowHeight,
        fromBit: bit,
        toBit,
        first,
        continues: toBit < field.end,
      });
      first = false;
      bit = toBit + 1;
    }
  });

  // Podziałka: co ósmy bit plus początek i koniec wiersza — gęstsza byłaby
  // nieczytelna przy trzydziestu dwóch kolumnach.
  const ticks: PacketLayout['ticks'] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < perRow; column++) {
      const bit = row * perRow + column;
      if (column % 8 !== 0 && column !== perRow - 1) continue;
      ticks.push({
        row,
        bit,
        x: column * bitWidth + (column === perRow - 1 ? bitWidth : 0),
        y: row * (rowHeight + rulerHeight) + rulerHeight - 4,
      });
    }
  }

  return {
    segments,
    ticks,
    rows,
    width: perRow * bitWidth,
    height: Math.max(rows * (rowHeight + rulerHeight), rulerHeight + rowHeight),
    rowHeight,
    rulerHeight,
  };
}

/** Szerokość pola w bitach — reeksport dla wygody widoku. */
export { fieldWidth };
