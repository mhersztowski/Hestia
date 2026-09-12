/**
 * Układ diagramów ze stanami złożonymi (grupami).
 *
 * Regresja z realnego diagramu: węzły wewnątrz `state Running { … }` dostawały
 * pozycje globalne, a React Flow liczy pozycję dziecka **względem rodzica**.
 * Dzieci lądowały więc setki pikseli poza swoją ramką, obszar diagramu puchł do
 * absurdu i `fitView` oddalał widok do maksimum — diagram wyglądał na pusty.
 *
 * Stąd kontrakt: pozycja węzła z `parentId` jest lokalna, a grupa niesie własną
 * pozycję i rozmiar obejmujący dzieci.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from '../formats/mermaid';
import { emptyDiagram, type DiagramDocument } from './diagram';
import { autoLayout } from './layout';
import type { DiagramDocument } from './diagram';

/** Diagram zgłoszony przez użytkownika — dwa stany złożone i notatka. */
const REAL_DIAGRAM = `stateDiagram-v2
    [*] --> Boot

    Boot --> Config : brak konfiguracji
    Boot --> Connecting : konfiguracja OK

    Config --> Connecting : zapisano ustawienia

    state Connecting {
        [*] --> WifiConnect
        WifiConnect --> MqttConnect : WiFi OK
        MqttConnect --> [*] : MQTT OK
        WifiConnect --> WifiConnect : retry (max 5)
    }

    Connecting --> Running : połączono
    Connecting --> Error : timeout

    state Running {
        [*] --> Idle
        Idle --> Measuring : timer 60s
        Measuring --> Publishing : dane gotowe
        Publishing --> Idle : ACK
        Publishing --> Buffering : brak sieci
        Buffering --> Idle : zapisano do flash
    }

    Running --> DeepSleep : bateria < 20%
    DeepSleep --> Boot : wakeup

    Error --> Boot : watchdog reset

    note right of DeepSleep
        ESP32 deep sleep,
        wakeup co 15 min
    end note`;

function parsed(): DiagramDocument {
  return mermaidFormat.parse(REAL_DIAGRAM).document;
}

describe('parsowanie realnego diagramu', () => {
  it('rozpoznaje oba stany złożone', () => {
    expect(parsed().groups.map((g) => g.id).sort()).toEqual(['Connecting', 'Running']);
  });

  it('węzły wewnętrzne należą do właściwych grup', () => {
    const doc = parsed();
    const parentOf = (id: string) => doc.nodes.find((n) => n.id === id)?.parentId;
    expect(parentOf('WifiConnect')).toBe('Connecting');
    expect(parentOf('MqttConnect')).toBe('Connecting');
    expect(parentOf('Idle')).toBe('Running');
    expect(parentOf('Buffering')).toBe('Running');
    expect(parentOf('Boot')).toBeUndefined();
  });

  it('pętla własna (`WifiConnect --> WifiConnect`) nie gubi się', () => {
    const doc = parsed();
    expect(doc.edges.some((e) => e.source === 'WifiConnect' && e.target === 'WifiConnect')).toBe(true);
  });

  it('wieloliniowa notatka wraca przy zapisie w całości', () => {
    const out = mermaidFormat.serialize(parsed());
    expect(out).toContain('note right of DeepSleep');
    expect(out).toContain('ESP32 deep sleep,');
    expect(out).toContain('wakeup co 15 min');
    expect(out).toContain('end note');
  });

  it('opisy przejść przetrwały', () => {
    const doc = parsed();
    const labelOf = (s: string, t: string) => doc.edges.find((e) => e.source === s && e.target === t)?.label;
    expect(labelOf('Boot', 'Config')).toBe('brak konfiguracji');
    expect(labelOf('Running', 'DeepSleep')).toBe('bateria < 20%');
  });
});

