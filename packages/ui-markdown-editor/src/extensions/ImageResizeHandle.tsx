/**
 * ImageResizeHandle — zmiana szerokości obrazka przeciągnięciem narożnika.
 *
 * Szerokość dało się ustawić suwakiem w oknie edycji, ale to jest droga przez
 * trzy kliknięcia, a podgląd ma inną szerokość niż docelowe miejsce w tekście.
 * Uchwyt odpowiada na pytanie „ile ma zajmować **tu**", patrząc na to samo, co
 * czytelnik.
 *
 * Wynik trafia do atrybutu `width` — czyli tam, gdzie już trafiał suwak. Zapis
 * do markdownu (`<img style="width: …">`) działa więc bez żadnej zmiany
 * w konwerterze.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

/** Poniżej tego obrazek przestaje być widoczny, a uchwyt — chwytalny. */
const MIN_PROCENT = 10;

export interface ImageResizeHandleProps {
  width: string | null;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  /** Element, którego szerokość mierzymy w chwili chwycenia uchwytu. */
  elementRef: React.RefObject<HTMLElement | null>;
}

export const ImageResizeHandle: React.FC<ImageResizeHandleProps> = ({
  width, updateAttributes, elementRef,
}) => {
  const [dragging, setDragging] = useState(false);
  /** Stan przeciągania w ref, nie w stanie: pointermove przychodzi częściej, niż React renderuje. */
  const startRef = useRef<{ x: number; szerokość: number; kolumna: number } | null>(null);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const start = startRef.current;
    if (!start) return;

    const nowa = start.szerokość + (event.clientX - start.x);
    const procent = Math.round((nowa / start.kolumna) * 100);

    /**
     * Pełna szerokość **kasuje** atrybut zamiast zapisywać „100%".
     *
     * Brak szerokości znaczy „tyle, ile obrazek ma naturalnie, nie więcej niż
     * kolumna". To jest inna informacja niż sto procent kolumny, które
     * rozciągnęłoby mały obrazek na całą szerokość i rozmyło go.
     */
    if (procent >= 100) {
      updateAttributes({ width: null });
      return;
    }
    updateAttributes({ width: `${Math.max(MIN_PROCENT, procent)}%` });
  }, [updateAttributes]);

  const onPointerUp = useCallback(() => {
    startRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!dragging) return undefined;
    // Nasłuch na oknie, nie na uchwycie: kursor podczas przeciągania regularnie
    // wychodzi poza mały kwadracik, a wtedy zdarzenia trafiałyby gdzie indziej.
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragging, onPointerMove, onPointerUp]);

  const onPointerDown = (event: React.PointerEvent) => {
    const element = elementRef.current;
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();

    // Szerokość kolumny bierzemy z rodzica: to ona jest odniesieniem dla
    // procentów, a nie szerokość okna ani samego obrazka.
    const kolumna = (element.parentElement as HTMLElement | null)?.offsetWidth || element.offsetWidth;
    startRef.current = { x: event.clientX, szerokość: element.offsetWidth, kolumna };
    setDragging(true);
  };

  return (
    <Box
      role="slider"
      aria-label="rozmiar obrazka"
      aria-valuenow={width ? Number.parseFloat(width) : 100}
      aria-valuemin={MIN_PROCENT}
      aria-valuemax={100}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        // Klawiatura obsługiwana tak samo jak przeciąganie — uchwyt, do którego
        // da się dojść tabem, ale nie da się go użyć, jest gorszy niż jego brak.
        const teraz = width ? Number.parseFloat(width) : 100;
        if (event.key === 'ArrowLeft') updateAttributes({ width: `${Math.max(MIN_PROCENT, teraz - 5)}%` });
        if (event.key === 'ArrowRight') {
          const nowa = teraz + 5;
          updateAttributes({ width: nowa >= 100 ? null : `${nowa}%` });
        }
      }}
      sx={{
        position: 'absolute',
        right: 2,
        bottom: 2,
        width: 16,
        height: 16,
        cursor: 'nwse-resize',
        borderRadius: '3px',
        backgroundColor: dragging ? '#1565c0' : 'rgba(25, 118, 210, 0.9)',
        border: '2px solid white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        zIndex: 11,
        touchAction: 'none',
        '&:focus-visible': { outline: '2px solid #1565c0', outlineOffset: 2 },
      }}
    />
  );
};
