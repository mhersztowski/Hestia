/**
 * Weryfikacja zewnętrzna: czy to, co zapisujemy, przechodzi przez parser
 * samego Mermaida. Nasze testy sprawdzają model; ten sprawdza rzeczywistość.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import mermaid from 'mermaid';
import { mermaidFormat } from '@hestia/ui-devtools/diagrams';

const SOURCE = [
  'flowchart TB',
  '    %% ===== KSZTALTY WEZLOW =====',
  '    A[Prostokat]',
  '    B(Zaokraglony)',
  '    C([Stadion])',
  '    D[[Podprogram]]',
  '    E[(Baza danych)]',
  '    F((Okrag))',
  '    G>Choragiewka]',
  '    H{Romb}',
  '    I{{Szesciokat}}',
  '    J[/Rownoleglobok/]',
  '    K[\\Rownoleglobok alt\\]',
  '    L[/Trapez\\]',
  '    M[\\Trapez alt/]',
  '    N(((Podwojny okrag)))',
  '    %% ===== RODZAJE POLACZEN =====',
  '    A --> B',
  '    B --- C',
  '    C -.-> D',
  '    D ==> E',
  '    E --o F',
  '    F --x G',
  '    G --Etykieta--> H',
  '    H -->|Etykieta inaczej| I',
  '    I -. kropki z tekstem .-> J',
  '    J --grube z tekstem--> K',
  '    K ~~~ L',
  '    L ----> M',
  '    M -...-> N',
  '    N <--> A2[Dwukierunkowa]',
  '    A2 o--o A3[Kolka]',
  '    A3 x--x A4[Krzyzyki]',
  '    Q1[Start] --> Q2[Krok] --> Q3[Koniec]',
  '    R1 & R2 --> R3 & R4',
].join('\n');

const STATE = [
  'stateDiagram-v2',
  '    direction LR',
  '    [*] --> Boot',
  '    Boot --> Praca : gotowe',
  '    state Praca {',
  '        direction TB',
  '        Pomiar --> Wysylka',
  '        Wysylka --> Pomiar',
  '    }',
  '    Praca --> [*]',
].join('\n');

/** Duży automat: zagnieżdżenie dwupoziomowe, pseudostany, regiony, stylowanie. */
const STATE_BIG = [
  'stateDiagram-v2',
  '    [*] --> Boot',
  '    state Connecting {',
  '        direction LR',
  '        [*] --> Wifi',
  '        state Wifi {',
  '            [*] --> Scan',
  '            Scan --> Join : SSID znaleziony',
  '            Join --> [*] : DHCP OK',
  '        }',
  '        Wifi --> Mqtt : siec gotowa',
  '        Mqtt --> [*] : CONNACK',
  '    }',
  '    Boot --> Connecting',
  '    state check_bat <<choice>>',
  '    Connecting --> check_bat',
  '    check_bat --> Running : bateria OK',
  '    check_bat --> LowPower : bateria slaba',
  '    state fork_state <<fork>>',
  '    state join_state <<join>>',
  '    Running --> fork_state',
  '    fork_state --> ReadSensors',
  '    fork_state --> ListenRadio',
  '    ReadSensors --> join_state',
  '    ListenRadio --> join_state',
  '    join_state --> Publish',
  '    state Diagnostics {',
  '        [*] --> WatchdogFeed',
  '        WatchdogFeed --> WatchdogFeed : co 1s',
  '        --',
  '        [*] --> LedBlink',
  '        LedBlink --> LedOff',
  '        LedOff --> LedBlink',
  '    }',
  '    Publish --> Diagnostics',
  '    Diagnostics --> [*]',
  '    LowPower --> [*]',
  '    classDef error fill:#f96,stroke:#900',
  '    class LowPower error',
  '    OtaUpdate:::error',
  '    Running --> OtaUpdate : nowy firmware',
  '    OtaUpdate --> Boot : reboot',
].join('\n');

