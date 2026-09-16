/**
 * StrokeCanvas — rysowanie warunku początkowego piórem.
 *
 * Płótno leży **na** heatmapie, nie zamiast niej: rysując, widać od razu, co
 * powstaje, bo pod spodem jest ta sama mapa kolorów, która pokaże symulację.
 *
 * Dwie rzeczy pochodzą wprost z pióra i nie mają odpowiednika w myszy:
 * **nacisk** steruje wysokością plamki, a **odwrócenie pióra** (gumka) rysuje
 * dołek zamiast wzniesienia. Mysz dostaje wartości domyślne, więc rysowanie
 * działa wszędzie — tylko piórem jest bogatsze.
 *
 * Pociągnięcia są przerzedzane w trakcie rysowania, a nie po: zapis co piksel
 * dałby tysiące gaussianów, z których każdy byłby liczony w każdym punkcie
 * siatki w każdym kroku.
 */
import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Stroke } from '@hestia/core-sci';

export interface StrokeCanvasProps {
  width: number;
  height: number;
  /** Odsunięcie od góry kontenera; domyślnie płótno leży przy jego krawędzi. */
  top?: number;
  /** Dziedzina pola — pociągnięcia zapisujemy w jej jednostkach, nie w pikselach. */
  domainX: [number, number];
  domainY: [number, number];
  /**
   * Zmiana listy pociągnięć.
   *
   * Przyjmuje **funkcję aktualizującą**, nie gotową listę: pióro melduje
   * położenie szybciej (120 Hz), niż React zdąży przerenderować, więc kolejne
   * zdarzenia widziałyby tę samą starą listę i z całego pociągnięcia zostałby
   * ostatni punkt.
   */
  onChange: (update: (poprzednie: Stroke[]) => Stroke[]) => void;
}

/**
 * Najmniejszy odstęp między zapisanymi pociągnięciami, w ułamku dziedziny.
 *
 * Pióro melduje położenie kilkadziesiąt razy na sekundę; bez przerzedzania
 * jedno przeciągnięcie przez płótno zostawiłoby kilkaset plamek stojących
 * jedna na drugiej.
 */
const MIN_ODSTEP = 0.02;

/** Promień plamki w ułamku dziedziny — dobrany tak, by ślad wyglądał jak ślad. */
const PROMIEN = 0.045;

export function StrokeCanvas({
  width,
  height,
  top = 0,
  domainX,
  domainY,
  onChange,
}: StrokeCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  /**
   * Czy pióro jest opuszczone.
   *
   * W ref, nie w stanie: zdarzenia pióra przychodzą seriami bez renderu
   * pomiędzy, więc flaga trzymana w stanie byłaby jeszcze fałszywa, gdy
   * nadchodzą pierwsze ruchy — i początek każdego pociągnięcia by ginął.
   */
  const rysujeRef = useRef(false);
  /** Ostatni zapisany punkt — do przerzedzania. */
  const ostatniRef = useRef<{ x: number; y: number } | null>(null);

  const naDziedzine = useCallback(
    (event: ReactPointerEvent) => {
      const prostokat = ref.current?.getBoundingClientRect();
      if (!prostokat) return null;

      const u = (event.clientX - prostokat.left) / prostokat.width;
      // Oś Y płótna rośnie w dół, oś dziedziny w górę — bez odwrócenia rysunek
      // pojawiałby się odbity względem tego, co widać pod kursorem.
      const v = (event.clientY - prostokat.top) / prostokat.height;
      if (u < 0 || u > 1 || v < 0 || v > 1) return null;

      return {
        x: domainX[0] + u * (domainX[1] - domainX[0]),
        y: domainY[0] + v * (domainY[1] - domainY[0]),
      };
    },
    [domainX, domainY]
  );

  const dodaj = useCallback(
    (event: ReactPointerEvent) => {
      const punkt = naDziedzine(event);
      if (!punkt) return;

      const poprzedni = ostatniRef.current;
      const zasieg = Math.max(domainX[1] - domainX[0], domainY[1] - domainY[0]);
      if (poprzedni) {
        const odleglosc = Math.hypot(punkt.x - poprzedni.x, punkt.y - poprzedni.y);
        if (odleglosc < MIN_ODSTEP * zasieg) return;
      }
      ostatniRef.current = punkt;

      // Mysz melduje nacisk 0 albo 0.5 — bez podstawienia rysowałaby plamki o
      // zerowej wysokości, czyli nic.
      const nacisk = event.pressure > 0 && event.pointerType === 'pen' ? event.pressure : 0.7;
      // Gumka pióra i prawy przycisk myszy robią to samo: rysują dołek.
      const odwrocone = event.buttons === 32 || event.buttons === 2;

      const nowe: Stroke = {
        x: Number(punkt.x.toFixed(3)),
        y: Number(punkt.y.toFixed(3)),
        radius: Number((PROMIEN * zasieg).toFixed(3)),
        amplitude: Number(((odwrocone ? -1 : 1) * nacisk).toFixed(3)),
      };
      onChange((poprzednie) => [...poprzednie, nowe]);
    },
    [naDziedzine, onChange, domainX, domainY]
  );

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        // Przechwycenie wskaźnika: bez tego szybki ruch poza płótno przerywa
        // pociągnięcie w połowie i zostawia urwany ślad.
        e.currentTarget.setPointerCapture(e.pointerId);
        rysujeRef.current = true;
        ostatniRef.current = null;
        dodaj(e);
      }}
      onPointerMove={(e) => {
        if (rysujeRef.current) dodaj(e);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        rysujeRef.current = false;
      }}
      onPointerCancel={() => {
        rysujeRef.current = false;
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'absolute',
        top,
        left: 0,
        width,
        height,
        cursor: 'crosshair',
        // Bez tego przeciągnięcie palcem przewija stronę zamiast rysować.
        touchAction: 'none',
        borderRadius: 4,
      }}
    />
  );
}
