/**
 * edycja.ts — co znaczy „przesunąłem kształt" w każdym z czterech trybów.
 *
 * To jest miejsce, w którym najlepiej widać, czym się te tryby różnią. Ruch myszą
 * jest jeden, ale jego zapis w dokumencie za każdym razem inny:
 *
 *  • statyczny — nowa liczba;
 *  • kotwice — zmiana odstępu od krawędzi rodzica, bo pozycja bezwzględna nie
 *    jest tu przechowywana i nie ma czego nadpisać;
 *  • przepływ — nic, bo pozycję wyznacza rodzeństwo; zapisanie jej i tak
 *    zostałoby zignorowane przy najbliższym przeliczeniu;
 *  • więzy — solver godzi kursor z warunkami i wynikiem jest **nowy stan całego
 *    rysunku**, nie tylko chwytanego kształtu.
 */
import type { LayoutDoc, Rect } from '../model/types';
import { lit } from '../model/types';
import { solveLayout } from './index';
import { dragShape } from './drag';

export interface DragOutcome {
  doc: LayoutDoc;
  /** Gdy ruch nie ma prawa nic zmienić — powód, zamiast cichego zignorowania. */
  odmowa?: string;
  /**
   * Gdy ruch zmienił mniej, niż wskazywał kursor.
   *
   * Odrębne od odmowy, bo skutek jest inny: wynik **należy zapisać**, tylko
   * kształt nie poszedł dokładnie tam, gdzie ręka. Sklejenie tych dwóch
   * przypadków w jeden kazałoby wołającemu zgadywać, czy ma zapisywać.
   */
  uwaga?: string;
}

/** Czy wartość jest liczbą wpisaną wprost — tylko taką wolno nadpisać ruchem myszy. */
const wolnoNadpisac = (v: { src: string }) => v.src === 'literal';

export function applyDrag(
  doc: LayoutDoc,
  id: string,
  cel: { x: number; y: number },
  biezace: Record<string, Rect>,
): DragOutcome {
  const shape = doc.shapes.find((s) => s.id === id);
  if (!shape) return { doc };

  const kopia = (): LayoutDoc => ({ ...doc, shapes: doc.shapes.map((s) => ({ ...s })) });

  if (doc.mode === 'flow') {
    const rodzic = shape.parent ? doc.shapes.find((s) => s.id === shape.parent) : undefined;
    if (rodzic?.container) {
      return { doc, odmowa: `Pozycję „${id}" wyznacza przepływ w „${rodzic.id}". `
        + 'Żeby ją zmienić, zmień kolejność, odstęp albo „grow".' };
    }
  }

  if (doc.mode === 'anchor' && shape.anchor) {
    const teraz = biezace[id];
    const dx = cel.x - teraz.x;
    const dy = cel.y - teraz.y;
    const nowy = kopia();
    const cel2 = nowy.shapes.find((s) => s.id === id)!;
    cel2.anchor = {
      ...shape.anchor,
      offsetLeft: shape.anchor.offsetLeft + dx,
      offsetRight: shape.anchor.offsetRight + dx,
      offsetTop: shape.anchor.offsetTop + dy,
      offsetBottom: shape.anchor.offsetBottom + dy,
    };
    return { doc: nowy };
  }

  if (doc.mode === 'constraint') {
    const wynik = dragShape(doc, id, cel);
    const nowy = kopia();
    // Zapisujemy **cały** wynik, bo więz mógł poruszyć także sąsiadów. Pomijamy
    // wielkości opisane wyrażeniem: te mają swoje źródło i nadpisanie ich liczbą
    // po cichu zerwałoby powiązanie, którego autor nie kazał zrywać.
    for (const s of nowy.shapes) {
      const r = wynik.rects[s.id];
      if (!r) continue;
      if (wolnoNadpisac(s.x)) s.x = lit(r.x);
      if (wolnoNadpisac(s.y)) s.y = lit(r.y);
      if (wolnoNadpisac(s.w)) s.w = lit(r.w);
      if (wolnoNadpisac(s.h)) s.h = lit(r.h);
    }
    return { doc: nowy };
  }

  const wolnoX = wolnoNadpisac(shape.x);
  const wolnoY = wolnoNadpisac(shape.y);

  if (!wolnoX && !wolnoY) {
    return { doc, odmowa: `Położenie „${id}" wynika z wyrażeń. Zmień wyrażenie albo parametr, `
      + 'do którego się odwołuje.' };
  }

  // Jedna współrzędna opisana wyrażeniem nie unieruchamia drugiej. Zablokowanie
  // obu byłoby prostsze do opisania, ale w praktyce znaczyłoby, że kolumna
  // przypięta wyrażeniem do sąsiada nie da się przesunąć w pionie — a nic tego
  // nie zabrania.
  const nowy = kopia();
  const cel2 = nowy.shapes.find((s) => s.id === id)!;
  if (wolnoX) cel2.x = lit(cel.x);
  if (wolnoY) cel2.y = lit(cel.y);

  return {
    doc: nowy,
    uwaga: wolnoX && wolnoY ? undefined
      : `${wolnoX ? 'Pionowe' : 'Poziome'} położenie „${id}" wynika z wyrażenia i zostało bez zmian.`,
  };
}

/** Podgląd w trakcie ruchu — bez zapisywania czegokolwiek do dokumentu. */
export function previewDrag(
  doc: LayoutDoc,
  id: string,
  cel: { x: number; y: number },
  biezace: Record<string, Rect>,
): Record<string, Rect> {
  if (doc.mode === 'constraint') return dragShape(doc, id, cel).rects;
  const { doc: próbny, odmowa } = applyDrag(doc, id, cel, biezace);
  if (odmowa) return biezace;
  return solveLayout(próbny).rects;
}