/** Diagram klas: ciało klas, adnotacje, wszystkie rodzaje relacji, krotności. */
const CLASS_DIAGRAM = [
  'classDiagram',
  '    direction LR',
  '    class Zwierze {',
  '        <<abstract>>',
  '        +String imie',
  '        -int wiek',
  '        +opis()* String',
  '        +policz()$ int',
  '    }',
  '    class Pies {',
  '        +szczekaj() void',
  '    }',
  '    class Lot {',
  '        <<interface>>',
  '        +lec()',
  '    }',
  '    Zwierze <|-- Pies',
  '    Lot <|.. Pies',
  '    Zamowienie "1" --> "0..*" Pozycja : zawiera',
  '    Dom *-- Pokoj',
  '    Zespol o-- Osoba',
  '    Klient ..> Faktura : tworzy',
  '    %% komentarz do zachowania',
].join('\n');

/** Diagram sekwencji: bloki, aktywacje, notatki, wszystkie rodzaje strzałek. */
const SEQUENCE = [
  'sequenceDiagram',
  '    autonumber',
  '    participant A as Alicja',
  '    actor B',
  '    participant C',
  '    A->>+B: pytanie',
  '    B-->>-A: odpowiedz',
  '    A->C: bez grotu',
  '    A--)C: async',
  '    A-xC: utracony',
  '    Note right of B: notatka',
  '    Note over A,B: nad dwoma',
  '    loop Co minute',
  '        A->>B: ping',
  '        alt Zyje',
  '            B-->>A: pong',
  '        else Cisza',
  '            B-->>A: brak',
  '        end',
  '    end',
  '    par Rownolegle',
  '        A->>B: jeden',
  '    and',
  '        A->>C: dwa',
  '    end',
  '    opt Opcjonalnie',
  '        A->>B: moze',
  '    end',
  '    critical Polaczenie',
  '        A->>B: laczenie',
  '    option Timeout',
  '        A->>B: ponow',
  '    end',
  '    break Blad',
  '        A->>B: stop',
  '    end',
].join('\n');

/** Cykl życia uczestników i numeracja z parametrami. */
const SEQUENCE_LIFECYCLE = [
  'sequenceDiagram',
  '    autonumber 10 10',
  '    actor Op as Operator',
  '    participant VM as Lua VM',
  '    Op->>VM: reload',
  '    create participant S2 as Nowy lua_State',
  '    VM->>S2: lua_newstate()',
  '    S2-->>VM: init() OK',
  '    create actor Tmp as Task tymczasowy',
  '    VM->>Tmp: spawn',
  '    destroy Tmp',
  '    Tmp-->>VM: koniec',
  '    par watchdog',
  '        loop co 1s',
  '            alt limit',
  '                break ubity',
  '                    VM-->>Op: raport',
  '                end',
  '            else OK',
  '                S2-->>VM: tyka',
  '            end',
  '        end',
  '    and heartbeat',
  '        VM-)Op: status',
  '    end',
].join('\n');

/** Diagram ER: wszystkie liczebności, klucze, komentarze, relacja nieidentyfikująca. */
const ER = [
  'erDiagram',
  '    KLIENT ||--o{ ZAMOWIENIE : sklada',
  '    ZAMOWIENIE ||--|{ POZYCJA : zawiera',
  '    KLIENT }|..|{ ADRES : uzywa',
  '    PRODUKT |o--o| PROMOCJA : ma',
  '    MAGAZYN }o--o{ PRODUKT : przechowuje',
  '    KLIENT {',
  '        string numer PK',
  '        string nazwa',
  '        string email UK "unikalny"',
  '    }',
  '    ZAMOWIENIE {',
  '        int nr PK',
  '        string klientNumer FK',
  '        float suma',
  '    }',
  '    POZYCJA {',
  '        int ilosc',
  '        string produktId PK, FK',
  '    }',
].join('\n');

