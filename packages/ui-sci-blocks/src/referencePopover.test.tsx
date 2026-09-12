/**
 * Dymek odsyłacza wychodzący poza ekran — czwarte podejście, tym razem u źródła.
 *
 * Trzy poprzednie liczyły korektę i przesuwały dymek `transform`-em wewnątrz
 * drzewa dokumentu. Nie mogło to działać w ogólnym przypadku, bo dymek był
 * dzieckiem treści: **każdy przodek z `overflow: hidden` przycina go**, a każdy
 * z `transform` staje się dla niego układem odniesienia. Tryb czytania stronami
 * ma jedno i drugie, więc korekta liczona względem okna trafiała w inne
 * współrzędne, niż te, w których dymek naprawdę leżał.
 *
 * Rozwiązanie: dymek renderuje się w **portalu do `body`**, pozycjonowany
 * `fixed` względem prostokąta odsyłacza. Wtedy nie ma przodków, którzy mogliby
 * go przyciąć, a geometria jest liczona w tym samym układzie, w którym jest
 * rysowana.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { ReferenceLink } from './ReferenceLink';

const CEL = { code: 'T = 2\\pi', kind: 'formula' as const, sameDocument: true };

/** Ekran telefonu — wąski i niski. */
const TELEFON = { width: 390, height: 780 };

function ustawEkran({ width, height }: { width: number; height: number }) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

/** Odsyłacz w zadanym miejscu ekranu; dymek zawsze 280×200. */
function zPolozeniem(link: Partial<DOMRect>) {
  Element.prototype.getBoundingClientRect = function pomiar(this: Element) {
    if (this.getAttribute('role') === 'dialog') {
      return { top: 0, left: 0, right: 280, bottom: 200, width: 280, height: 200 } as DOMRect;
    }
    return {
      top: 400, left: 100, right: 140, bottom: 420, width: 40, height: 20, ...link,
    } as DOMRect;
  };
}

const oryginalnyPomiar = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  ustawEkran(TELEFON);
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {} disconnect() {} unobserve() {}
  };
});
afterEach(() => { Element.prototype.getBoundingClientRect = oryginalnyPomiar; });

/** Otwiera dymek i zwraca jego element. */
function otworz() {
  render(<ReferenceLink id="r" label="x" target={CEL} />);
  fireEvent.mouseEnter(screen.getByText('x'));
  return screen.getByRole('dialog');
}

describe('dymek nie zależy od otoczenia w drzewie', () => {
  it('renderuje się poza treścią dokumentu, w portalu', () => {
    zPolozeniem({});
    const dymek = otworz();

    // Gdyby siedział w treści, dowolny przodek z `overflow: hidden` mógłby go
    // przyciąć — a tryb czytania stronami taki właśnie jest.
    // Portal wstawia dymek wprost do `body`, poza drzewo treści.
    expect(dymek.parentElement).toBe(document.body);
    expect(dymek.closest('[data-reader-content]')).toBeNull();
  });

  it('jest pozycjonowany względem okna, nie względem rodzica', () => {
    zPolozeniem({});
    expect(otworz().style.position).toBe('fixed');
  });
});

describe('zmiana rozmiaru po otwarciu', () => {
  /**
   * Rysunek w podglądzie doładowuje się **po** otwarciu dymka: pierwszy pomiar
   * trafia w niski prostokąt, a chwilę później dochodzi obraz i dymek rośnie.
   * Bez ponownego pomiaru położenie dotyczyłoby nieaktualnego kształtu.
   */
  it('przelicza położenie, gdy dymek urośnie', () => {
    const obserwatorzy: Array<() => void> = [];
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      constructor(private readonly cb: () => void) {}
      observe() { obserwatorzy.push(this.cb); }
      disconnect() {}
      unobserve() {}
    };

    // Odsyłacz nisko na ekranie; dymek na start niski, więc mieści się pod nim.
    let wysokoscDymka = 40;
    Element.prototype.getBoundingClientRect = function pomiar(this: Element) {
      if (this.getAttribute('role') === 'dialog') {
        return { top: 0, left: 0, right: 280, bottom: wysokoscDymka,
          width: 280, height: wysokoscDymka } as DOMRect;
      }
      return { top: 600, left: 100, right: 140, bottom: 620, width: 40, height: 20 } as DOMRect;
    };

    render(<ReferenceLink id="r" label="x" target={CEL} />);
    fireEvent.mouseEnter(screen.getByText('x'));
    // Niski dymek mieści się nad odsyłaczem i tam ląduje — tak jak dotąd.
    const start = Number.parseFloat(screen.getByRole('dialog').style.top);
    expect(start + 40).toBeLessThanOrEqual(620);

    // Obraz się doładował: dymek ma teraz 400 px i pod odsyłaczem się nie mieści.
    wysokoscDymka = 400;
    act(() => { obserwatorzy.forEach((f) => f()); });

    // Po urośnięciu dymek nadal musi mieścić się w ekranie — po którejkolwiek
    // stronie odsyłacza, z wysokością przyciętą do dostępnego miejsca.
    const dymek = screen.getByRole('dialog');
    const po = Number.parseFloat(dymek.style.top);
    const maxH = Number.parseFloat(dymek.style.maxHeight);

    expect(po).toBeGreaterThanOrEqual(0);
    expect(po + Math.min(400, maxH)).toBeLessThanOrEqual(TELEFON.height);
  });
});

