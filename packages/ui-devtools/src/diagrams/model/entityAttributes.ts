/**
 * entityAttributes.ts — edycja atrybutów encji (diagram ER).
 *
 * Ta sama zasada co przy składowych klasy: atrybut trzyma zapis źródłowy w
 * `raw` i to on trafia do pliku, więc **każda** zmiana musi go przeliczyć.
 * Inaczej edytor pokazywałby jedno, a zapis niósł co innego.
 */
import type { DiagramDocument, EntityAttribute, EntityKey } from './diagram';

/** Atrybut w zapisie kanonicznym: `typ nazwa KLUCZE "komentarz"`. */
export function formatAttribute(attribute: EntityAttribute): string {
  if (!attribute.name || !attribute.type) return attribute.raw;
  const keys = attribute.keys?.length ? ` ${attribute.keys.join(', ')}` : '';
  const comment = attribute.comment ? ` "${attribute.comment}"` : '';
  return `${attribute.type} ${attribute.name}${keys}${comment}`;
}

/** Atrybut z przeliczonym zapisem — jedyna droga do poprawnego `raw`. */
export function withAttributeRaw(attribute: EntityAttribute): EntityAttribute {
  return { ...attribute, raw: formatAttribute(attribute) };
}

export function emptyAttribute(name: string): EntityAttribute {
  return withAttributeRaw({ raw: '', type: 'string', name });
}

function mapAttributes(
  doc: DiagramDocument,
  entityId: string,
  change: (attributes: EntityAttribute[]) => EntityAttribute[],
): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => (
      node.id === entityId ? { ...node, attributes: change(node.attributes ?? []) } : node
    )),
  };
}

/** Dodaje atrybut na koniec; nazwa musi być wolna w obrębie encji. */
export function addAttribute(doc: DiagramDocument, entityId: string): DiagramDocument {
  const node = doc.nodes.find((n) => n.id === entityId);
  if (!node) return doc;
  const taken = new Set((node.attributes ?? []).map((a) => a.name));
  let name = 'pole';
  for (let i = 2; taken.has(name); i++) name = `pole${i}`;
  return mapAttributes(doc, entityId, (attributes) => [...attributes, emptyAttribute(name)]);
}

/** Zmiana atrybutu; `raw` jest przeliczane na nowo. */
export function updateAttribute(
  doc: DiagramDocument,
  entityId: string,
  index: number,
  patch: Partial<Omit<EntityAttribute, 'raw'>>,
): DiagramDocument {
  return mapAttributes(doc, entityId, (attributes) => attributes.map((attribute, i) => (
    i === index ? withAttributeRaw({ ...attribute, ...patch }) : attribute
  )));
}

/**
 * Przełącza rolę klucza.
 *
 * Role są niezależne (`PK, FK` to poprawna kombinacja), więc każda działa jak
 * osobny przełącznik, a nie jak wybór jednej z listy.
 */
export function toggleAttributeKey(
  doc: DiagramDocument,
  entityId: string,
  index: number,
  key: EntityKey,
): DiagramDocument {
  return mapAttributes(doc, entityId, (attributes) => attributes.map((attribute, i) => {
    if (i !== index) return attribute;
    const current = attribute.keys ?? [];
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    // Pusta lista znika, żeby nie przeciekła do zapisu jako pusty ciąg.
    const { keys: _drop, ...rest } = attribute;
    return withAttributeRaw(next.length ? { ...rest, keys: next } : rest);
  }));
}

export function removeAttribute(doc: DiagramDocument, entityId: string, index: number): DiagramDocument {
  return mapAttributes(doc, entityId, (attributes) => attributes.filter((_, i) => i !== index));
}

/** Przesuwa atrybut — kolejność w encji jest częścią jej opisu. */
export function moveAttribute(
  doc: DiagramDocument,
  entityId: string,
  from: number,
  to: number,
): DiagramDocument {
  return mapAttributes(doc, entityId, (attributes) => {
    if (from < 0 || from >= attributes.length || to < 0 || to >= attributes.length || from === to) return attributes;
    const next = [...attributes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
}
