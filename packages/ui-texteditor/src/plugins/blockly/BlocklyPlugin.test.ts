import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBlocklyPlugin } from './BlocklyPlugin';
import type {
  IPluginAPI, ToolbarContribution, ContextMenuContribution, CommandPaletteContribution,
} from '../../monaco/plugins/types';

/**
 * Atrapa hosta — **wierna, nie uprzejma** (docs/plugins.md §9).
 *
 * Najważniejsze: `commands.register` prefiksuje identyfikator dwukropkiem tak
 * jak prawdziwy host. Atrapa zapisująca surowe id przepuszczała kod, w którym
 * wpis menu wskazywał polecenie z kropką — przycisk istniał, dawał się kliknąć
 * i nie robił nic.
 */
function makeHost(pluginId = 'com.mycastle.blockly') {
  const commands = new Map<string, (...a: unknown[]) => unknown>();
  const toolbar: ToolbarContribution[] = [];
  const contextmenu: ContextMenuContribution[] = [];
  const palette: CommandPaletteContribution[] = [];
  const storage = new Map<string, unknown>();
  const warnings: string[] = [];
  const tabs: Array<{ uri: string; title: string }> = [];
  let modelHandler: ((uri: string) => void) | undefined;

  const api = {
    pluginId,
    editor: {
      onDidChangeModel: (cb: (uri: string) => void) => { modelHandler = cb; return { dispose() {} }; },
      onDidOpenDocument: () => ({ dispose() {} }),
      onDidChangeCursorPosition: () => ({ dispose() {} }),
      onDidSaveDocument: () => ({ dispose() {} }),
      onDidChangeContent: () => ({ dispose() {} }),
    },
    commands: {
      register: (id: string, handler: (...a: unknown[]) => unknown) => {
        commands.set(`${pluginId}:${id}`, handler);
        return { dispose() {} };
      },
      execute: async (id: string, ...a: unknown[]) => commands.get(id)?.(...a),
    },
    ui: {
      toolbar: { register: (i: ToolbarContribution) => { toolbar.push(i); return { dispose() {} }; } },
      statusbar: { register: () => ({ dispose() {}, update() {} }) },
      contextmenu: { register: (i: ContextMenuContribution) => { contextmenu.push(i); return { dispose() {} }; } },
      commandpalette: { register: (i: CommandPaletteContribution) => { palette.push(i); return { dispose() {} }; } },
      sidebar: { register: () => ({ dispose() {} }) },
      openSidebarPanel: () => {},
    },
    events: { on: () => ({ dispose() {} }), emit: () => {} },
    storage: {
      get: <T,>(k: string) => storage.get(k) as T | undefined,
      set: <T,>(k: string, v: T) => { storage.set(k, v); },
      delete: (k: string) => { storage.delete(k); },
    },
    logger: {
      info: () => {},
      warn: (m: string) => { warnings.push(m); },
      error: (m: string) => { warnings.push(m); },
    },
    openEditorTab: (o: { uri: string; title: string }) => { tabs.push(o); },
  } as unknown as IPluginAPI;

  return {
    api, commands, toolbar, contextmenu, palette, storage, warnings, tabs,
    openFile: (uri: string) => modelHandler?.(uri),
  };
}

let host: ReturnType<typeof makeHost>;
beforeEach(() => { host = makeHost(); });

/**
 * Czeka, aż warunek zajdzie.
 *
 * Otwarcie zakładki jest odroczone timerem, a komponent ładowany leniwie — to
 * dwa różne rodzaje oczekiwania i sztuczne zegary obsługują tylko pierwszy.
 * Pętla na prawdziwym zegarze jest tu prostsza niż mieszanie obu.
 */
async function until(condition: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`nie doczekałem się: ${label}`);
}

describe('manifest', () => {
  it('deklaruje punkty rozszerzenia, których używa', () => {
    // Host rysuje tylko to, co jest w `contributes`; wpis zarejestrowany bez
    // deklaracji nie pojawia się nigdzie i wygląda jak zignorowana wtyczka.
    const plugin = createBlocklyPlugin();
    expect(plugin.manifest.contributes).toEqual(
      expect.arrayContaining(['contextmenu', 'commandpalette', 'toolbar']),
    );
  });
});