describe('mieszczenie się w ekranie telefonu', () => {
  it('odsyłacz przy prawej krawędzi — dymek wchodzi w ekran', () => {
    // Odsyłacz na 360 px z 390 px szerokości: dymek o szerokości 280 nie ma
    // prawa zacząć się w tym miejscu.
    zPolozeniem({ left: 360, right: 385 });
    const dymek = otworz();

    const left = Number.parseFloat(dymek.style.left);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + 280).toBeLessThanOrEqual(TELEFON.width);
  });

  it('odsyłacz przy lewej krawędzi — dymek nie wychodzi w lewo', () => {
    zPolozeniem({ left: 2, right: 40 });
    expect(Number.parseFloat(otworz().style.left)).toBeGreaterThanOrEqual(0);
  });

  it('odsyłacz w pierwszym wierszu — dymek ląduje pod nim', () => {
    zPolozeniem({ top: 8, bottom: 28 });
    const dymek = otworz();

    // Nad odsyłaczem nie ma 200 px, więc dymek musi zejść niżej.
    expect(Number.parseFloat(dymek.style.top)).toBeGreaterThan(28);
  });

  it('odsyłacz przy dolnej krawędzi — dymek ląduje nad nim', () => {
    zPolozeniem({ top: 760, bottom: 775 });
    const dymek = otworz();

    const top = Number.parseFloat(dymek.style.top);
    expect(top).toBeLessThan(760);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it('ekran niższy niż dymek — wysokość jest ograniczona i przewija się w środku', () => {
    ustawEkran({ width: 390, height: 180 });
    zPolozeniem({ top: 90, bottom: 110 });
    const dymek = otworz();

    expect(Number.parseFloat(dymek.style.maxHeight)).toBeLessThanOrEqual(180);
    expect(dymek.style.overflowY).toBe('auto');
  });

  it('nigdy nie wystaje poza żadną krawędź — sprawdzone w wielu miejscach', () => {
    // Każde miejsce w osobnym renderze: dwa otwarte dymki naraz to dwa elementy
    // o roli „dialog" i `getByRole` nie wiedziałby, o który chodzi.
    for (const miejsce of [
      { left: 0, right: 30, top: 0, bottom: 20 },
      { left: 370, right: 390, top: 0, bottom: 20 },
      { left: 0, right: 30, top: 760, bottom: 780 },
      { left: 370, right: 390, top: 760, bottom: 780 },
      { left: 180, right: 220, top: 390, bottom: 410 },
    ]) {
      zPolozeniem(miejsce);
      const { unmount } = render(<ReferenceLink id="r" label="x" target={CEL} />);
      fireEvent.mouseEnter(screen.getByText('x'));
      const dymek = screen.getByRole('dialog');
      const left = Number.parseFloat(dymek.style.left);
      const top = Number.parseFloat(dymek.style.top);
      const maxH = Number.parseFloat(dymek.style.maxHeight);

      expect(left, `left dla ${JSON.stringify(miejsce)}`).toBeGreaterThanOrEqual(0);
      expect(left + 280, `prawa dla ${JSON.stringify(miejsce)}`).toBeLessThanOrEqual(TELEFON.width);
      expect(top, `top dla ${JSON.stringify(miejsce)}`).toBeGreaterThanOrEqual(0);
      expect(top + Math.min(200, maxH), `dół dla ${JSON.stringify(miejsce)}`)
        .toBeLessThanOrEqual(TELEFON.height);

      unmount();
    }
  });
});