/** Mapa bitów: nagłówek TCP z polami jednobitowymi i zawijaniem wiersza. */
const PACKET = [
  'packet-beta',
  'title TCP Packet',
  '0-15: "Source Port"',
  '16-31: "Destination Port"',
  '32-63: "Sequence Number"',
  '64-95: "Acknowledgment Number"',
  '96-99: "Data Offset"',
  '100-105: "Reserved"',
  '106: "URG"',
  '107: "ACK"',
  '108: "PSH"',
  '109: "RST"',
  '110: "SYN"',
  '111: "FIN"',
  '112-127: "Window"',
  '128-143: "Checksum"',
  '144-159: "Urgent Pointer"',
].join('\n');

/** Tablica kanban: karty z metadanymi, etykiety z nawiasami i bez. */
const KANBAN = [
  'kanban',
  '  Todo',
  '    [Napisac dokumentacje]',
  '    docs[Wpis na blogu o nowym diagramie]',
  '  id6[W trakcie]',
  "    id7[Renderer dzialajacy we wszystkich przypadkach]@{ assigned: 'knsv', priority: 'High' }",
  '  id9[Gotowe do wdrozenia]',
  "    id8[Projekt gramatyki]@{ assigned: 'knsv' }",
  '  id10[Gotowe do testow]',
  "    id4[Testy parsera]@{ ticket: MC-2038, assigned: 'K.Sveidqvist', priority: 'High' }",
  "    id66[ostatnia pozycja]@{ priority: 'Very Low', assigned: 'knsv' }",
  '  id11[Zrobione]',
  '    id5[definicja getData]',
  "    id2[Tytul dluzszy niz 100 znakow]@{ ticket: MC-2036, priority: 'Very High' }",
].join('\n');

/** Harmonogram: znaczniki, zaleznosci after/until, kamien milowy. */
const GANTT = [
  'gantt',
  '    title Wdrozenie systemu',
  '    dateFormat YYYY-MM-DD',
  '    axisFormat %d.%m',
  '    excludes weekends',
  '    section Analiza',
  '        Zebranie wymagan :done, a1, 2024-01-08, 5d',
  '        Projekt techniczny :done, a2, after a1, 4d',
  '        Akceptacja klienta :crit, a3, after a2, 2d',
  '    section Wykonanie',
  '        Backend :active, b1, after a3, 12d',
  '        Frontend :active, b2, after a3, 15d',
  '        Integracja :b3, after b1 b2, 5d',
  '    section Wdrozenie',
  '        Testy odbiorcze :c1, after b3, 4d',
  '        Szkolenia :c2, after b3, until c3',
  '        Start produkcyjny :milestone, c3, 2024-03-01, 0d',
].join('\n');

/** Os wydarzen: sekcje, okresy z wieloma wydarzeniami, kontynuacja w nowej linii. */
const TIMELINE = [
  'timeline',
  '    title Dzieje sieci spolecznosciowych',
  '    section Poczatki',
  '        2002 : LinkedIn',
  '        2004 : Facebook : Google',
  '    section Rozkwit',
  '        2005 : YouTube',
  '        2006 : Twitter',
  '    section Era mobilna',
  '        2010 : Instagram : Pinterest',
  '        2021 : Koronawirus',
  '             : Zoom',
].join('\n');

/** C4: granice, warianty elementow, relacje kierunkowe i obustronne. */
const C4 = [
  'C4Context',
  '    title Kontekst systemu bankowosci',
  '    Enterprise_Boundary(b0, "Bank") {',
  '        Person(klientA, "Klient banku", "Posiada konto osobiste")',
  '        Person_Ext(klientB, "Klient zewnetrzny", "Korzysta przez partnera")',
  '        System_Boundary(b1, "Rdzen") {',
  '            System(bankowosc, "Bankowosc internetowa", "Pozwala obsluzyc konto")',
  '            SystemDb(rdzen, "System centralny", "Przechowuje dane kont")',
  '        }',
  '        SystemQueue(kolejka, "Szyna zdarzen", "Rozsyla powiadomienia")',
  '    }',
  '    System_Ext(poczta, "System pocztowy", "Wysyla powiadomienia")',
  '    Rel(klientA, bankowosc, "Uzywa", "HTTPS")',
  '    Rel(bankowosc, rdzen, "Czyta i zapisuje", "JDBC")',
  '    BiRel(bankowosc, kolejka, "Wymienia zdarzenia", "AMQP")',
  '    Rel_Back(poczta, klientA, "Wysyla listy do")',
  '    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")',
].join('\n');

