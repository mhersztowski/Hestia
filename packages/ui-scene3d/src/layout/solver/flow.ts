/**
 * flow.ts — układ przepływowy, jak flex w przeglądarce.
 *
 * Różnica wobec kotwic jest zasadnicza i warto ją nazwać: przy kotwicach pozycja
 * obiektu zależy **tylko od rodzica**, więc każdy liczy się osobno. Tutaj zależy
 * od **rodzeństwa** — przesunięcie pierwszego elementu przesuwa wszystkie
 * następne. Dlatego kontener jest jednostką liczenia, a nie pojedynczy obiekt.
 *
 * Rozdział nadwyżki (`grow`) to jedyne miejsce, w którym ten silnik przypomina
 * układ równań, ale rozwiązuje je wzorem, a nie iteracją: nadwyżka dzieli się
 * proporcjonalnie i to wystarcza. Gdy pojawi się „nie mniej niż" i „nie więcej
 * niż" naraz, wzór przestanie wystarczać — wtedy będzie to zadanie dla trybu
 * więzów, a nie powód, żeby ten silnik rozbudowywać.
 */
import type { FlowContainer, LayoutDoc, LayoutResult, Rect, Shape } from '../model/types';
import { resolveValues } from '../model/scope';
import { childrenOf } from './anchor';

/** Wielkość wzdłuż kierunku układania i w poprzek — żeby nie pisać dwóch wersji. */
type Kierunek = FlowContainer['direction'];
const wzdluz = (dir: Kierunek): 'w' | 'h' => (dir === 'row' ? 'w' : 'h');
const wPoprzek = (dir: Kierunek): 'w' | 'h' => (dir === 'row' ? 'h' : 'w');
const osGlowna = (dir: Kierunek): 'x' | 'y' => (dir === 'row' ? 'x' : 'y');
const osPoprzeczna = (dir: Kierunek): 'x' | 'y' => (dir === 'row' ? 'y' : 'x');

export function solveFlow(doc: LayoutDoc): LayoutResult {
  const { values, issues } = resolveValues(doc);
  const rects: Record<string, Rect> = {};

  const ulozDzieci = (parent: Shape | undefined, ramka: Rect): void => {
    const dzieci = childrenOf(doc, parent?.id);
    if (!dzieci.length) return;

    const kontener = parent?.container;
    if (!kontener) {
      // Bez ustawień kontenera dzieci zostają tam, gdzie je zapisano. Kontener
      // przepływowy jest wyborem autora, a nie skutkiem posiadania dzieci.
      for (const dziecko of dzieci) {
        rects[dziecko.id] = { ...values[dziecko.id] };
        ulozDzieci(dziecko, rects[dziecko.id]);
      }
      return;
    }

    const dir = kontener.direction;
    const gap = kontener.gap ?? 0;
    const pad = kontener.padding ?? 0;
    const glowna = wzdluz(dir);
    const poprzeczna = wPoprzek(dir);

    const dostepna = ramka[glowna] - 2 * pad;
    const dostepnaPoprzek = ramka[poprzeczna] - 2 * pad;

    const bazowe = dzieci.map((d) => d.flow?.basis ?? values[d.id][glowna]);
    const rozciagi = dzieci.map((d) => d.flow?.grow ?? 0);
    const sumaRozciagow = rozciagi.reduce((a, b) => a + b, 0);
    const zajete = bazowe.reduce((a, b) => a + b, 0) + gap * Math.max(0, dzieci.length - 1);
    const nadwyzka = dostepna - zajete;

    if (nadwyzka < 0 && sumaRozciagow === 0) {
      issues.push(`Zawartość „${parent?.id ?? 'obszaru'}" nie mieści się o ${Math.round(-nadwyzka)} px.`);
    }

    let kursor = ramka[osGlowna(dir)] + pad;
    dzieci.forEach((dziecko, i) => {
      const dodatek = sumaRozciagow > 0 && nadwyzka > 0 ? (nadwyzka * rozciagi[i]) / sumaRozciagow : 0;
      const rozmiar = bazowe[i] + dodatek;
      const wlasnyPoprzek = values[dziecko.id][poprzeczna];

      const rozmiarPoprzek = kontener.align === 'stretch' ? dostepnaPoprzek : wlasnyPoprzek;
      const wolnePoprzek = dostepnaPoprzek - rozmiarPoprzek;
      const przesunieciePoprzek = kontener.align === 'center' ? wolnePoprzek / 2
        : kontener.align === 'end' ? wolnePoprzek
          : 0;

      const rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
      rect[osGlowna(dir)] = kursor;
      rect[osPoprzeczna(dir)] = ramka[osPoprzeczna(dir)] + pad + przesunieciePoprzek;
      rect[glowna] = rozmiar;
      rect[poprzeczna] = rozmiarPoprzek;

      rects[dziecko.id] = rect;
      kursor += rozmiar + gap;

      ulozDzieci(dziecko, rect);
    });
  };

  // Obiekty najwyższego poziomu biorą własne wartości — obszar rysunku nie ma
  // ustawień kontenera, bo nie jest kształtem.
  for (const shape of childrenOf(doc, undefined)) {
    rects[shape.id] = { ...values[shape.id] };
    ulozDzieci(shape, rects[shape.id]);
  }

  for (const shape of doc.shapes) {
    if (rects[shape.id]) continue;
    rects[shape.id] = { ...values[shape.id] };
    issues.push(`Kształt „${shape.id}" wskazuje rodzica „${shape.parent}", którego nie ma.`);
  }

  return { rects, issues };
}
