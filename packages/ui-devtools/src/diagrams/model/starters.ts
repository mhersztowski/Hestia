/**
 * starters.ts — punkt startowy dla pustego diagramu.
 *
 * Pusty dokument nie nadaje się na start: Mermaid odrzuca diagram bez treści,
 * a użytkownik postawiony przed czystym płótnem nie wie, od czego zacząć.
 * Szkielet jest minimalny — tyle, żeby diagram się renderował i było co
 * przeciągnąć.
 *
 * Trzymane w modelu (a nie w interfejsie hosta), bo ten sam zestaw jest
 * potrzebny w edytorze markdown, w palecie komend i w playgroundzie.
 */
import { emptyDiagram, type DiagramDocument, type DiagramKind } from './diagram';
import { addNode, connect } from './operations';

export interface DiagramStarter {
  kind: DiagramKind;
  /** Nazwa w wyborze rodzaju diagramu. */
  label: string;
  /** Krótkie wyjaśnienie, do czego służy. */
  description: string;
}

export const DIAGRAM_STARTERS: DiagramStarter[] = [
  { kind: 'flowchart', label: 'Schemat blokowy', description: 'Kroki, decyzje i przepływ — flowchart' },
  { kind: 'state', label: 'Diagram stanów', description: 'Stany i przejścia automatu — stateDiagram' },
  { kind: 'class', label: 'Diagram klas', description: 'Klasy, pola, metody i relacje — classDiagram' },
  { kind: 'sequence', label: 'Diagram sekwencji', description: 'Kto z kim rozmawia i w jakiej kolejności — sequenceDiagram' },
  { kind: 'er', label: 'Diagram ER', description: 'Encje, atrybuty i związki — erDiagram' },
  { kind: 'packet', label: 'Mapa bitów', description: 'Pola nagłówka protokołu — packet' },
  { kind: 'kanban', label: 'Tablica kanban', description: 'Kolumny i karty zadań — kanban' },
  { kind: 'gantt', label: 'Harmonogram', description: 'Zadania w czasie, zależności — gantt' },
  { kind: 'timeline', label: 'Oś wydarzeń', description: 'Okresy i wydarzenia — timeline' },
  { kind: 'c4', label: 'Architektura C4', description: 'Konteksty, systemy i granice — C4' },
];