describe('rejestracja', () => {
  it('każdy wpis interfejsu wskazuje **zarejestrowane** polecenie', async () => {
    // Test z §9 przewodnika: to jest ta pomyłka, która przechodzi wszystkie
    // pozostałe testy i nie działa w aplikacji.
    const plugin = createBlocklyPlugin();
    await plugin.activate(host.api);
    for (const item of [...host.toolbar, ...host.contextmenu]) {
      expect(host.commands.has(item.command), `${item.id} → ${item.command}`).toBe(true);
    }
    for (const item of host.palette) {
      expect(host.commands.has(item.command), item.title).toBe(true);
    }
  });

  it('menu kontekstowe ma pozycję otwarcia edytora i opcji pliku', () => {
    // „dla wszystkich zakładek" — host nie sprawdza `when`, więc obie pozycje
    // są zawsze widoczne, a rozstrzyga polecenie.
    return createBlocklyPlugin().activate(host.api).then(() => {
      const labels = host.contextmenu.map((i) => i.label);
      expect(labels.some((l) => /bloczk/i.test(l))).toBe(true);
      expect(labels.some((l) => /opcje/i.test(l))).toBe(true);
    });
  });
});

describe('otwieranie edytora bloczkowego', () => {
  const exec = (id: string) => host.api.commands.execute(`com.mycastle.blockly:${id}`);

  it('otwarcie zakładki jest odroczone o przejście pętli zdarzeń', async () => {
    // Bez odroczenia zakładka powstaje i natychmiast traci fokus na rzecz
    // pliku tekstowego, bo obsługa podwójnego kliknięcia w eksploratorze
    // ustawia aktywną zakładkę po powrocie z `await` (§4).
    vi.useFakeTimers();
    try {
      await createBlocklyPlugin().activate(host.api);
      host.openFile('/user/drive/a.cpp');
      await exec('open');
      expect(host.tabs).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dla obsługiwanego pliku otwiera zakładkę', async () => {
    const plugin = createBlocklyPlugin();
    await plugin.activate(host.api);
    host.openFile('/user/drive/a.cpp');
    await exec('open');
    await until(() => host.tabs.length > 0, 'otwarcia zakładki');
    expect(host.tabs[0].uri).toBe('blockly:///user/drive/a.cpp');
  });

  it('podpis zakładki mówi, jakim językiem jest plik', async () => {
    await createBlocklyPlugin().activate(host.api);
    host.openFile('/user/drive/a.cpp');
    await exec('open');
    await until(() => host.tabs.length > 0, 'otwarcia zakładki');
    expect(host.tabs[0].title).toContain('C++');
  });

  it('dla nieobsługiwanego pliku **mówi dlaczego**, zamiast milczeć', async () => {
    // Cichy `return` wygląda jak zepsuty przycisk (§10).
    await createBlocklyPlugin().activate(host.api);
    host.openFile('/user/drive/notatka.md');
    await exec('open');
    await until(() => host.warnings.length > 0, 'ostrzeżenia');
    expect(host.tabs).toHaveLength(0);
    expect(host.warnings.join(' ')).toMatch(/\.md|nie obsług/i);
  });

  it('bez otwartego pliku też mówi dlaczego', async () => {
    await createBlocklyPlugin().activate(host.api);
    await exec('open');
    expect(host.tabs).toHaveLength(0);
    expect(host.warnings.length).toBeGreaterThan(0);
  });
});

describe('deactivate', () => {
  it('kasuje odroczone otwarcie zakładki', async () => {
    // Zakładka otwarta po wyłączeniu wtyczki nie miałaby czym się odświeżać.
    const plugin = createBlocklyPlugin();
    await plugin.activate(host.api);
    host.openFile('/user/drive/a.ts');
    await host.api.commands.execute('com.mycastle.blockly:open');
    await plugin.deactivate?.();
    await new Promise((r) => setTimeout(r, 30));
    expect(host.tabs).toHaveLength(0);
  });
});
