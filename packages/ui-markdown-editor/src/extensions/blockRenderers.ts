/**
 * blockRenderers.ts — punkt rejestracji zewnętrznych widoków bloków kodu.
 *
 * Bloki z własnym widokiem (diagram, wzór, symulacja) różnią się od zwykłego
 * bloku kodu tylko tym, **co pokazują zamiast tekstu**. Do tej pory lista takich
 * języków była wpisana w `CodeBlockWithLang`, więc każdy nowy typ wymagał
 * zmiany w edytorze — a to znaczyło, że bloki musiałyby mieszkać w
 * `mycastle-web` razem z nim.
 *
 * Rejestr odwraca tę zależność: pakiet z blokami rejestruje swój widok przy
 * imporcie, a edytor go tylko woła. Ten sam wzorzec, co `diagramFormats` w
 * `web-devtools` — formaty rejestrują się same, host nic o nich nie wie.
 *
 * Kontrakt jest celowo wąski: renderer dostaje treść bloku, jego infostring i
 * sposób zapisu zmian. Nie dostaje edytora ani ProseMirror-a, więc pakiet z
 * blokami nie musi zależeć od TipTapa, dopóki nie potrzebuje własnego węzła.
 */
import type { ComponentType, ReactNode } from 'react';

export interface BlockRendererProps {
  /** Treść bloku — to, co stoi między znacznikami ```. */
  code: string;
  /** Pełny infostring, np. `mermaid`, `formula:pendulum-ode`, `sim:pendulum`. */
  language: string;
  /**
   * Zapis zmienionej treści; brak znaczy blok tylko do odczytu.
   *
   * Renderer może zmieniać treść (edytor graficzny diagramu, panel parametrów
   * symulacji), a zapisem zajmuje się edytor — dzięki temu zmiana trafia do
   * dokumentu tą samą drogą co pisanie z klawiatury.
   */
  onChange?: (next: string) => void;
  /**
   * Zapis **infostringu** bloku; brak znaczy, że nie da się go zmienić.
   *
   * Osobno od `onChange`, bo to inna rzecz niż treść: blok diagramu trzyma tu
   * swój tryb (` ```mermaid:view `), a bloki `automate` i `pscript` — swoje
   * ustawienia. Bez tego kanału ustawienie bloku żyłoby wyłącznie w stanie
   * komponentu i ginęło przy każdym otwarciu dokumentu.
   */
  onLanguageChange?: (next: string) => void;
  /**
   * Pozostałe bloki kodu tego dokumentu.
   *
   * Pierwszy zewnętrzny klient rejestru wymusił to rozszerzenie kontraktu:
   * blok `sim` buduje symulację ze wzorów, które stoją **gdzie indziej w tym
   * samym dokumencie**, więc sama treść bloku mu nie wystarcza. Funkcja, a nie
   * tablica, bo dokument zmienia się przy każdym naciśnięciu klawisza i
   * odczyt ma być leniwy.
   */
  documentBlocks?: () => Array<{ language: string; code: string }>;
  /**
   * Zapis treści **innego** bloku dokumentu, wskazanego infostringiem.
   *
   * Dla bloków, które sterują czymś zapisanym gdzie indziej — rysunek warunku
   * początkowego powstaje przy bloku `field`, ale należy do `formula`.
   */
  onBlockChange?: (language: string, next: string) => void;
  /**
   * Fabryka workera obliczeń.
   *
   * Bloki z ciężkim modelem (symulacja, skrypt) liczą poza wątkiem interfejsu,
   * żeby suwak nadążał za palcem. Host ją dostarcza, bo tylko on wie, jak
   * zbudować workera w swoim bundlerze.
   */
  workerFactory?: () => Worker;
  /**
   * Zwyczajny widok bloku kodu.
   *
   * Renderer wywołuje go, gdy użytkownik przełączy się na tekst źródłowy.
   * Funkcja, a nie element, bo widok surowy jest edytowalny i nie może
   * powstawać, dopóki nie jest potrzebny.
   */
  children: () => ReactNode;
}

export interface BlockRenderer {
  /** Nazwa do diagnostyki i wykrywania podwójnej rejestracji. */
  name: string;
  /** Czy ten renderer obsługuje dany infostring. */
  matches: (language: string) => boolean;
  Component: ComponentType<BlockRendererProps>;
}

const renderers: BlockRenderer[] = [];
const listeners = new Set<() => void>();

/**
 * Powiadomienie o zmianie rejestru.
 *
 * Bloki subskrybują je, bo rejestracja **nie musi zajść przed pierwszym
 * renderem**: moduł rejestrujący bywa ładowany asynchronicznie, a przy jednym
 * zepsutym imporcie pozostałe i tak mają dojść. Bez powiadomienia blok
 * zarejestrowany później zostałby na zawsze zwykłym kodem, mimo że jego widok
 * już istnieje.
 */
export function subscribeBlockRenderers(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Wersja rejestru — rośnie przy każdej zmianie; do `useSyncExternalStore`. */
let version = 0;
export function blockRenderersVersion(): number {
  return version;
}

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * Rejestruje widok bloku. Zwraca funkcję wyrejestrowującą.
 *
 * Powtórna rejestracja tej samej nazwy podmienia poprzedni wpis zamiast
 * dokładać drugi — przeładowanie modułu w trybie dev nie ma prawa zostawiać
 * duplikatów.
 */
export function registerBlockRenderer(renderer: BlockRenderer): () => void {
  const existing = renderers.findIndex((r) => r.name === renderer.name);
  if (existing >= 0) renderers[existing] = renderer;
  else renderers.push(renderer);
  notify();

  return () => {
    const index = renderers.findIndex((r) => r.name === renderer.name);
    if (index >= 0) {
      renderers.splice(index, 1);
      notify();
    }
  };
}

/** Widok dla danego infostringu; `undefined` znaczy zwykły blok kodu. */
export function rendererFor(language: string): BlockRenderer | undefined {
  if (!language) return undefined;
  // Ostatni zarejestrowany wygrywa — pozwala nadpisać widok wbudowany.
  for (let i = renderers.length - 1; i >= 0; i -= 1) {
    if (renderers[i].matches(language)) return renderers[i];
  }
  return undefined;
}

/** Lista zarejestrowanych widoków — do diagnostyki. */
export function registeredBlockRenderers(): readonly BlockRenderer[] {
  return renderers;
}
