/**
 * packetOps.ts — operacje edycyjne na mapie bitów.
 *
 * Pole opisuje zakres, więc dodanie i usunięcie pociąga za sobą pytanie, co z
 * resztą przestrzeni. Trzymamy się zasady: **operacja nie zostawia dziury po
 * sobie sama z siebie** — nowe pole dokleja się na końcu, a usunięcie może
 * (na życzenie) domknąć lukę przesunięciem następnych pól.
 */
import type { DiagramDocument } from './diagram';
import { emptyPacket, packetSize, type PacketField, type PacketSpec } from './packet';

function withPacket(doc: DiagramDocument, change: (spec: PacketSpec) => PacketSpec): DiagramDocument {
  return { ...doc, packet: change(doc.packet ?? emptyPacket()) };
}

/**
 * Przelicza zakresy tak, by pola leżały jedno za drugim.
 *
 * Po wstawieniu albo przestawieniu pola zakresy zapisane w modelu wskazują
 * bity sprzed zmiany — bez przeliczenia powstałaby dziura albo nakładka.
 */
function relayoutFields(fields: PacketField[], firstBit: number): PacketField[] {
  let bit = firstBit;
  return fields.map((field) => {
    const width = Math.max(field.end - field.start + 1, 1);
    const placed = { ...field, start: bit, end: bit + width - 1 };
    bit += width;
    return placed;
  });
}

/**
 * Dodaje pole.
 *
 * Bez `after` dokleja na końcu pakietu. Z `after` wstawia **tuż za wskazanym
 * polem** i przesuwa następne — tak działa dodawanie w środku struktury, gdzie
 * kolejność pól jest kolejnością bajtów na łączu.
 */
export function addPacketField(
  doc: DiagramDocument,
  width = 8,
  label = 'pole',
  after?: number,
): DiagramDocument {
  return withPacket(doc, (spec) => {
    const taken = new Set(spec.fields.map((f) => f.label));
    let name = label;
    for (let i = 2; taken.has(name); i++) name = `${label}${i}`;
    const size = Math.max(width, 1);

    if (after === undefined || after < 0 || after >= spec.fields.length) {
      const start = packetSize(spec);
      return { ...spec, fields: [...spec.fields, { start, end: start + size - 1, label: name }] };
    }

    const firstBit = spec.fields.length ? Math.min(...spec.fields.map((f) => f.start)) : 0;
    const order = [...spec.fields];
    order.splice(after + 1, 0, { start: 0, end: size - 1, label: name });
    return { ...spec, fields: relayoutFields(order, firstBit) };
  });
}

export function updatePacketField(
  doc: DiagramDocument,
  index: number,
  patch: Partial<PacketField>,
): DiagramDocument {
  return withPacket(doc, (spec) => ({
    ...spec,
    fields: spec.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
  }));
}

/**
 * Usuwa pole. `closeGap` przesuwa następne pola w dół o jego szerokość, żeby
 * nie została dziura — Mermaid odmówiłby narysowania takiego pakietu.
 */
export function removePacketField(doc: DiagramDocument, index: number, closeGap = true): DiagramDocument {
  return withPacket(doc, (spec) => {
    const removed = spec.fields[index];
    if (!removed) return spec;
    const width = removed.end - removed.start + 1;
    const fields = spec.fields
      .filter((_, i) => i !== index)
      .map((field) => (closeGap && field.start > removed.end
        ? { ...field, start: field.start - width, end: field.end - width }
        : field));
    return { ...spec, fields };
  });
}

/**
 * Zmienia szerokość pola, przesuwając wszystkie następne.
 *
 * Bez przesunięcia każda zmiana rozmiaru zostawiałaby dziurę albo nakładkę —
 * czyli diagram, którego Mermaid nie narysuje.
 */
export function resizePacketField(doc: DiagramDocument, index: number, width: number): DiagramDocument {
  return withPacket(doc, (spec) => {
    const field = spec.fields[index];
    if (!field) return spec;
    const next = Math.max(width, 1);
    const delta = next - (field.end - field.start + 1);
    if (delta === 0) return spec;
    return {
      ...spec,
      fields: spec.fields.map((other, i) => {
        if (i === index) return { ...other, end: other.start + next - 1 };
        return other.start > field.end
          ? { ...other, start: other.start + delta, end: other.end + delta }
          : other;
      }),
    };
  });
}

/** Przesuwa pole na liście i przelicza zakresy, żeby układ pozostał ciągły. */
export function movePacketField(doc: DiagramDocument, from: number, to: number): DiagramDocument {
  return withPacket(doc, (spec) => {
    if (from < 0 || from >= spec.fields.length || to < 0 || to >= spec.fields.length || from === to) return spec;
    const order = [...spec.fields];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);

    const firstBit = spec.fields.length ? Math.min(...spec.fields.map((f) => f.start)) : 0;
    return { ...spec, fields: relayoutFields(order, firstBit) };
  });
}

export function setPacketTitle(doc: DiagramDocument, title: string): DiagramDocument {
  return withPacket(doc, (spec) => {
    const clean = title.trim();
    const { title: _drop, ...rest } = spec;
    return clean ? { ...rest, title: clean } : rest;
  });
}
