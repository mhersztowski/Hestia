/**
 * Stan złożony jest JEDNYM bytem, a cykl nie może rozdmuchiwać układu.
 *
 * Dwie regresje z realnego diagramu automatu ESP32:
 *
 *  1. `state Connecting { … }` to stan, do którego prowadzą przejścia
 *     (`Boot --> Connecting`), i jednocześnie pojemnik na stany wewnętrzne.
 *     Parser tworzył z tego DWA elementy o tym samym identyfikatorze — węzeł i
 *     grupę. React Flow dostawał zduplikowane id i diagram rozjeżdżał się na
 *     pojedyncze kreski.
 *
 *  2. Powroty (`DeepSleep --> Boot`, `Error --> Boot`) tworzą cykle. Ranking
 *     warstw podbijał je w kółko, więc `Boot` — drugi stan od początku —
 *     lądował na warstwie kilkunastej, tysiące pikseli niżej.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from '../formats/mermaid';
import { autoLayout, computeRanks } from './layout';
import { toFlowNodes } from '../editor/flowBridge';

const AUTOMAT = `stateDiagram-v2
    [*] --> Boot
    Boot --> Config : brak konfiguracji
    Boot --> Connecting : konfiguracja OK
    Config --> Connecting : zapisano ustawienia
    state Connecting {
        [*] --> WifiConnect
        WifiConnect --> MqttConnect : WiFi OK
        MqttConnect --> [*] : MQTT OK
    }
    Connecting --> Running : połączono
    Connecting --> Error : timeout
    state Running {
        [*] --> Idle
        Idle --> Measuring : timer 60s
        Measuring --> Publishing : dane gotowe
        Publishing --> Idle : ACK
    }
    Running --> DeepSleep : bateria < 20%
    DeepSleep --> Boot : wakeup
    Error --> Boot : watchdog reset`;

const parsed = () => mermaidFormat.parse(AUTOMAT).document;

describe('stan złożony to jeden byt', () => {
  it('nie powstaje węzeł o identyfikatorze grupy', () => {
    const doc = parsed();
    const groupIds = new Set(doc.groups.map((g) => g.id));
    const collisions = doc.nodes.filter((n) => groupIds.has(n.id)).map((n) => n.id);
    expect(collisions).toEqual([]);
  });

  it('przejścia do stanu złożonego wskazują na grupę', () => {
    const doc = parsed();
    expect(doc.edges.some((e) => e.source === 'Boot' && e.target === 'Connecting')).toBe(true);
    expect(doc.edges.some((e) => e.source === 'Connecting' && e.target === 'Running')).toBe(true);
  });

  it('widok React Flow nie ma zduplikowanych identyfikatorów', () => {
    const ids = toFlowNodes(autoLayout(parsed())).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('kolejność deklaracji nie ma znaczenia — grupa może wystąpić przed przejściem', () => {
    const doc = mermaidFormat.parse([
      'stateDiagram-v2',
      '  state Praca {',
      '    [*] --> Krok',
      '  }',
      '  [*] --> Praca',
    ].join('\n')).document;
    expect(doc.nodes.some((n) => n.id === 'Praca')).toBe(false);
    expect(doc.groups.map((g) => g.id)).toEqual(['Praca']);
    expect(doc.edges.some((e) => e.target === 'Praca')).toBe(true);
  });

  it('round-trip zachowuje stan złożony jako grupę, nie dubluje go', () => {
    const once = mermaidFormat.serialize(parsed());
    const twice = mermaidFormat.parse(once).document;
    expect(twice.groups.map((g) => g.id).sort()).toEqual(['Connecting', 'Running']);
    expect(twice.nodes.some((n) => n.id === 'Connecting')).toBe(false);
  });
});

describe('cykle nie rozdmuchują warstw', () => {
  it('powrót do stanu początkowego nie spycha go w dół', () => {
    // Boot jest tuż za `[*]`, więc musi zostać przy górze mimo `DeepSleep --> Boot`.
    const doc = parsed();
    const top = doc.nodes.filter((n) => !n.parentId).map((n) => n.id);
    const edges = doc.edges
      .filter((e) => top.includes(e.source) || doc.groups.some((g) => g.id === e.source))
      .map((e) => ({ source: e.source, target: e.target }));
    const ranks = computeRanks([...top, ...doc.groups.map((g) => g.id)], edges);
    expect(ranks.get('Boot')).toBeLessThanOrEqual(2);
  });

  it('prosty cykl dwóch węzłów daje warstwy 0 i 1', () => {
    const ranks = computeRanks(['A', 'B'], [{ source: 'A', target: 'B' }, { source: 'B', target: 'A' }]);
    expect([ranks.get('A'), ranks.get('B')]).toEqual([0, 1]);
  });

  it('diagram mieści się w rozsądnej wysokości', () => {
    const doc = autoLayout(parsed());
    const ys = [
      ...doc.nodes.filter((n) => !n.parentId).map((n) => n.position!.y),
      ...doc.groups.map((g) => g.position!.y + (g.size?.height ?? 0)),
    ];
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2000);
  });

  it('elementy dzielące warstwę są rozsunięte w poziomie', () => {
    // `Connecting --> Running` i `Connecting --> Error` rozgałęziają przepływ,
    // więc `Running` (grupa) i `Error` (węzeł) trafiają na tę samą warstwę i
    // nie mogą się przykrywać. Miara musi obejmować grupy — one też zajmują
    // miejsce w warstwie.
    const doc = autoLayout(parsed());
    const error = doc.nodes.find((n) => n.id === 'Error')!.position!;
    const running = doc.groups.find((g) => g.id === 'Running')!.position!;

    expect(Math.abs(error.y - running.y)).toBeLessThan(60);   // ta sama warstwa
    expect(Math.abs(error.x - running.x)).toBeGreaterThan(100); // ale nie na sobie
  });

  it('kolejne warstwy idą w dół, bez zapadania się na siebie', () => {
    const doc = autoLayout(parsed());
    const y = (id: string) => doc.nodes.find((n) => n.id === id)?.position!.y
      ?? doc.groups.find((g) => g.id === id)!.position!.y;
    expect(y('Boot')).toBeLessThan(y('Config'));
    expect(y('Config')).toBeLessThan(y('Connecting'));
    expect(y('Connecting')).toBeLessThan(y('Running'));
  });
});
