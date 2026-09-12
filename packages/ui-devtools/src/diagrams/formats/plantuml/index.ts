/**
 * plantuml/index.ts — PlantUML ⇄ model diagramu klas.
 *
 * Po co: PlantUML dominuje tam, gdzie Mermaida nie ma — Confluence, IntelliJ,
 * dokumentacja firmowa. Diagram klas z takiego źródła dawało się dotąd wkleić
 * do notatki wyłącznie jako martwy tekst.
 *
 * **Obsługujemy diagram klas i nic więcej.** PlantUML ma kilkanaście rodzajów
 * diagramów o zupełnie różnych składniach; udawanie, że rozumiemy wszystkie,
 * skończyłoby się tym samym, co domyślanie się flowchartu w Mermaidzie —
 * cichym psuciem cudzej pracy (patrz `formats/mermaid/index.ts`). Reszta dostaje
 * jawną odmowę przez `document.unsupported`, a jej źródło wraca nietknięte.
 *
 * Relacje zapisuje się w PlantUML-u niemal tak samo jak w diagramie klas
 * Mermaida (`<|--`, `*--`, `o--`, `..>`), więc rozbiór operatora jest tu bliski
 * temu z `classDiagram.ts`. Różnice są dwie i obie dotyczą składowych:
 * PlantUML pisze `+nazwa: Typ` (nazwa przed typem) i modyfikatory w klamrach
 * (`{static}`, `{abstract}`).
 */
import {
  edgeId, emptyDiagram,
  type ClassMember, type ClassRelationKind, type DiagramDocument, type DiagramNode,
  type MemberVisibility,
} from '../../model/diagram';
import { setEdgeRelation } from '../../model/classRelations';
import type { DiagramFormat, ParseIssue, ParseResult } from '../../model/format';

const START = /^\s*@startuml\b.*$/i;
const END = /^\s*@enduml\s*$/i;