/** C4 kontenerow: technologia jako osobny argument. */
const C4_CONTAINER = [
  'C4Container',
  '    Container(api, "API", "Java, Spring Boot", "Obsluguje zadania")',
  '    ContainerDb(db, "Baza", "PostgreSQL", "Przechowuje dane")',
  '    ContainerQueue(mq, "Kolejka", "RabbitMQ")',
  '    Container_Ext(zewn, "System partnera", "REST")',
  '    Rel(api, db, "Czyta", "JDBC")',
].join('\n');

beforeAll(() => {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
});

describe('układ zapisany we front matterze', () => {
  /**
   * Blok `---` z pozycjami jest naszym dodatkiem do składni. Mermaid musi go
   * przyjąć, bo inaczej ułożenie diagramu w edytorze psułoby jego render
   * wszędzie indziej — na GitHubie, w Obsidianie, w podglądzie.
   */
  it('diagram z pozycjami nadal parsuje się Mermaidem', async () => {
    const doc = mermaidFormat.parse(SOURCE).document;
    doc.nodes.forEach((node, i) => {
      node.position = { x: 100 * (i % 4), y: 80 * Math.floor(i / 4) };
    });

    await expect(mermaid.parse(mermaidFormat.serialize(doc))).resolves.toBeTruthy();
  });

  it('diagram stanów z ramkami grup nadal parsuje się Mermaidem', async () => {
    const doc = mermaidFormat.parse(STATE).document;
    doc.nodes.forEach((node, i) => {
      node.position = { x: 40 * i, y: 60 * i };
    });
    doc.groups.forEach((group) => {
      group.position = { x: 10, y: 10 };
      group.size = { width: 320, height: 240 };
    });

    await expect(mermaid.parse(mermaidFormat.serialize(doc))).resolves.toBeTruthy();
  });

  it('pozycje nie kolidują z tytułem we front matterze', async () => {
    const zTytulem = ['---', 'title: Algorytm', '---', SOURCE].join('\n');
    const doc = mermaidFormat.parse(zTytulem).document;
    doc.nodes[0].position = { x: 5, y: 5 };

    const zapis = mermaidFormat.serialize(doc);
    expect(zapis).toContain('title: Algorytm');
    await expect(mermaid.parse(zapis)).resolves.toBeTruthy();
  });
});

