/**
 * classMembers.ts — edycja specyfikacji klasy: pola, metody, stereotyp.
 *
 * Składowa trzyma zapis źródłowy w `raw` — to on trafia do pliku, gdy rozbiór
 * na pola się nie udał (generyki, wartości domyślne, składnia spoza modelu).
 * Dlatego **każda** zmiana musi `raw` przeliczyć: inaczej edytor pokazywałby
 * jedno, a zapis niósł co innego. Tę jedną odpowiedzialność ma `formatMember`.
 *
 * Zapis jest notacją UML-ową (tą samą, której używa Mermaid), ale mieszka w
 * modelu, a nie w adapterze: to kanoniczna postać składowej, z której korzysta
 * też widok i szacowanie rozmiaru węzła.
 */
import type { ClassMember, DiagramDocument, MemberVisibility } from './diagram';

const SIGN: Record<MemberVisibility, string> = {
  public: '+', private: '-', protected: '#', package: '~',
};

/**
 * Składowa w zapisie kanonicznym.
 *
 * Gdy rozbiór nie dał nazwy, oddajemy `raw` bez zmian — nie umiemy tego
 * odtworzyć, więc nie wolno nam tego nadpisać.
 */
export function formatMember(member: ClassMember): string {
  if (!member.name) return member.raw;
  const sign = member.visibility ? SIGN[member.visibility] : '';
  const modifier = member.isStatic ? '$' : member.isAbstract ? '*' : '';
  if (member.kind === 'method') {
    const type = member.type ? ` ${member.type}` : '';
    return `${sign}${member.name}(${member.params ?? ''})${modifier}${type}`;
  }
  const type = member.type ? `${member.type} ` : '';
  return `${sign}${type}${member.name}${modifier}`;
}

/** Składowa z przeliczonym zapisem — jedyna droga do poprawnego `raw`. */
export function withRaw(member: ClassMember): ClassMember {
  return { ...member, raw: formatMember(member) };
}

/** Nowa, pusta składowa danego rodzaju — gotowa do nazwania w edytorze. */
export function emptyMember(kind: ClassMember['kind'], name: string): ClassMember {
  return withRaw({ raw: '', kind, visibility: 'public', name });
}

/** Zmiana listy składowych klasy; klasa bez ciała dostaje je przy okazji. */
function mapMembers(
  doc: DiagramDocument,
  classId: string,
  change: (members: ClassMember[]) => ClassMember[],
): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => (
      node.id === classId ? { ...node, members: change(node.members ?? []) } : node
    )),
  };
}

/**
 * Dodaje składową na koniec listy.
 *
 * Nazwa musi być wolna w obrębie klasy: dwa pola o tej samej nazwie to błąd,
 * którego nie widać na diagramie, a który myli przy czytaniu kodu.
 */
export function addMember(doc: DiagramDocument, classId: string, kind: ClassMember['kind']): DiagramDocument {
  const node = doc.nodes.find((n) => n.id === classId);
  if (!node) return doc;
  const taken = new Set((node.members ?? []).map((m) => m.name));
  const base = kind === 'field' ? 'pole' : 'metoda';
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
  return mapMembers(doc, classId, (members) => [...members, emptyMember(kind, name)]);
}

/** Zmiana pojedynczej składowej; `raw` jest przeliczane na nowo. */
export function updateMember(
  doc: DiagramDocument,
  classId: string,
  index: number,
  patch: Partial<Omit<ClassMember, 'raw'>>,
): DiagramDocument {
  return mapMembers(doc, classId, (members) => members.map((member, i) => {
    if (i !== index) return member;
    const next = { ...member, ...patch };
    // Modyfikatory wykluczają się nawzajem — w UML nie ma składowej naraz
    // statycznej i abstrakcyjnej, a w Mermaidzie oba to ten sam znak na końcu.
    if (patch.isStatic) next.isAbstract = false;
    if (patch.isAbstract) next.isStatic = false;
    return withRaw(next);
  }));
}

export function removeMember(doc: DiagramDocument, classId: string, index: number): DiagramDocument {
  return mapMembers(doc, classId, (members) => members.filter((_, i) => i !== index));
}

/**
 * Przesuwa składową na liście.
 *
 * Kolejność jest częścią specyfikacji — w klasie czyta się ją z góry na dół,
 * a zapis Mermaida oddaje ją dosłownie.
 */
export function moveMember(doc: DiagramDocument, classId: string, from: number, to: number): DiagramDocument {
  return mapMembers(doc, classId, (members) => {
    if (from < 0 || from >= members.length || to < 0 || to >= members.length || from === to) return members;
    const next = [...members];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

/** Adnotacja klasy (`<<interface>>`); pusty tekst ją zdejmuje. */
export function setStereotype(doc: DiagramDocument, classId: string, stereotype: string): DiagramDocument {
  const clean = stereotype.trim();
  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      if (node.id !== classId) return node;
      const { stereotype: _drop, ...rest } = node;
      return clean ? { ...rest, stereotype: clean } : rest;
    }),
  };
}