/** `class Nazwa {`, `abstract class Nazwa`, `interface Nazwa`, `enum Nazwa` */
const DECL = /^\s*(abstract\s+class|abstract|class|interface|enum|entity|struct)\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_.]*)\s*(?:as\s+([A-Za-z_][A-Za-z0-9_]*)\s*)?(\{)?\s*$/i;
const BLOCK_CLOSE = /^\s*\}\s*$/;
/** `package "Nazwa" {` albo `package Nazwa {` */
const PACKAGE = /^\s*(package|namespace)\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_.]*)\s*(?:<<[^>]*>>\s*)?\{\s*$/i;

/**
 * Relacja: `A "1" <|-- "0..*" B : opis`.
 *
 * Operator rozpoznajemy osobno od nazw, bo `<`, `|`, `*`, `o` i `.` mogą się
 * pojawić także w etykiecie — a ta zaczyna się dopiero za dwukropkiem.
 */
const RELATION = new RegExp(
  '^\\s*("[^"]+"|[A-Za-z_][A-Za-z0-9_.]*)\\s*'
  + '(?:"([^"]*)"\\s*)?'
  + '([<>|*o+#]{0,2}(?:\\.{2,}|-{2,}|-\\w+-)[<>|*o+#]{0,2})'
  + '\\s*(?:"([^"]*)"\\s*)?'
  + '("[^"]+"|[A-Za-z_][A-Za-z0-9_.]*)'
  + '\\s*(?::\\s*(.*))?$',
);

/** Składowa klasy: `+nazwa: Typ`, `-{static} licznik: int`, `+metoda(a: T): R`. */
const MEMBER = /^\s*([+\-#~])?\s*((?:\{[a-z]+\}\s*)*)(.+?)\s*$/;

const VISIBILITY: Record<string, MemberVisibility> = {
  '+': 'public', '-': 'private', '#': 'protected', '~': 'package',
};
const SIGN: Record<MemberVisibility, string> = {
  public: '+', private: '-', protected: '#', package: '~',
};

/**
 * Nagłówki rodzajów PlantUML-a, których nie obsługujemy.
 *
 * Rozpoznajemy je po **treści**, nie po nagłówku, bo PlantUML nie ma nagłówka
 * rodzaju: `@startuml` zaczyna każdy diagram. Decyduje więc to, co w środku.
 */
const NIEOBSLUGIWANE: Array<[name: string, wzorzec: RegExp]> = [
  ['czynności', /^\s*(start|stop|:.*;)\s*$/im],
  ['przypadków użycia', /^\s*(usecase|actor)\b/im],
  ['stanów', /^\s*\[\*\]\s*(-+>|<-+)/im],
  ['komponentów', /^\s*(component|\[.+\])\s*(as\b|$)/im],
  ['obiektów', /^\s*object\s+/im],
];

/** Czy tekst wygląda na diagram klas. */
function maKlasy(text: string): boolean {
  return /^\s*(abstract\s+class|class|interface|enum)\s+\S/im.test(text);
}

/**
 * Diagram sekwencji rozpoznajemy dopiero wtedy, gdy **nie ma** klas.
 *
 * Strzałka `A -> B : tekst` znaczy w PlantUML-u sekwencję, ale identyczny zapis
 * bez dwukropka bywa asocjacją w diagramie klas. Kolejność sprawdzania jest tu
 * całą różnicą między rozpoznaniem a zgadywaniem.
 */
function wyglądaNaSekwencję(text: string): boolean {
  return /^\s*[A-Za-z_"][^\n]*\s-+>+\s[^\n]*:\s*\S/im.test(text) && !maKlasy(text);
}

function unquote(raw: string): string {
  const text = raw.trim();
  return text.startsWith('"') ? text.slice(1, -1) : text;
}

/** Składowa z zapisu PlantUML-owego (`+nazwa: Typ`, `+metoda(a): R`). */
export function parsePlantMember(raw: string): ClassMember {
  const text = raw.trim();
  const member: ClassMember = { raw: text, kind: text.includes('(') ? 'method' : 'field' };

  const parts = MEMBER.exec(text);
  if (!parts) return member;

  const visibility = VISIBILITY[parts[1] ?? ''];
  if (visibility) member.visibility = visibility;

  const modyfikatory = (parts[2] ?? '').toLowerCase();
  if (modyfikatory.includes('{static}')) member.isStatic = true;
  if (modyfikatory.includes('{abstract}')) member.isAbstract = true;

  let rest = parts[3];
  const otwarcie = rest.indexOf('(');
  if (otwarcie >= 0) {
    const zamkniecie = rest.indexOf(')', otwarcie);
    member.kind = 'method';
    member.name = rest.slice(0, otwarcie).trim();
    member.params = zamkniecie > otwarcie ? rest.slice(otwarcie + 1, zamkniecie).trim() : '';
    const ogon = zamkniecie >= 0 ? rest.slice(zamkniecie + 1).trim() : '';
    if (ogon.startsWith(':')) member.type = ogon.slice(1).trim();
    return member;
  }

  // `Typ nazwa` (styl javowy) też się zdarza, ale `nazwa: Typ` jest kanoniczne.
  const dwukropek = rest.indexOf(':');
  if (dwukropek >= 0) {
    member.name = rest.slice(0, dwukropek).trim();
    member.type = rest.slice(dwukropek + 1).trim();
    return member;
  }
  const spacja = rest.lastIndexOf(' ');
  if (spacja > 0) {
    member.type = rest.slice(0, spacja).trim();
    member.name = rest.slice(spacja + 1).trim();
    return member;
  }
  member.name = rest.trim();
  return member;
}

/** Składowa w zapisie PlantUML-owym. */
export function formatPlantMember(member: ClassMember): string {
  if (!member.name) return member.raw;
  const znak = member.visibility ? SIGN[member.visibility] : '';
  const modyfikator = member.isStatic ? '{static} ' : member.isAbstract ? '{abstract} ' : '';
  const typ = member.type ? `: ${member.type}` : '';
  const nazwa = member.kind === 'method' ? `${member.name}(${member.params ?? ''})` : member.name;
  return `${znak}${modyfikator}${nazwa}${typ}`;
}

/**
 * Rodzaj relacji z operatora.
 *
 * Zwraca też informację, czy strony trzeba zamienić: `A <|-- B` znaczy „B
 * dziedziczy po A", a `A --|> B` to samo z odwróconymi stronami. Model trzyma
 * nadklasę po stronie `from`, więc drugą postać normalizujemy.
 */
export function parseRelationOperator(op: string): { kind: ClassRelationKind; swap: boolean } | undefined {
  const dotted = op.includes('.');
  const lewy = /^[<*o+#|]{1,2}/.exec(op)?.[0] ?? '';
  const prawy = /[>*o+#|]{1,2}$/.exec(op)?.[0] ?? '';

  if (lewy.includes('|')) return { kind: dotted ? 'realization' : 'inheritance', swap: false };
  if (prawy.includes('|')) return { kind: dotted ? 'realization' : 'inheritance', swap: true };
  if (lewy.includes('*')) return { kind: 'composition', swap: false };
  if (prawy.includes('*')) return { kind: 'composition', swap: true };
  if (lewy.includes('o')) return { kind: 'aggregation', swap: false };
  if (prawy.includes('o')) return { kind: 'aggregation', swap: true };
  if (dotted) return { kind: 'dependency', swap: prawy.includes('>') ? false : true };
  if (prawy.includes('>')) return { kind: 'association', swap: false };
  if (lewy.includes('<')) return { kind: 'association', swap: true };
  return { kind: 'link', swap: false };
}

/** Zapis operatora dla rodzaju relacji — odwrotność `parseRelationOperator`. */
const OPERATOR: Record<ClassRelationKind, string> = {
  inheritance: '<|--',
  realization: '<|..',
  composition: '*--',
  aggregation: 'o--',
  association: '-->',
  dependency: '..>',
  link: '--',
};

export function parsePlantUml(text: string): ParseResult {
  const issues: ParseIssue[] = [];

  const nieobslugiwany = wyglądaNaSekwencję(text)
    ? 'sekwencji'
    : NIEOBSLUGIWANE.find(([, wzorzec]) => wzorzec.test(text) && !maKlasy(text))?.[0];

  if (nieobslugiwany) {
    const doc = emptyDiagram('class');
    doc.unsupported = `PlantUML (diagram ${nieobslugiwany})`;
    doc.unknown = text.split('\n').map((line, index) => ({ index, text: line }));
    return {
      document: doc,
      issues: [{
        message: `Diagram ${nieobslugiwany} w PlantUML-u da się obejrzeć jako tekst, `
          + 'ale nie ma jeszcze modelu w edytorze — obsługujemy diagram klas.',
      }],
    };
  }

  const doc = emptyDiagram('class');
  const stack: string[] = [];
  let openClass: DiagramNode | undefined;
  let packageCounter = 0;

  const ensureNode = (id: string): DiagramNode => {
    const istniejacy = doc.nodes.find((n) => n.id === id);
    if (istniejacy) return istniejacy;
    const node: DiagramNode = {
      id, label: '', shape: 'rectangle', members: [],
      ...(stack.length ? { parentId: stack[stack.length - 1] } : {}),
    };
    doc.nodes.push(node);
    return node;
  };

  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (START.test(trimmed) || END.test(trimmed)) return;
    if (trimmed.startsWith("'")) return; // komentarz PlantUML-a

    if (openClass) {
      if (BLOCK_CLOSE.test(trimmed)) { openClass = undefined; return; }
      openClass.members = [...(openClass.members ?? []), parsePlantMember(trimmed)];
      return;
    }

    const pkg = PACKAGE.exec(trimmed);
    if (pkg) {
      packageCounter += 1;
      const id = `pkg${packageCounter}`;
      doc.groups.push({
        id, label: unquote(pkg[2]),
        ...(stack.length ? { parentId: stack[stack.length - 1] } : {}),
      });
      stack.push(id);
      return;
    }

    if (BLOCK_CLOSE.test(trimmed)) { if (stack.length) stack.pop(); return; }

    const decl = DECL.exec(trimmed);
    if (decl) {
      const nazwa = unquote(decl[3] ?? decl[2]);
      const node = ensureNode(nazwa);
      const rodzaj = decl[1].toLowerCase().replace(/\s+/g, ' ');
      if (rodzaj === 'interface') node.stereotype = 'interface';
      else if (rodzaj.startsWith('abstract')) node.stereotype = 'abstract';
      else if (rodzaj === 'enum') node.stereotype = 'enumeration';
      if (decl[4]) openClass = node;
      return;
    }

    const relation = RELATION.exec(trimmed);
    if (relation) {
      const rozbior = parseRelationOperator(relation[3]);
      if (rozbior) {
        const lewa = unquote(relation[1]);
        const prawa = unquote(relation[5]);
        const from = rozbior.swap ? prawa : lewa;
        const to = rozbior.swap ? lewa : prawa;
        ensureNode(from);
        ensureNode(to);

        const krotnoscLewa = relation[2];
        const krotnoscPrawa = relation[4];
        doc.edges.push({
          id: edgeId(doc, from, to),
          source: from,
          target: to,
          lineStyle: 'solid',
          arrow: 'none',
          ...(relation[6]?.trim() ? { label: relation[6].trim() } : {}),
          ...(krotnoscLewa ? { [rozbior.swap ? 'targetLabel' : 'sourceLabel']: krotnoscLewa } : {}),
          ...(krotnoscPrawa ? { [rozbior.swap ? 'sourceLabel' : 'targetLabel']: krotnoscPrawa } : {}),
        });
        Object.assign(doc, setEdgeRelation(doc, doc.edges[doc.edges.length - 1].id, rozbior.kind));
        return;
      }
    }

    doc.unknown.push({ index, text: line });
  });

  return { document: doc, issues };
}

export function serializePlantUml(doc: DiagramDocument): string {
  if (doc.unsupported) return doc.unknown.map((line) => line.text).join('\n');

  const out: string[] = ['@startuml'];

  for (const line of [...doc.unknown].sort((a, b) => a.index - b.index)) {
    out.push(line.text.trim());
  }

  const declaration = (node: DiagramNode): string => {
    const stereotyp = node.stereotype?.replace(/[<>]/g, '').trim().toLowerCase();
    if (stereotyp === 'interface') return `interface ${node.id}`;
    if (stereotyp === 'abstract') return `abstract class ${node.id}`;
    if (stereotyp === 'enumeration' || stereotyp === 'enum') return `enum ${node.id}`;
    return `class ${node.id}`;
  };

  const writeNode = (node: DiagramNode, indent: string) => {
    const members = node.members ?? [];
    if (members.length === 0) { out.push(`${indent}${declaration(node)}`); return; }
    out.push(`${indent}${declaration(node)} {`);
    for (const member of members) out.push(`${indent}  ${formatPlantMember(member)}`);
    out.push(`${indent}}`);
  };

  for (const group of doc.groups) {
    out.push(`package "${group.label}" {`);
    for (const node of doc.nodes.filter((n) => n.parentId === group.id)) writeNode(node, '  ');
    out.push('}');
  }

  for (const node of doc.nodes) {
    if (node.parentId) continue;
    writeNode(node, '');
  }

  for (const edge of doc.edges) {
    const operator = OPERATOR[edge.relation ?? 'link'];
    const lewa = edge.sourceLabel ? ` "${edge.sourceLabel}"` : '';
    const prawa = edge.targetLabel ? `"${edge.targetLabel}" ` : '';
    const opis = edge.label ? ` : ${edge.label}` : '';
    out.push(`${edge.source}${lewa} ${operator} ${prawa}${edge.target}${opis}`);
  }

  out.push('@enduml');
  return out.join('\n');
}

export const plantUmlFormat: DiagramFormat = {
  id: 'plantuml',
  label: 'PlantUML',
  kinds: ['class'],

  detect(text) {
    if (/^\s*@startuml\b/im.test(text)) return 0.95;
    // Bez obudowy rozpoznajemy tylko wtedy, gdy widać deklarację klasy razem
    // z relacją w składni PlantUML-a — sam `class A` pasuje też do Mermaida.
    if (maKlasy(text) && /(<\|--|<\|\.\.|\*--|o--|\.\.>)/.test(text)) return 0.7;
    return 0;
  },

  parse: parsePlantUml,
  serialize: serializePlantUml,
};
