/**
 * umlProject.ts — most między projektem UML (`*.umlproj.json`) a modelem diagramu.
 *
 * Po co: `@hestia/node-devtools` parsuje TypeScript, JavaScript, Pythona, C i
 * C++ do neutralnego `CodeModel`, a backend wystawia to jako
 * `POST /api/users/{u}/uml/sync`, zwracając `UmlProject`. Cała droga „wskaż
 * pliki → dostań diagram klas" jest zbudowana i przetestowana. Brakowało
 * wyłącznie tłumaczenia między dwoma kształtami **tego samego pojęcia**, bo
 * jeden powstał dla strony Programming → UML, a drugi dla bloku w notatce.
 *
 * Dlaczego typy są tu powtórzone, a nie zaimportowane z `devtools`: tamten
 * pakiet ma jeden punkt wejścia, który ciągnie `node:fs` i `node:module`
 * (parsery, skan katalogów, git). Wciągnięcie go do pakietu przeglądarkowego po
 * to, żeby dostać trzy interfejsy bez ani jednej linii kodu wykonywalnego,
 * byłoby złą wymianą. Kształt jest tu opisany minimalnie i ma jedno źródło
 * prawdy — `packages/devtools/src/uml/umlTypes.ts`.
 *
 * **Kierunek relacji jest sednem tego pliku.** Oba modele mają `source` i
 * `target`, ale znaczą nimi co innego: w UML `generalization` idzie od podklasy
 * do nadklasy (trójkąt rysuje się na końcu), a w modelu diagramu `inheritance`
 * trzyma nadklasę po stronie `from`. Pomylenie tego nie kończy się błędem,
 * tylko diagramem z odwróconym dziedziczeniem — a to widać dopiero wtedy, gdy
 * ktoś go przeczyta.
 */
import {
  edgeId,
  emptyDiagram,
  type ClassMember,
  type ClassRelationKind,
  type DiagramDocument,
  type DiagramNode,
  type MemberVisibility,
} from '../../model/diagram';
import { setEdgeRelation } from '../../model/classRelations';

// --- kształt projektu UML (podzbiór `devtools/src/uml/umlTypes.ts`) ----------

export type UmlKind = 'class' | 'abstract' | 'interface' | 'enum' | 'struct' | 'module';
export type UmlRelType =
  | 'association'
  | 'directed'
  | 'aggregation'
  | 'composition'
  | 'generalization'
  | 'realization'
  | 'dependency';

export interface UmlMemberLike {
  id: string;
  kind: 'field' | 'method';
  /** Zapis składowej w notacji UML, np. `+ getId(): string`. */
  text: string;
  /** Dokumentacja z TSDoc — model diagramu jej nie niesie, więc tylko przechowujemy. */
  doc?: unknown;
  /** Znacznik grupujący (`async`) — jak wyżej. */
  category?: string;
}

export interface UmlNodeDataLike {
  kind: UmlKind;
  name: string;
  members: UmlMemberLike[];
  linkedFile?: string;
  doc?: unknown;
}

export interface UmlNodeLike {
  id: string;
  type: 'umlClass';
  position: { x: number; y: number };
  data: UmlNodeDataLike;
}

export interface UmlEdgeLike {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type: 'uml';
  data: { relType: UmlRelType; label?: string };
}

export interface UmlDiagramLike {
  id: string;
  name: string;
  nodes: UmlNodeLike[];
  edges: UmlEdgeLike[];
}

// --- rodzaje relacji --------------------------------------------------------

/**
 * Odwzorowanie rodzajów relacji, dobrane tak, by round-trip niczego nie gubił.
 *
 * Dwie pary wymagają uwagi. `directed` (linia ze strzałką) odpowiada temu, co
 * model diagramu nazywa `association`, a bezstrzałkowe UML-owe `association`
 * temu, co nazywa `link`. Nazwy są mylące, ale wygląd i znaczenie się zgadzają,
 * a to one decydują o tym, co zobaczy czytelnik.
 */
