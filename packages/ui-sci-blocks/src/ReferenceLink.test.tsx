/**
 * Dymek odsyłacza — zachowanie na myszy i na dotyku.
 *
 * Do tej pory dymek otwierało wyłącznie `onMouseEnter`. Na telefonie tapnięcie
 * wysyła syntetyczne `mouseenter`, a **zaraz po nim `click`**, więc dymek migał
 * i następowało przejście: czytelnik na dotyku nigdy nie widział definicji.
 *
 * Rozstrzygamy to pytaniem do urządzenia — `matchMedia('(hover: hover)')` —
 * a nie zgadywaniem po szerokości ekranu: hybryda (laptop z dotykiem) ma hover
 * i ma się zachowywać jak desktop.
 *
 * Przejście dalej siedzi **w dymku**, jako jawny przycisk. Dzięki temu na
 * dotyku nie trzeba zgadywać, że „drugi tap przenosi", a pierwszy tap nie
 * wygląda jak zepsuty link.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ReferenceLink, STYL_DYMKA } from './ReferenceLink';

const RYSUNEK = [
  '![Rys. 15-1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)',
  '@caption **Rys. 15-1.** Punkt materialny.',
].join('\n');

const CEL = {
  kind: 'term' as const,
  code: 'Częstość\n@definition Liczba drgań na jednostkę czasu.\n@source 15-1, s. 344',
  documentTitle: 'Słownik zagadnień',
  sameDocument: false,
};

/** Udaje urządzenie z myszą albo bez niej. */
function ustawHover(ma: boolean) {
  window.matchMedia = vi.fn().mockImplementation((zapytanie: string) => ({
    matches: zapytanie.includes('hover: hover') ? ma : false,
    media: zapytanie,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => ustawHover(true));
afterEach(cleanup);

describe('na urządzeniu z myszą', () => {
  it('najechanie pokazuje definicję', () => {
    render(<ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} />);
    expect(screen.queryByText(/Liczba drgań/)).toBeNull();

    fireEvent.mouseEnter(screen.getByText('Częstością'));
    expect(screen.getByText(/Liczba drgań/)).toBeTruthy();
  });

  it('kliknięcie przenosi od razu', () => {
    const przejdz = vi.fn();
    render(<ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} onNavigate={przejdz} />);

    fireEvent.click(screen.getByText('Częstością'));
    expect(przejdz).toHaveBeenCalledWith('rh1-poj-czestosc');
  });
});

describe('na dotyku', () => {
  beforeEach(() => ustawHover(false));

  it('tapnięcie pokazuje dymek i NIE przenosi', () => {
    // Sedno usterki: dotąd tap przenosił, zanim dało się cokolwiek przeczytać.
    const przejdz = vi.fn();
    render(<ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} onNavigate={przejdz} />);

    fireEvent.click(screen.getByText('Częstością'));
    expect(screen.getByText(/Liczba drgań/)).toBeTruthy();
    expect(przejdz).not.toHaveBeenCalled();
  });

  it('przejście jest przyciskiem w dymku', () => {
    const przejdz = vi.fn();
    render(<ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} onNavigate={przejdz} />);

    fireEvent.click(screen.getByText('Częstością'));
    fireEvent.click(screen.getByRole('button', { name: /otwórz/i }));
    expect(przejdz).toHaveBeenCalledWith('rh1-poj-czestosc');
  });

  it('Escape zamyka dymek', () => {
    render(<ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} />);
    fireEvent.click(screen.getByText('Częstością'));
    expect(screen.getByText(/Liczba drgań/)).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/Liczba drgań/)).toBeNull();
  });

  it('tapnięcie obok zamyka dymek', () => {
    render(
      <div>
        <ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} />
        <p>gdzie indziej</p>
      </div>,
    );
    fireEvent.click(screen.getByText('Częstością'));
    expect(screen.getByText(/Liczba drgań/)).toBeTruthy();

    fireEvent.pointerDown(screen.getByText('gdzie indziej'));
    expect(screen.queryByText(/Liczba drgań/)).toBeNull();
  });

  it('dymek nie wychodzi poza wąski ekran', () => {
    render(<ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} />);
    fireEvent.click(screen.getByText('Częstością'));

    expect(screen.getByRole('dialog')).toBeTruthy();
    // Sprawdzamy definicję stylu, nie DOM: jsdom nie zna funkcji `min()`
    // i po cichu wyrzuca całą deklarację, więc przez DOM tego nie widać.
    expect(STYL_DYMKA.maxWidth).toBe('min(280px, calc(100vw - 16px))');
  });
});

