/**
 * drag.ts — chwycenie kształtu myszą.
 *
 * Przeciąganie **nie jest** wpisaniem nowych współrzędnych. Gdyby nim było,
 * pierwszy więz by je unieważnił: dwa boki mają być równo, więc wpisana ręcznie
 * pozycja i tak zostałaby nadpisana przy najbliższym przeliczeniu.
 *
 * Zamiast tego kursor daje **punkt wyjścia**, a nie wynik. Solver zaczyna
 * stamtąd i szuka najbliższego stanu, w którym wszystkie warunki są spełnione.
 * „Najbliższego" jest tu istotne — to z niego bierze się wrażenie, że rysunek
 * idzie za ręką: skoro poprawka jest najmniejsza z możliwych, ruszy się tylko
 * to, co musi.
 *
 * Kotwica (`fixed`) celowo pamięta pozycję **z dokumentu**, a nie z bieżącego
 * przeciągania — inaczej chwycenie przypiętego kształtu przypinałoby go w nowym
 * miejscu, czyli więz znaczyłby coś innego w trakcie ruchu niż po nim.
 */
import type { LayoutDoc, LayoutResult } from '../model/types';
import { solveLayout } from './index';
import { solveConstraint } from './constraint';

export function dragShape(
  doc: LayoutDoc,
  id: string,
  cel: { x: number; y: number },
): LayoutResult {
  if (doc.mode !== 'constraint') {
    // Bez więzów nie ma czego godzić: nowa pozycja jest nową pozycją. Zwracamy
    // wynik zwykłego przeliczenia z podmienionym prostokątem, żeby wołający
    // miał jeden kształt odpowiedzi niezależnie od trybu.
    const wynik = solveLayout(doc);
    if (wynik.rects[id]) wynik.rects[id] = { ...wynik.rects[id], x: cel.x, y: cel.y };
    return wynik;
  }

  return solveConstraint(doc, { drag: { id, ...cel } });
}
