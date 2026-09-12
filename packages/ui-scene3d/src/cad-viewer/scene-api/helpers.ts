/**
 * helpers.ts — to, co w każdej scenie liczy się tak samo.
 *
 * **Nie ma tu klasy bazowej i to jest decyzja, nie przeoczenie.** Adapter sceny
 * opakowuje model, który już istnieje — `EntityRegistry`, `SceneGraph`, drzewo
 * cech — i sam nie trzyma żadnego stanu. Klasa bazowa z własnym drzewem byłaby
 * trzecim miejscem, w którym mieszka ta sama informacja, i pierwszym, które się
 * rozjedzie, gdy ktoś zmieni model z pominięciem adaptera.
 *
 * Zostają więc funkcje: biorą węzeł albo scenę i liczą to, czego nie ma sensu
 * pisać dwa razy.
 */
import type { INode, IScene } from './types';

/** Ścieżka od korzenia, np. `Warstwa 0/linia-3`. Korzeń ma ścieżkę pustą. */
export function sciezkaWezla(node: INode): string {
  const czesci: string[] = [];
  for (let biezacy: INode | null = node; biezacy; biezacy = biezacy.getParent()) {
    // Korzeń nie wchodzi do ścieżki: nazwa „scene/…" niczego nie rozróżnia,
    // a wymuszałaby przedrostek w każdym zapytaniu.
    if (!biezacy.getParent()) break;
    czesci.unshift(biezacy.getName());
  }
  return czesci.join('/');
}

/** Wszystkie węzły w kolejności drzewa, bez korzenia. */
export function obejdzDrzewo(root: INode): INode[] {
  const out: INode[] = [];
  const zejdz = (n: INode) => {
    for (const dziecko of n.getChildren()) {
      out.push(dziecko);
      zejdz(dziecko);
    }
  };
  zejdz(root);
  return out;
}

/**
 * Węzeł spod ścieżki.
 *
 * Szukamy po nazwach poziom po poziomie, zamiast porównywać gotowe ścieżki
 * wszystkich węzłów: przy dużym rysunku to różnica między jednym zejściem
 * a przejściem całego drzewa dla każdego zapytania.
 */
export function znajdzPoSciezce(scene: IScene, path: string): INode | null {
  const czesci = path.split('/').filter(Boolean);
  let biezacy: INode = scene.getRoot();

  for (const czesc of czesci) {
    const dziecko = biezacy.getChildren().find((n) => n.getName() === czesc);
    if (!dziecko) return null;
    biezacy = dziecko;
  }
  return czesci.length ? biezacy : null;
}

/** Węzły spełniające warunek — w kolejności drzewa. */
export function znajdzWezly(scene: IScene, predicate: (node: INode) => boolean): INode[] {
  return obejdzDrzewo(scene.getRoot()).filter(predicate);
}

/**
 * Nazwa niepowtarzalna wśród rodzeństwa.
 *
 * Ścieżka jest identyfikatorem czytelnym dla człowieka, więc dwa węzły o tej
 * samej nazwie w jednym miejscu drzewa czynią ją bezużyteczną — `getNode` musi
 * wtedy wybrać jeden z dwóch, a wybór byłby przypadkowy.
 */
export function wolnaNazwa(rodzenstwo: INode[], propozycja: string): string {
  const zajete = new Set(rodzenstwo.map((n) => n.getName()));
  if (!zajete.has(propozycja)) return propozycja;

  for (let i = 2; ; i += 1) {
    const kandydat = `${propozycja} ${i}`;
    if (!zajete.has(kandydat)) return kandydat;
  }
}