/** Minimalny, poprawny diagram danego rodzaju. */
export function starterDiagram(kind: DiagramKind): DiagramDocument {
  if (kind === 'c4') {
    // Klient, nasz system i system zewnętrzny — najmniejszy sensowny kontekst.
    const doc = emptyDiagram('c4');
    doc.meta = { c4Kind: 'C4Context', title: 'Kontekst systemu' };
    doc.groups = [{ id: 'granica', label: 'Nasza organizacja', c4: { kind: 'enterprise' } }];
    doc.nodes = [
      { id: 'klient', label: 'Klient', shape: 'rectangle', parentId: 'granica',
        c4: { kind: 'person', variant: 'plain', external: false, description: 'Użytkownik systemu' } },
      { id: 'system', label: 'Nasz system', shape: 'rectangle', parentId: 'granica',
        c4: { kind: 'system', variant: 'plain', external: false, description: 'To, co budujemy' } },
      { id: 'poczta', label: 'System pocztowy', shape: 'rectangle',
        c4: { kind: 'system', variant: 'plain', external: true, description: 'Wysyła powiadomienia' } },
    ];
    doc.edges = [
      { id: 'klient__system__0', source: 'klient', target: 'system', label: 'Używa', lineStyle: 'solid', arrow: 'arrow', c4: {} },
      { id: 'system__poczta__1', source: 'system', target: 'poczta', label: 'Wysyła pocztę', lineStyle: 'solid', arrow: 'arrow', c4: { technology: 'SMTP' } },
    ];
    return doc;
  }

  if (kind === 'timeline') {
    const doc = emptyDiagram('timeline');
    doc.timeline = {
      title: 'Nowa oś wydarzeń',
      unknown: [],
      sections: [
        { label: 'Pierwsza sekcja', periods: [
          { label: '2023', events: ['Pierwsze wydarzenie'] },
          { label: '2024', events: ['Drugie wydarzenie', 'Trzecie wydarzenie'] },
        ] },
      ],
    };
    return doc;
  }

  if (kind === 'gantt') {
    // Dwie sekcje i zależność między nimi — od razu widać, jak działa `after`.
    const doc = emptyDiagram('gantt');
    doc.gantt = {
      dateFormat: 'YYYY-MM-DD',
      unknown: [],
      sections: [
        {
          label: 'Przygotowanie',
          tasks: [
            { label: 'Analiza', tags: [], id: 'a1', start: { kind: 'date', value: '2024-01-01' }, end: { kind: 'duration', value: '5d' } },
            { label: 'Projekt', tags: [], id: 'a2', start: { kind: 'after', ids: ['a1'] }, end: { kind: 'duration', value: '3d' } },
          ],
        },
        {
          label: 'Wykonanie',
          tasks: [
            { label: 'Budowa', tags: ['active'], id: 'b1', start: { kind: 'after', ids: ['a2'] }, end: { kind: 'duration', value: '10d' } },
            { label: 'Odbiór', tags: ['milestone'], id: 'm1', start: { kind: 'after', ids: ['b1'] }, end: { kind: 'duration', value: '0d' } },
          ],
        },
      ],
    };
    return doc;
  }

  if (kind === 'kanban') {
    // Trzy kolumny i po jednej karcie — od razu widać, gdzie co wpisać.
    const doc = emptyDiagram('kanban');
    doc.kanban = {
      unknown: [],
      columns: [
        { label: 'Do zrobienia', cards: [{ label: 'Pierwsze zadanie' }] },
        { label: 'W trakcie', cards: [] },
        { label: 'Gotowe', cards: [] },
      ],
    };
    return doc;
  }

  if (kind === 'packet') {
    // Nagłówek UDP: cztery pola po 16 bitów — pokazuje podziałkę i zawijanie
    // wiersza przy 32 bitach.
    const doc = emptyDiagram('packet');
    doc.packet = {
      title: 'UDP',
      bitsPerRow: 32,
      unknown: [],
      fields: [
        { start: 0, end: 15, label: 'Port zrodlowy' },
        { start: 16, end: 31, label: 'Port docelowy' },
        { start: 32, end: 47, label: 'Dlugosc' },
        { start: 48, end: 63, label: 'Suma kontrolna' },
      ],
    };
    return doc;
  }

  if (kind === 'er') {
    // Klient i jego zamówienia: pokazuje od razu klucz główny, obcy i
    // najczęstszą liczebność „jeden do wielu".
    const doc = emptyDiagram('er');
    doc.nodes = [
      {
        id: 'KLIENT', label: 'KLIENT', shape: 'rectangle',
        attributes: [
          { raw: 'string numer PK', type: 'string', name: 'numer', keys: ['PK'] },
          { raw: 'string nazwa', type: 'string', name: 'nazwa' },
        ],
      },
      {
        id: 'ZAMOWIENIE', label: 'ZAMOWIENIE', shape: 'rectangle',
        attributes: [
          { raw: 'int nr PK', type: 'int', name: 'nr', keys: ['PK'] },
          { raw: 'string klientNumer FK', type: 'string', name: 'klientNumer', keys: ['FK'] },
        ],
      },
    ];
    doc.edges = [{
      id: 'KLIENT__ZAMOWIENIE', source: 'KLIENT', target: 'ZAMOWIENIE',
      lineStyle: 'solid', arrow: 'none',
      erFrom: 'exactlyOne', erTo: 'zeroOrMore', erIdentifying: true, label: 'sklada',
    }];
    return doc;
  }

  if (kind === 'sequence') {
    // Pytanie i odpowiedź z aktywacją — pokazuje od razu obie strony przebiegu.
    const doc = emptyDiagram('sequence');
    // Identyfikatory mówiące, bez aliasu: w szkielecie `participant A as Klient`
    // to tylko szum — nazwa uczestnika może od razu być czytelna.
    doc.sequence = {
      participants: [{ id: 'Klient', label: '' }, { id: 'Serwer', label: '' }],
      steps: [
        { kind: 'message', from: 'Klient', to: 'Serwer', arrow: 'solidArrow', text: 'pytanie', activate: true },
        { kind: 'message', from: 'Serwer', to: 'Klient', arrow: 'dottedArrow', text: 'odpowiedź', deactivate: true },
      ],
    };
    return doc;
  }

  if (kind === 'class') {
    // Dziedziczenie z jednym polem i jedną metodą — pokazuje od razu obie
    // sekcje ciała klasy i sposób zapisu relacji.
    const doc = emptyDiagram('class');
    doc.nodes = [
      {
        id: 'Zwierze', label: 'Zwierze', shape: 'rectangle',
        members: [
          { raw: '+String imie', kind: 'field', visibility: 'public', type: 'String', name: 'imie' },
          { raw: '+opis() String', kind: 'method', visibility: 'public', name: 'opis', type: 'String' },
        ],
      },
      {
        id: 'Pies', label: 'Pies', shape: 'rectangle',
        members: [{ raw: '+szczekaj() void', kind: 'method', visibility: 'public', name: 'szczekaj', type: 'void' }],
      },
    ];
    doc.edges = [{
      id: 'Zwierze__Pies', source: 'Zwierze', target: 'Pies',
      lineStyle: 'solid', arrow: 'none', meta: { startArrow: 'triangle' },
    }];
    return doc;
  }

  if (kind === 'state') {
    let doc = emptyDiagram('state');
    doc = addNode(doc, 'start');
    doc = addNode(doc, 'rectangle', { label: 'Idle' });
    doc = connect(doc, doc.nodes[0].id, doc.nodes[1].id);
    return doc;
  }

  let doc = emptyDiagram('flowchart');
  doc = addNode(doc, 'stadium', { label: 'Start' });
  doc = addNode(doc, 'rectangle', { label: 'Krok' });
  doc = connect(doc, doc.nodes[0].id, doc.nodes[1].id);
  return doc;
}