const REL_FROM_UML: Record<UmlRelType, ClassRelationKind> = {
  generalization: 'inheritance',
  realization: 'realization',
  composition: 'composition',
  aggregation: 'aggregation',
  directed: 'association',
  association: 'link',
  dependency: 'dependency',
};

const REL_TO_UML: Record<ClassRelationKind, UmlRelType> = {
  inheritance: 'generalization',
  realization: 'realization',
  composition: 'composition',
  aggregation: 'aggregation',
  association: 'directed',
  link: 'association',
  dependency: 'dependency',
};

/**
 * Czy strony relacji znaczą w obu modelach to samo.
 *
 * Dla dziedziczenia i implementacji — nie: UML stawia podklasę jako źródło,
 * model diagramu nadklasę. Dla kompozycji i agregacji — tak: w obu „całość"
 * jest źródłem (UML rysuje romb przy `markerStart`). Dla reszty kierunek jest
 * kierunkiem odwołania i też się zgadza.
 */
const ODWRACANE: ReadonlySet<UmlRelType> = new Set<UmlRelType>(['generalization', 'realization']);

// --- notacja składowej ------------------------------------------------------

/*
 * Oba modele zapisują składową inaczej i to jest prawdziwa granica tłumaczenia:
 *
 *   • UML z `devtools`  — `- imie: string`, `+ glos(): string` (nazwa, potem typ),
 *   • model diagramu    — `-string imie`, `+glos() string` (typ przed nazwą),
 *     bo taką notację ma diagram klas Mermaida.
 *
 * Przepisanie tekstu bez zamiany kolejności dawało `name: "string"` i
 * `type: "imie"` — rozbiór „udawał się", a klasa pokazywała bzdury. To był
 * najcichszy błąd w całym moście, bo nic nie protestowało.
 */

const ZNAK: Record<MemberVisibility, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
};
const WIDOCZNOSC: Record<string, MemberVisibility> = {
  '+': 'public',
  '-': 'private',
  '#': 'protected',
  '~': 'package',
};

/** Składowa z zapisu UML-owego (`+ nazwa(argumenty): typ`). */
export function parseUmlMember(text: string): ClassMember {
  let rest = text.trim();
  const member: ClassMember = { raw: rest, kind: rest.includes('(') ? 'method' : 'field' };

  const visibility = WIDOCZNOSC[rest[0]];
  if (visibility) {
    member.visibility = visibility;
    rest = rest.slice(1).trim();
  }
  if (rest.startsWith('static ')) {
    member.isStatic = true;
    rest = rest.slice(7).trim();
  }
  // `async` nie ma odpowiednika w notacji diagramu klas — zostaje w `raw`
  // i wraca przy zapisie z `category` poprzedniej wersji.
  if (rest.startsWith('async ')) rest = rest.slice(6).trim();
  if (rest.startsWith('abstract ')) {
    member.isAbstract = true;
    rest = rest.slice(9).trim();
  }

  const otwarcie = rest.indexOf('(');
  if (otwarcie >= 0) {
    const zamkniecie = rest.indexOf(')', otwarcie);
    member.name = rest.slice(0, otwarcie).trim();
    member.params = zamkniecie > otwarcie ? rest.slice(otwarcie + 1, zamkniecie).trim() : '';
    const ogon = zamkniecie >= 0 ? rest.slice(zamkniecie + 1).trim() : '';
    if (ogon.startsWith(':')) member.type = ogon.slice(1).trim();
    return member;
  }

  const dwukropek = rest.indexOf(':');
  member.name = dwukropek >= 0 ? rest.slice(0, dwukropek).trim() : rest;
  if (dwukropek >= 0) member.type = rest.slice(dwukropek + 1).trim();
  return member;
}