describe('zapis przechodzi przez parser Mermaida', () => {
  it('źródło wejściowe jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(SOURCE)).resolves.toBeTruthy();
  });

  it('flowchart po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(SOURCE).document);
    console.log('----- ZAPIS FLOWCHART -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('flowchart po dwóch zapisach (edycja po edycji)', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(SOURCE).document);
    const twice = mermaidFormat.serialize(mermaidFormat.parse(once).document);
    await expect(mermaid.parse(twice)).resolves.toBeTruthy();
    expect(twice).toBe(once);
  });

  it('duży automat: źródło jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(STATE_BIG)).resolves.toBeTruthy();
  });

  it('duży automat po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(STATE_BIG).document);
    console.log('----- ZAPIS DUZY AUTOMAT -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('duży automat po dwóch zapisach jest stabilny', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(STATE_BIG).document);
    const twice = mermaidFormat.serialize(mermaidFormat.parse(once).document);
    expect(twice).toBe(once);
  });

  it('C4: źródło jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(C4)).resolves.toBeTruthy();
  });

  it('C4 po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(C4).document);
    console.log('----- ZAPIS C4 -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('C4 po dwóch zapisach jest stabilny', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(C4).document);
    expect(mermaidFormat.serialize(mermaidFormat.parse(once).document)).toBe(once);
  });

  it('C4 kontenerów: technologia przeżywa zapis', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(C4_CONTAINER).document);
    console.log('----- ZAPIS C4 KONTENERY -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
    expect(written).toContain('Container(api, "API", "Java, Spring Boot", "Obsluguje zadania")');
  });

  it('oś wydarzeń: źródło jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(TIMELINE)).resolves.toBeTruthy();
  });

  it('oś wydarzeń po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(TIMELINE).document);
    console.log('----- ZAPIS TIMELINE -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('oś wydarzeń po dwóch zapisach jest stabilna', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(TIMELINE).document);
    expect(mermaidFormat.serialize(mermaidFormat.parse(once).document)).toBe(once);
  });

  it('harmonogram: źródło jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(GANTT)).resolves.toBeTruthy();
  });

  it('harmonogram po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(GANTT).document);
    console.log('----- ZAPIS GANTT -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('harmonogram po dwóch zapisach jest stabilny', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(GANTT).document);
    expect(mermaidFormat.serialize(mermaidFormat.parse(once).document)).toBe(once);
  });

  it('tablica kanban: źródło jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(KANBAN)).resolves.toBeTruthy();
  });

  it('tablica kanban po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(KANBAN).document);
    console.log('----- ZAPIS KANBAN -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('tablica kanban po dwóch zapisach jest stabilna', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(KANBAN).document);
    expect(mermaidFormat.serialize(mermaidFormat.parse(once).document)).toBe(once);
  });

  it('mapa bitów: źródło jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(PACKET)).resolves.toBeTruthy();
  });

  it('mapa bitów po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(PACKET).document);
    console.log('----- ZAPIS PAKIET -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('mapa bitów po dwóch zapisach jest stabilna', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(PACKET).document);
    expect(mermaidFormat.serialize(mermaidFormat.parse(once).document)).toBe(once);
  });

  it('ER: źródło jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(ER)).resolves.toBeTruthy();
  });

  it('ER po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(ER).document);
    console.log('----- ZAPIS ER -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('ER po dwóch zapisach jest stabilny', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(ER).document);
    expect(mermaidFormat.serialize(mermaidFormat.parse(once).document)).toBe(once);
  });

  it('sekwencja z cyklem życia: źródło jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(SEQUENCE_LIFECYCLE)).resolves.toBeTruthy();
  });

  it('sekwencja z cyklem życia po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(SEQUENCE_LIFECYCLE).document);
    console.log('----- ZAPIS CYKL ZYCIA -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('sekwencja z cyklem życia po dwóch zapisach jest stabilna', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(SEQUENCE_LIFECYCLE).document);
    expect(mermaidFormat.serialize(mermaidFormat.parse(once).document)).toBe(once);
  });

  it('sekwencja: źródło jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(SEQUENCE)).resolves.toBeTruthy();
  });

  it('sekwencja po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(SEQUENCE).document);
    console.log('----- ZAPIS SEKWENCJA -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('sekwencja po dwóch zapisach jest stabilna', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(SEQUENCE).document);
    const twice = mermaidFormat.serialize(mermaidFormat.parse(once).document);
    expect(twice).toBe(once);
  });

  it('diagram klas: źródło jest poprawne (kontrola testu)', async () => {
    await expect(mermaid.parse(CLASS_DIAGRAM)).resolves.toBeTruthy();
  });

  it('diagram klas po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(CLASS_DIAGRAM).document);
    console.log('----- ZAPIS KLASY -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });

  it('diagram klas po dwóch zapisach jest stabilny', async () => {
    const once = mermaidFormat.serialize(mermaidFormat.parse(CLASS_DIAGRAM).document);
    const twice = mermaidFormat.serialize(mermaidFormat.parse(once).document);
    expect(twice).toBe(once);
  });

  it('diagram stanów po naszym zapisie', async () => {
    const written = mermaidFormat.serialize(mermaidFormat.parse(STATE).document);
    console.log('----- ZAPIS STANY -----\n' + written);
    await expect(mermaid.parse(written)).resolves.toBeTruthy();
  });
});
