/**
 * anchor.ts — kotwice jak w Godocie i Unity.
 *
 * Kotwica mówi dwie rzeczy naraz: **do czego** obiekt jest przypięty (ułamek
 * wymiaru rodzica) i **jak daleko** od tego punktu leży (piksele). Rozdzielenie
 * tych dwóch liczb jest całym pomysłem: przy zmianie rozmiaru rodzica ułamek
 * się skaluje, a piksele nie. Stąd bierze się różnica między „przycisk w prawym
 * dolnym rogu, zawsze 80 px szeroki" a „pasek na całą szerokość z marginesem 8".
 *
 * Gdy `min === max`, obiekt jest przypięty do punktu i offsety opisują jego
 * krawędzie; gdy się różnią — rozciąga się razem z rodzicem, a offsety są
 * marginesami (prawy zwykle ujemny, bo liczy się od prawej krawędzi).
 *
 * Kolejność liczenia jest ta sama, co w drzewie: dziecko potrzebuje gotowego
 * prostokąta rodzica, więc idziemy od korzenia w dół.
 */
import type { LayoutDoc, LayoutResult, Rect, Shape } from '../model/types';
import { resolveValues } from '../model/scope';

/** Dzieci w kolejności zapisu — kolejność bywa istotna, więc jej nie gubimy. */
export function childrenOf(doc: LayoutDoc, parent?: string): Shape[] {
  return doc.shapes.filter((s) => (s.parent ?? undefined) === parent);
}

function zKotwicy(a: NonNullable<Shape['anchor']>, rodzic: Rect): Rect {
  const lewa = rodzic.x + a.minX * rodzic.w + a.offsetLeft;
  const prawa = rodzic.x + a.maxX * rodzic.w + a.offsetRight;
  const gora = rodzic.y + a.minY * rodzic.h + a.offsetTop;
  const dol = rodzic.y + a.maxY * rodzic.h + a.offsetBottom;
  return { x: lewa, y: gora, w: prawa - lewa, h: dol - gora };
}

export function solveAnchor(doc: LayoutDoc): LayoutResult {
  const { values, issues } = resolveValues(doc);
  const rects: Record<string, Rect> = {};

  const obszar: Rect = { x: 0, y: 0, w: doc.viewport.width, h: doc.viewport.height };

  const ulozPoziom = (parent: string | undefined, rodzic: Rect): void => {
    for (const shape of childrenOf(doc, parent)) {
      // Bez kotwicy obiekt zachowuje się jak w układzie statycznym. To nie jest
      // wyjątek dla wygody: w edytorze większość obiektów powstaje bez kotwicy
      // i ma się dać przesuwać myszą, zanim ktokolwiek zdecyduje o przypięciu.
      rects[shape.id] = shape.anchor ? zKotwicy(shape.anchor, rodzic) : { ...values[shape.id] };
      ulozPoziom(shape.id, rects[shape.id]);
    }
  };

  ulozPoziom(undefined, obszar);

  // Kształt osierocony (rodzic wskazuje na nieistniejący identyfikator) nie
  // trafiłby do żadnego poziomu i zniknąłby bez słowa.
  for (const shape of doc.shapes) {
    if (rects[shape.id]) continue;
    rects[shape.id] = { ...values[shape.id] };
    issues.push(`Kształt „${shape.id}" wskazuje rodzica „${shape.parent}", którego nie ma.`);
  }

  return { rects, issues };
}