/** Składowa w zapisie UML-owym — odwrotność `parseUmlMember`. */
export function formatUmlMember(member: ClassMember): string {
  if (!member.name) return member.raw;
  const znak = member.visibility ? ZNAK[member.visibility] : '+';
  const statyczna = member.isStatic ? 'static ' : '';
  const abstrakcyjna = member.isAbstract ? 'abstract ' : '';
  const typ = member.type ? `: ${member.type}` : '';
  const nazwa = member.kind === 'method' ? `${member.name}(${member.params ?? ''})` : member.name;
  return `${znak} ${statyczna}${abstrakcyjna}${nazwa}${typ}`;
}

// --- rodzaj klasy -----------------------------------------------------------

/**
 * Rodzaj klasy zamieniamy na stereotyp — tak nazywa to notacja UML-owa
 * diagramu klas (`<<interface>>`) i tak zapisze go Mermaid.
 *
 * Zwykła klasa stereotypu nie dostaje: inaczej każdy diagram byłby nim
 * upstrzony bez powodu.
 */
function stereotypeOf(kind: UmlKind): string | undefined {
  return kind === 'class' ? undefined : kind;
}

function kindOf(stereotype: string | undefined): UmlKind {
  const czysty = stereotype?.replace(/[<>]/g, '').trim().toLowerCase();
  const znane: UmlKind[] = ['abstract', 'interface', 'enum', 'struct', 'module'];
  return znane.find((k) => k === czysty) ?? 'class';
}

// --- UML → model diagramu ---------------------------------------------------

/**
 * Diagram klas z projektu UML.
 *
 * Identyfikatorem węzła zostaje **nazwa klasy**, a nie techniczne id: w
 * diagramie klas identyfikator jest tym, co widać i czym posługują się
 * krawędzie w zapisie Mermaida. `n:Pies` byłoby zapisem, którego nikt nie chce
 * czytać ani pisać ręcznie.
 */
export function umlDiagramToDocument(diagram: UmlDiagramLike): DiagramDocument {
  const doc = emptyDiagram('class');
  doc.title = diagram.name;

  /** Techniczne id → nazwa klasy; krawędzie mówią tym pierwszym. */
  const nazwy = new Map<string, string>();
  for (const node of diagram.nodes) nazwy.set(node.id, node.data.name);

  doc.nodes = diagram.nodes.map((node): DiagramNode => ({
    id: node.data.name,
    label: node.data.name,
    shape: 'rectangle',
    position: { ...node.position },
    members: node.data.members.map((member) => parseUmlMember(member.text)),
    ...(stereotypeOf(node.data.kind) ? { stereotype: stereotypeOf(node.data.kind) } : {}),
    ...(node.data.linkedFile ? { meta: { file: node.data.linkedFile } } : {}),
  }));

  for (const edge of diagram.edges) {
    const from = nazwy.get(edge.source);
    const to = nazwy.get(edge.target);
    // Krawędź do klasy spoza diagramu pomijamy: osierocona psuje każdy format
    // zapisu i wywraca układ.
    if (!from || !to) continue;

    const relation = REL_FROM_UML[edge.data.relType] ?? 'association';
    const odwrocic = ODWRACANE.has(edge.data.relType);

    const source = odwrocic ? to : from;
    const target = odwrocic ? from : to;
    // `edgeId` pilnuje niepowtarzalności: `A --▷ B` i `B --> A` po odwróceniu
    // dziedziczenia dają tę samą parę końców, a dwie krawędzie o jednym id
    // znaczyłyby, że druga po cichu nadpisuje pierwszą.
    doc.edges.push({
      id: edgeId(doc, source, target),
      source,
      target,
      lineStyle: 'solid',
      arrow: 'none',
      ...(edge.data.label ? { label: edge.data.label } : {}),
      meta: { umlEdgeId: edge.id },
    });
    // Wygląd linii wynika z rodzaju relacji, a nie odwrotnie — `setEdgeRelation`
    // jest jedynym miejscem, które zna to odwzorowanie, więc nie powtarzamy go
    // tutaj. Operuje na dokumencie, bo zakończenie zależy od strony głównej.
    Object.assign(doc, setEdgeRelation(doc, doc.edges[doc.edges.length - 1].id, relation));
  }

  return doc;
}

