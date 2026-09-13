import { describe, it, expect, vi } from 'vitest';
import { loadCallables, describeSource, type UmlProjectSource } from './umlProjectSource';

const project = (owner: string, method: string) => ({
  name: `projekt-${owner}`,
  diagrams: [{
    nodes: [{
      data: {
        kind: 'class', name: owner,
        members: [{ kind: 'method', text: `+ static ${method}(a: string): void` }],
      },
    }],
  }],
});

function source(over: Partial<UmlProjectSource> = {}): UmlProjectSource {
  return {
    list: async () => [{ id: 'a.umlproj.json', label: 'a' }],
    load: async (id) => (id === 'a.umlproj.json' ? project('Api', 'load') : null),
    ...over,
  };
}

describe('loadCallables', () => {
  it('bez źródła nie ma funkcji — i nie ma wyjątku', () => {
    // Host, który nie podłączył UML-a, jest przypadkiem normalnym, a nie
    // awarią: edytor bloczkowy działa wtedy na samych bloczkach standardowych.
    return expect(loadCallables(undefined, ['a.umlproj.json'])).resolves.toEqual([]);
  });

  it('bez wybranych projektów nie pyta źródła', async () => {
    const list = vi.fn(async () => []);
    const load = vi.fn(async () => null);
    await loadCallables(source({ list, load }), []);
    expect(load).not.toHaveBeenCalled();
  });

  it('wyciąga metody statyczne z wybranych projektów', async () => {
    const callables = await loadCallables(source(), ['a.umlproj.json']);
    expect(callables.map((c) => c.callee)).toEqual(['Api.load']);
  });

  it('projekt nie do odczytania pomijamy, reszta zostaje', async () => {
    // Jeden zepsuty plik nie może odciąć bloczków ze wszystkich pozostałych.
    const s = source({
      load: async (id) => (id === 'ok.umlproj.json' ? project('Fs', 'read') : null),
    });
    const callables = await loadCallables(s, ['zly.umlproj.json', 'ok.umlproj.json']);
    expect(callables.map((c) => c.callee)).toEqual(['Fs.read']);
  });

  it('wyjątek przy jednym projekcie nie przerywa wczytywania pozostałych', async () => {
    const s = source({
      load: async (id) => {
        if (id === 'bum.umlproj.json') throw new Error('sieć padła');
        return project('Fs', 'read');
      },
    });
    const callables = await loadCallables(s, ['bum.umlproj.json', 'ok.umlproj.json']);
    expect(callables.map((c) => c.callee)).toEqual(['Fs.read']);
  });

  it('ta sama funkcja z dwóch projektów pojawia się raz', async () => {
    // Diagramy bywają kopiowane między projektami; podwójny bloczek o tej samej
    // nazwie nie niesie informacji, a przybornik robi się nieczytelny.
    const s = source({ load: async () => project('Api', 'load') });
    const callables = await loadCallables(s, ['a.umlproj.json', 'b.umlproj.json']);
    expect(callables).toHaveLength(1);
  });
});

describe('describeSource', () => {
  it('brak źródła nazywa się wprost', () => {
    // Puste okno bez wyjaśnienia wygląda jak awaria wczytywania.
    expect(describeSource(undefined)).toMatch(/podłączon/i);
  });

  it('źródło bez własnego opisu dostaje neutralny', () => {
    expect(describeSource(source())).toBeTruthy();
  });

  it('źródło z opisem podaje swój', () => {
    expect(describeSource(source({ describe: () => 'serwer produkcyjny' })))
      .toBe('serwer produkcyjny');
  });
});