describe('cel, którego nie ma', () => {
  it('jest widocznie oznaczony i nie otwiera dymka', () => {
    render(<ReferenceLink id="rh1-poj-nie-ma" label="coś" />);
    const el = screen.getByText('coś');
    expect(el.getAttribute('title')).toMatch(/nie ma/i);

    fireEvent.click(el);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('dojazd kursorem do dymka', () => {
  beforeEach(() => { ustawHover(true); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('dymek nie znika w chwili zjechania z odsyłacza', () => {
    // Między słowem a dymkiem jest odstęp; kursor po drodze opuszcza kotwicę.
    // Natychmiastowe zamknięcie sprawiało, że nie dało się kliknąć „otwórz".
    render(<ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} onNavigate={vi.fn()} />);

    fireEvent.mouseEnter(screen.getByText('Częstością'));
    fireEvent.mouseLeave(screen.getByText('Częstością'));

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('wejście kursorem w dymek anuluje zamknięcie', () => {
    render(<ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} onNavigate={vi.fn()} />);
    fireEvent.mouseEnter(screen.getByText('Częstością'));
    fireEvent.mouseLeave(screen.getByText('Częstością'));
    fireEvent.mouseEnter(screen.getByRole('dialog'));

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('da się kliknąć „otwórz" po przejechaniu do dymka', () => {
    const przejdz = vi.fn();
    render(<ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} onNavigate={przejdz} />);

    fireEvent.mouseEnter(screen.getByText('Częstością'));
    fireEvent.mouseLeave(screen.getByText('Częstością'));
    fireEvent.mouseEnter(screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('button', { name: /otwórz/i }));

    expect(przejdz).toHaveBeenCalledWith('rh1-poj-czestosc');
  });

  it('zjechanie z dymka zamyka go po chwili', () => {
    render(<ReferenceLink id="rh1-poj-czestosc" label="Częstością" target={CEL} />);
    fireEvent.mouseEnter(screen.getByText('Częstością'));
    fireEvent.mouseEnter(screen.getByRole('dialog'));
    fireEvent.mouseLeave(screen.getByRole('dialog'));

    // Upływ czasu w `act`, bo zamknięcie idzie z timera — bez tego React nie
    // przetworzy aktualizacji stanu.
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('duży cel nie wychodzi poza ekran', () => {
  beforeEach(() => ustawHover(true));

  it('dymek ma ograniczoną wysokość i własne przewijanie', () => {
    // Wartość ze stylu jest zabezpieczeniem na pierwszą klatkę — właściwy limit
    // liczy pomiar (patrz `referencePopover.test.tsx`). Przewijanie w środku
    // jest tu istotne: rysunek 15-1 ma proporcje 1410×2490 i bez niego dymek
    // rósłby poza ekran telefonu.
    expect(STYL_DYMKA.maxHeight).toBe('min(60vh, 420px)');
    expect(STYL_DYMKA.overflowY).toBe('auto');
  });

  it('obraz w podglądzie jest przycięty do rozsądnej wysokości', () => {
    render(<ReferenceLink id="r" label="rys" target={{ kind: 'figure', code: RYSUNEK, sameDocument: true }} />);
    fireEvent.mouseEnter(screen.getByText('rys'));

    const img = screen.getByRole('img');
    expect(img.style.maxHeight).toBeTruthy();
    expect(img.style.objectFit).toBe('contain');
  });
});

/*
 * Testy położenia dymka przeniesione do `referencePopover.test.tsx`.
 *
 * Sprawdzały poprzedni mechanizm — przesuwanie `transform`-em wewnątrz treści
 * i odbijanie przez `top: 1.35em`. Ten mechanizm nie mógł działać w ogólnym
 * przypadku (przodek z `overflow` przycinał dymek, przodek z `transform`
 * przestawiał układ odniesienia), więc został zastąpiony portalem do `body`
 * z geometrią liczoną względem okna. Asercje o `translateX` opisywały „jak",
 * a nie „co" — nowy plik sprawdza to samo zachowanie na nowym mechanizmie.
 */
