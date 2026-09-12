/**
 * Składnia diagramu stanów, która wychodzi dopiero na dużych automatach:
 * klasa inline (`:::`), regiony współbieżne (`--`) i zagnieżdżenie dwupoziomowe.
 *
 * `OtaUpdate:::error` parser czytał jako „stan OtaUpdate z opisem `::error`" —
 * czyli nazwa stanu znikała z diagramu, a na jej miejscu pojawiał się fragment
 * składni stylowania.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from './index';

const parse = (t: string) => mermaidFormat.parse(t).document;
const serialize = (t: string) => mermaidFormat.serialize(parse(t));

describe('klasa inline `:::`', () => {
  const SOURCE = 'stateDiagram-v2\n  OtaUpdate:::error\n  Running --> OtaUpdate : nowy firmware';

  it('nazwa stanu zostaje nazwą, a nie opisem', () => {
    const node = parse(SOURCE).nodes.find((n) => n.id === 'OtaUpdate');
    expect(node).toBeDefined();
    expect(node!.label).not.toContain('::');
  });

  it('klasa trafia do modelu', () => {
    expect(parse(SOURCE).nodes.find((n) => n.id === 'OtaUpdate')!.className).toBe('error');
  });

  it('nie powstaje węzeł o nazwie z fragmentu składni', () => {
    for (const node of parse(SOURCE).nodes) expect(node.id).not.toContain(':');
  });

  it('klasa wraca przy zapisie', () => {
    expect(serialize(SOURCE)).toContain('OtaUpdate:::error');
  });
});

describe('regiony współbieżne', () => {
  const SOURCE = [
    'stateDiagram-v2',
    '  state Diagnostics {',
    '    [*] --> WatchdogFeed',
    '    --',
    '    [*] --> LedBlink',
    '  }',
  ].join('\n');

  it('separator regionów przeżywa zapis', () => {
    expect(serialize(SOURCE)).toContain('--');
  });

  it('separator nie tworzy przejścia ani węzła', () => {
    const doc = parse(SOURCE);
    expect(doc.nodes.map((n) => n.id)).not.toContain('--');
    expect(doc.edges.every((e) => e.source !== '--' && e.target !== '--')).toBe(true);
  });

  it('separator zostaje wewnątrz bloku, nie ucieka na koniec pliku', () => {
    const lines = serialize(SOURCE).split('\n');
    const sep = lines.findIndex((l) => l.trim() === '--');
    const close = lines.findIndex((l) => l.trim() === '}');
    expect(sep).toBeGreaterThan(0);
    expect(sep).toBeLessThan(close);
  });
});

describe('zagnieżdżenie dwupoziomowe', () => {
  const SOURCE = [
    'stateDiagram-v2',
    '  state Connecting {',
    '    direction LR',
    '    [*] --> Wifi',
    '    state Wifi {',
    '      [*] --> Scan',
    '      Scan --> Join : SSID',
    '    }',
    '    Wifi --> Mqtt : sieć gotowa',
    '  }',
  ].join('\n');

  it('wewnętrzna grupa zna swojego rodzica', () => {
    const doc = parse(SOURCE);
    expect(doc.groups.find((g) => g.id === 'Wifi')!.parentId).toBe('Connecting');
  });

  it('stany trafiają do właściwego poziomu', () => {
    const doc = parse(SOURCE);
    expect(doc.nodes.find((n) => n.id === 'Scan')!.parentId).toBe('Wifi');
    expect(doc.nodes.find((n) => n.id === 'Mqtt')!.parentId).toBe('Connecting');
  });

  it('zagnieżdżenie przeżywa zapis', () => {
    const again = parse(serialize(SOURCE));
    expect(again.groups.find((g) => g.id === 'Wifi')?.parentId).toBe('Connecting');
    expect(again.nodes.find((n) => n.id === 'Scan')?.parentId).toBe('Wifi');
  });
});