describe('autoLayout z grupami', () => {
  it('pozycje wewnątrz grupy są lokalne — liczone od jej lewego górnego rogu', () => {
    const doc = autoLayout(parsed());
    const inside = doc.nodes.filter((n) => n.parentId === 'Running');

    expect(inside.length).toBeGreaterThan(0);
    for (const node of inside) {
      expect(node.position!.x, node.id).toBeGreaterThanOrEqual(0);
      expect(node.position!.y, node.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('grupa dostaje rozmiar obejmujący wszystkie swoje węzły', () => {
    const doc = autoLayout(parsed());
    const group = doc.groups.find((g) => g.id === 'Running')!;
    const inside = doc.nodes.filter((n) => n.parentId === 'Running');

    expect(group.size).toBeDefined();
    const maxX = Math.max(...inside.map((n) => n.position!.x));
    const maxY = Math.max(...inside.map((n) => n.position!.y));
    expect(group.size!.width).toBeGreaterThan(maxX);
    expect(group.size!.height).toBeGreaterThan(maxY);
  });

  it('grupy mają własną pozycję na płótnie i nie nachodzą na siebie', () => {
    const doc = autoLayout(parsed());
    const [a, b] = doc.groups.map((g) => g.position!);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    const separated = Math.abs(a.x - b.x) > 10 || Math.abs(a.y - b.y) > 10;
    expect(separated).toBe(true);
  });

  it('cały diagram mieści się w rozsądnym obszarze — inaczej fitView oddala do zera', () => {
    const doc = autoLayout(parsed());
    const xs = doc.nodes.filter((n) => !n.parentId).map((n) => n.position!.x);
    const ys = doc.nodes.filter((n) => !n.parentId).map((n) => n.position!.y);
    const groupXs = doc.groups.map((g) => g.position!.x);
    const groupYs = doc.groups.map((g) => g.position!.y);

    const width = Math.max(...xs, ...groupXs) - Math.min(...xs, ...groupXs);
    const height = Math.max(...ys, ...groupYs) - Math.min(...ys, ...groupYs);
    expect(width).toBeLessThan(4000);
    expect(height).toBeLessThan(4000);
  });

  it('nie nadpisuje pozycji ustawionych ręcznie', () => {
    const base = parsed();
    const target = base.nodes.find((n) => n.parentId === 'Running')!;
    target.position = { x: 5, y: 7 };
    const doc = autoLayout(base);
    expect(doc.nodes.find((n) => n.id === target.id)!.position).toEqual({ x: 5, y: 7 });
  });
});

describe('kierunek wnętrza grupy', () => {
  it('wnętrze biegnie tak samo jak diagram — pionowy diagram, pionowe wnętrza', () => {
    const doc = autoLayout(parsed());
    const inside = doc.nodes
      .filter((n) => n.parentId === 'Running' && n.shape === 'rectangle')
      .map((n) => n.position!);

    // Przy układzie TB kolejne stany schodzą w dół, a nie rozchodzą się w bok.
    const distinctY = new Set(inside.map((p) => p.y));
    expect(distinctY.size).toBeGreaterThan(1);
    expect(new Set(inside.map((p) => p.x)).size).toBeLessThan(distinctY.size);
  });

  it('grupa deklarująca własny kierunek ma pierwszeństwo', () => {
    const doc = autoLayout({
      ...parsed(),
      groups: parsed().groups.map((g) => (g.id === 'Running' ? { ...g, direction: 'LR' as const } : g)),
    });
    const inside = doc.nodes.filter((n) => n.parentId === 'Running' && n.shape === 'rectangle').map((n) => n.position!);
    expect(new Set(inside.map((p) => p.x)).size).toBeGreaterThan(1);
  });
});

/**
 * Przejścia, których końcem jest stan złożony.
 *
 * `Wifi --> Mqtt` łączy grupę ze stanem obok niej. Rzutowanie krawędzi na
 * poziom pojemnika szukało obu końców wyłącznie wśród węzłów, więc takie
 * przejście znikało z układu — wnętrze stanu złożonego traciło wszystkie
 * zależności i lądowało w jednym rzędzie, a strzałki biegły na krzyż.
 */
describe('krawędzie do stanu złożonego porządkują układ', () => {
  function automat(): DiagramDocument {
    const doc = emptyDiagram('state');
    doc.groups = [{ id: 'Connecting', label: 'Connecting' }, { id: 'Wifi', label: 'Wifi', parentId: 'Connecting' }];
    doc.nodes = [
      { id: 'Mqtt', label: 'Mqtt', shape: 'rectangle', parentId: 'Connecting' },
      { id: 'Koniec', label: '', shape: 'end', parentId: 'Connecting' },
      { id: 'Scan', label: 'Scan', shape: 'rectangle', parentId: 'Wifi' },
    ];
    doc.edges = [
      { id: 'e1', source: 'Wifi', target: 'Mqtt', lineStyle: 'solid', arrow: 'arrow' },
      { id: 'e2', source: 'Mqtt', target: 'Koniec', lineStyle: 'solid', arrow: 'arrow' },
    ];
    return doc;
  }

  it('grupa stoi PRZED stanem, do którego prowadzi przejście', () => {
    const doc = autoLayout(automat());
    const wifi = doc.groups.find((g) => g.id === 'Wifi')!.position!;
    const mqtt = doc.nodes.find((n) => n.id === 'Mqtt')!.position!;
    expect(wifi.y).toBeLessThan(mqtt.y);
  });

  it('dalsze ogniwo idzie jeszcze niżej', () => {
    const doc = autoLayout(automat());
    const mqtt = doc.nodes.find((n) => n.id === 'Mqtt')!.position!;
    const koniec = doc.nodes.find((n) => n.id === 'Koniec')!.position!;
    expect(mqtt.y).toBeLessThan(koniec.y);
  });

  it('w układzie poziomym grupa stoi na lewo od swojego następnika', () => {
    const doc = autoLayout({ ...automat(), direction: 'LR' });
    const wifi = doc.groups.find((g) => g.id === 'Wifi')!.position!;
    const mqtt = doc.nodes.find((n) => n.id === 'Mqtt')!.position!;
    expect(wifi.x).toBeLessThan(mqtt.x);
  });
});

/**
 * Kierunek wnętrza zagnieżdżonego stanu.
 *
 * `direction LR` postawiony w stanie złożonym dotyczy TYLKO jego zawartości.
 * Stan zagnieżdżony głębiej, który własnego kierunku nie deklaruje, wraca do
 * kierunku diagramu — tak robi Mermaid. Dziedziczenie po najbliższym rodzicu
 * kładło wnętrze `Wifi` poziomo, choć w podglądzie biegło w dół.
 */
describe('kierunek nie dziedziczy się po rodzicu-grupie', () => {
  function zagniezdzone(): DiagramDocument {
    const doc = emptyDiagram('state'); // diagram: TB
    doc.groups = [
      { id: 'Connecting', label: 'Connecting', direction: 'LR' },
      { id: 'Wifi', label: 'Wifi', parentId: 'Connecting' }, // bez własnego kierunku
    ];
    doc.nodes = [
      { id: 'Mqtt', label: 'Mqtt', shape: 'rectangle', parentId: 'Connecting' },
      { id: 'Scan', label: 'Scan', shape: 'rectangle', parentId: 'Wifi' },
      { id: 'Join', label: 'Join', shape: 'rectangle', parentId: 'Wifi' },
    ];
    doc.edges = [
      { id: 'e1', source: 'Wifi', target: 'Mqtt', lineStyle: 'solid', arrow: 'arrow' },
      { id: 'e2', source: 'Scan', target: 'Join', lineStyle: 'solid', arrow: 'arrow' },
    ];
    return doc;
  }

  it('stan z własnym `direction LR` układa zawartość poziomo', () => {
    const doc = autoLayout(zagniezdzone());
    const wifi = doc.groups.find((g) => g.id === 'Wifi')!.position!;
    const mqtt = doc.nodes.find((n) => n.id === 'Mqtt')!.position!;
    expect(wifi.x).toBeLessThan(mqtt.x);
  });

  it('zagnieżdżony stan bez `direction` układa zawartość pionowo (jak diagram)', () => {
    const doc = autoLayout(zagniezdzone());
    const scan = doc.nodes.find((n) => n.id === 'Scan')!.position!;
    const join = doc.nodes.find((n) => n.id === 'Join')!.position!;
    expect(scan.y).toBeLessThan(join.y);
    expect(scan.x).toBe(join.x);
  });
});
