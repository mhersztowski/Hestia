/**
 * registry.ts — biblioteka zjawisk, czyli druga droga do modelu.
 *
 * Zasada dokumentu jako jedynego źródła prawdy („zmień wzór w wykładzie, zmieni
 * się symulacja") jest mocna, ale ma granicę, o którą łatwo się potknąć:
 * **liczba równań bywa parametrem zjawiska**. Dziesięć ciał oddziałujących
 * grawitacyjnie to sześćdziesiąt równań pierwszego rzędu, a autor dokumentu nie
 * napisze ich ręcznie — i nie powinien, bo nie ma tam nic do zobaczenia poza
 * powtórzeniem tej samej postaci.
 *
 * Rejestr jest odpowiedzią, ale **nie drugim systemem**: wpis zwraca zwykły
 * `PhenomenonModel`, więc widoki, panel parametrów, niezmienniki i zadania
 * pracują na nim bez jednej linijki wiedzy o tym, skąd przyszedł. Gdyby model
 * z biblioteki miał własny interfejs, każdy widok musiałby znać dwa przypadki.
 *
 * Rozróżnienie, które w tym module niesie najwięcej: **opcje** kształtują model
 * (ile ciał, czy przybliżać małe kąty) i wymagają przebudowy, a **parametry**
 * to suwaki — zmieniają wynik, nie strukturę. Wrzucenie ich do jednego worka
 * skończyłoby się przebudową modelu przy każdym ruchu suwaka.
 */
import type { PhenomenonModel } from '../graph/compileGraph';

export interface ModelSpec {
  /** Nazwa używana w bloku `sim` jako `"model": "…"`. */
  name: string;
  /** Jedno zdanie do katalogu i do komunikatu o nieznanej nazwie. */
  summary: string;
  /**
   * Nazwy kluczy, które są **opcjami**, a nie parametrami.
   *
   * Blok `sim` jest płaski: `{"model": "wahadlo", "smallAngle": true, "L": "2 m"}`.
   * Żeby dało się go tak pisać, ktoś musi wiedzieć, że `smallAngle` kształtuje
   * model, a `L` jest suwakiem — i wie to wyłącznie sam wpis. Bez tej listy
   * opcja trafiłaby do nadpisań parametrów i została zgłoszona jako literówka.
   */
  options?: string[];
  /**
   * Buduje model dla zadanych opcji.
   *
   * Opcje są **strukturalne** — lista ciał, wariant przybliżenia. Wartości
   * liczbowe (masy, długości) należą do parametrów modelu i nie przechodzą tędy.
   */
  build: (options: Record<string, unknown>) => PhenomenonModel;
}

const registry = new Map<string, ModelSpec>();

/**
 * Dodaje zjawisko do biblioteki; zwraca funkcję wyrejestrowującą.
 *
 * Wyrejestrowanie jest po to, żeby testy i przeładowanie modułu w trybie dev
 * nie zostawiały po sobie wpisów — nie po to, żeby ktokolwiek usuwał zjawiska
 * w trakcie pracy dokumentu.
 */
export function registerModel(spec: ModelSpec): () => void {
  registry.set(spec.name, spec);
  return () => { registry.delete(spec.name); };
}

/** Nazwy opcji zjawiska — potrzebne, by odsiać je od nadpisań parametrów. */
export function modelOptionNames(name: string): string[] {
  return registry.get(name)?.options ?? [];
}

/** Wszystkie znane zjawiska — z tego powstaje katalog i podpowiedzi w edytorze. */
export function knownModels(): ModelSpec[] {
  return [...registry.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

export interface BuiltModel {
  model?: PhenomenonModel;
  issues: string[];
}

/**
 * Buduje zarejestrowany model.
 *
 * Błędy wracają jako `issues`, a nie jako wyjątek: blok w dokumencie ma pokazać,
 * co jest nie tak, a nie zniknąć razem z resztą strony. Literówka w nazwie
 * dostaje w odpowiedzi **listę nazw znanych** — to jest ta informacja, której
 * autor w tym momencie potrzebuje.
 */
export function buildModel(name: string, options: Record<string, unknown> = {}): BuiltModel {
  const spec = registry.get(name);
  if (!spec) {
    const znane = knownModels().map((m) => m.name).join(', ');
    return {
      issues: [`Nie znam zjawiska „${name}". Biblioteka zna: ${znane || '(nic — nie zarejestrowano żadnego)'}.`],
    };
  }

  try {
    const model = spec.build(options);
    return { model, issues: model.issues };
  } catch (error) {
    return { issues: [`Nie udało się zbudować zjawiska „${name}": ${(error as Error).message}`] };
  }
}