// --- model diagramu → UML ---------------------------------------------------

let licznik = 0;

/** Identyfikator dla elementu, którego nie było w poprzedniej wersji. */
function nowyId(prefix: string): string {
  licznik += 1;
  return `${prefix}${licznik.toString(36)}`;
}

/**
 * Projekt UML z diagramu klas.
 *
 * `previous` jest opcjonalne, ale bez niego odświeżenie z kodu zmieniałoby
 * **wszystkie** techniczne identyfikatory, a historia projektu UML pokazywałaby
 * „usunięto wszystko, dodano wszystko". Stamtąd też wracają rzeczy, których
 * model diagramu nie niesie — dokumentacja z TSDoc i kategorie składowych.
 */
export function documentToUmlDiagram(
  doc: DiagramDocument,
  previous?: UmlDiagramLike
): UmlDiagramLike {
  const poprzednieWezly = new Map((previous?.nodes ?? []).map((n) => [n.data.name, n]));
  const poprzednieKrawedzie = new Map((previous?.edges ?? []).map((e) => [e.id, e]));

  const idKlasy = new Map<string, string>();

  const nodes = doc.nodes.map((node): UmlNodeLike => {
    const stary = poprzednieWezly.get(node.id);
    const id = stary?.id ?? nowyId('n');
    idKlasy.set(node.id, id);

    // Składowe dopasowujemy po zapisie: to jedyna rzecz, która jest w obu
    // modelach ta sama. Dopasowanie po kolejności rozjeżdżałoby się przy
    // pierwszym dopisanym polu.
    const stareSkladowe = new Map((stary?.data.members ?? []).map((m) => [m.text.trim(), m]));

    return {
      id,
      type: 'umlClass',
      position: node.position ? { ...node.position } : (stary?.position ?? { x: 0, y: 0 }),
      data: {
        kind: kindOf(node.stereotype),
        name: node.id,
        members: (node.members ?? []).map((member): UmlMemberLike => {
          const text = formatUmlMember(member);
          const stara = stareSkladowe.get(text.trim());
          return {
            id: stara?.id ?? nowyId('m'),
            kind: member.kind,
            text,
            ...(stara?.doc !== undefined ? { doc: stara.doc } : {}),
            ...(stara?.category !== undefined ? { category: stara.category } : {}),
          };
        }),
        ...(node.meta?.file
          ? { linkedFile: node.meta.file }
          : stary?.data.linkedFile
            ? { linkedFile: stary.data.linkedFile }
            : {}),
        ...(stary?.data.doc !== undefined ? { doc: stary.data.doc } : {}),
      },
    };
  });

  const edges = doc.edges.flatMap((edge): UmlEdgeLike[] => {
    const from = idKlasy.get(edge.source);
    const to = idKlasy.get(edge.target);
    if (!from || !to) return [];

    const relation: ClassRelationKind = edge.relation ?? 'link';
    const relType = REL_TO_UML[relation];
    const odwrocic = ODWRACANE.has(relType);

    const staryId = edge.meta?.umlEdgeId;
    const stara = staryId ? poprzednieKrawedzie.get(staryId) : undefined;

    return [
      {
        id: stara?.id ?? nowyId('e'),
        source: odwrocic ? to : from,
        target: odwrocic ? from : to,
        ...(stara?.sourceHandle ? { sourceHandle: stara.sourceHandle } : {}),
        ...(stara?.targetHandle ? { targetHandle: stara.targetHandle } : {}),
        type: 'uml',
        data: { relType, ...(edge.label ? { label: edge.label } : {}) },
      },
    ];
  });

  return {
    id: previous?.id ?? nowyId('d'),
    name: doc.title ?? previous?.name ?? 'Model',
    nodes,
    edges,
  };
}
