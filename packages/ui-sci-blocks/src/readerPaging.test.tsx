/**
 * Tryb czytania stronami.
 *
 * Przewijanie jest złe dla podręcznika z dwóch powodów: gubi się miejsce
 * (po odłożeniu telefonu nie wiadomo, gdzie się było) i nie widać postępu.
 * Strona ma stałą wysokość — tę, którą ma widok — więc czytelnik wraca zawsze
 * do tego samego kadru, a licznik „3 z 12" mówi coś prawdziwego.
 *
 * Wysokość strony **wynika z pomiaru widoku**, a nie z liczby znaków: ten sam
 * rozdział na telefonie i na monitorze ma inną liczbę stron i to jest poprawne.
 *
 * Łamiemy **między elementami**, nie co stałą liczbę pikseli: granica w połowie
 * wzoru albo symulacji daje pół rysunku na dole jednej strony i pół na górze
 * drugiej. Skutek uboczny jest widoczny w liczbach niżej — stron bywa więcej,
 * bo na dole zostaje trochę wolnego miejsca. To jest cena, którą płaci każda
 * książka.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { ReaderView } from './ReaderView';

const DOKUMENT = Array.from({ length: 40 }, (_, i) => `Akapit numer ${i + 1}.`).join('\n\n');

/**
 * jsdom nie liczy układu — podstawiamy wysokości treści, widoku i akapitów.
 *
 * Akapity muszą mieć własne pozycje, bo podział bierze się z nich, a nie z samej
 * wysokości całości. Pozycję wyznaczamy z miejsca elementu wśród rodzeństwa,
 * dzięki czemu mock nie zależy od kolejności wywołań pomiaru.
 */
function ustawWymiary({ tresc, widok, elementow = 40 }: { tresc: number; widok: number; elementow?: number }) {
  const wysokoscElementu = tresc / elementow;

  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { value: tresc, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: widok, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: widok, configurable: true, writable: true });

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const pusty = { left: 0, right: 0, bottom: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) };

      // `getBoundingClientRect` mierzy względem **okna**, więc przewinięcie
      // przesuwa wynik w górę. Bez tego pozycja lektury zawsze wychodziła zero
      // i test przepuszczał kod, który nigdzie nie skakał.
      const przewiniecie = window.scrollY ?? 0;
      if (this.tagName === 'ARTICLE') return { ...pusty, top: -przewiniecie, height: tresc } as DOMRect;

      const rodzic = this.parentElement;
      if (rodzic?.tagName === 'ARTICLE') {
        const indeks = [...rodzic.children].indexOf(this);
        return { ...pusty, top: indeks * wysokoscElementu - przewiniecie, height: wysokoscElementu } as DOMRect;
      }
      return { ...pusty, top: -przewiniecie, height: 0 } as DOMRect;
    },
  });
}

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {} disconnect() {} unobserve() {}
  };
  ustawWymiary({ tresc: 3000, widok: 600 });
});
afterEach(() => vi.restoreAllMocks());

describe('podział na strony', () => {
  it('bez włączonego trybu stron czyta się jak dotąd — jednym ciągiem', () => {
    render(<ReaderView markdown={DOKUMENT} />);
    expect(screen.queryByLabelText(/następna strona/i)).toBeNull();
  });

  it('po włączeniu pokazuje numer strony i ich liczbę', () => {
    render(<ReaderView markdown={DOKUMENT} paged />);
    // 3000 px treści przy 600 px widoku daje pięć stron.
    expect(screen.getByText(/1\s*\/\s*5/)).toBeTruthy();
  });

  it('liczba stron wynika z wysokości widoku, a nie z długości tekstu', () => {
    const { unmount } = render(<ReaderView markdown={DOKUMENT} paged />);
    expect(screen.getByText(/1\s*\/\s*5/)).toBeTruthy();
    unmount();

    // Ten sam dokument na wyższym ekranie ma mniej stron. Przy 75 px na akapit
    // i widoku 1000 px na stronę wchodzi trzynaście całych akapitów (975 px),
    // a czternasty otwiera następną — stąd cztery strony zamiast trzech.
    ustawWymiary({ tresc: 3000, widok: 1000 });
    render(<ReaderView markdown={DOKUMENT} paged />);
    expect(screen.getByText(/1\s*\/\s*4/)).toBeTruthy();
  });

  it('nie tnie elementu, który nie mieści się w całości', () => {
    // Blok wyższy niż reszta: przy podziale co stałą wysokość zostałby przecięty
    // w połowie, tutaj dostaje początek strony.
    ustawWymiary({ tresc: 1200, widok: 500, elementow: 4 });
    render(<ReaderView markdown={DOKUMENT} paged />);

    // Elementy po 300 px: pierwsza strona bierze jeden (0–300), bo drugi
    // sięgałby 600 px przy widoku 500.
    fireEvent.click(screen.getByLabelText(/następna strona/i));
    expect(screen.getByTestId('reader-pages').style.transform).toMatch(/translateY\(-300px\)/);
  });
});

describe('przewracanie stron', () => {
  it('kliknięcie po prawej stronie przenosi dalej', () => {
    render(<ReaderView markdown={DOKUMENT} paged />);
    fireEvent.click(screen.getByLabelText(/następna strona/i));

    expect(screen.getByText(/2\s*\/\s*5/)).toBeTruthy();
  });

  it('kliknięcie po lewej cofa', () => {
    render(<ReaderView markdown={DOKUMENT} paged />);
    fireEvent.click(screen.getByLabelText(/następna strona/i));
    fireEvent.click(screen.getByLabelText(/poprzednia strona/i));

    expect(screen.getByText(/1\s*\/\s*5/)).toBeTruthy();
  });

  it('nie wychodzi przed pierwszą ani za ostatnią', () => {
    render(<ReaderView markdown={DOKUMENT} paged />);

    fireEvent.click(screen.getByLabelText(/poprzednia strona/i));
    expect(screen.getByText(/1\s*\/\s*5/)).toBeTruthy();

    for (let i = 0; i < 10; i += 1) fireEvent.click(screen.getByLabelText(/następna strona/i));
    expect(screen.getByText(/5\s*\/\s*5/)).toBeTruthy();
  });

  it('strzałki klawiatury robią to samo co kliknięcia', () => {
    render(<ReaderView markdown={DOKUMENT} paged />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/2\s*\/\s*5/)).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText(/1\s*\/\s*5/)).toBeTruthy();
  });

  /**
   * Strona jest **przesunięciem treści**, nie jej przycięciem.
   *
   * Gdyby każda strona renderowała tylko swoje akapity, wzór albo symulacja
   * przecięte granicą strony musiałyby się przemontować przy każdym przewróceniu
   * — a symulacja liczy się wtedy od nowa.
   */
  it('przewrócenie strony przesuwa treść, zamiast ją przemontowywać', () => {
    render(<ReaderView markdown={DOKUMENT} paged />);
    const przed = screen.getByText('Akapit numer 1.');

    fireEvent.click(screen.getByLabelText(/następna strona/i));

    expect(screen.getByText('Akapit numer 1.')).toBe(przed);
    expect(screen.getByTestId('reader-pages').style.transform).toMatch(/translateY\(-600px\)/);
  });
});

describe('zmiana rozmiaru okna', () => {
  it('przelicza podział, gdy widok zmieni wysokość', () => {
    render(<ReaderView markdown={DOKUMENT} paged />);
    expect(screen.getByText(/1\s*\/\s*5/)).toBeTruthy();

    ustawWymiary({ tresc: 3000, widok: 1500 });
    act(() => { fireEvent(window, new Event('resize')); });

    // 1500 px mieści dwadzieścia akapitów po 75 px — podział wypada równo.
    expect(screen.getByText(/1\s*\/\s*2/)).toBeTruthy();
  });
});

/**
 * Przełączenie trybu czytania zachowuje miejsce w dokumencie.
 *
 * Tryb odpowiada za **sposób pokazywania**, nie za miejsce lektury. Skok na
 * początek rozdziału przy każdym przełączeniu kazał czytelnikowi szukać
 * akapitu, przy którym przed chwilą był.
 */
describe('zmiana trybu czytania', () => {
  /** jsdom nie przewija — zapisujemy, dokąd komponent chciał przewinąć. */
  function przechwycPrzewijanie() {
    const cele: number[] = [];
    window.scrollTo = ((opcje: { top?: number } | number) => {
      const top = typeof opcje === 'number' ? opcje : opcje?.top ?? 0;
      cele.push(top);
      Object.defineProperty(window, 'scrollY', { value: top, configurable: true, writable: true });
    }) as typeof window.scrollTo;
    return cele;
  }

  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  });

  it('ze stron na przewijanie przewija do początku bieżącej strony', () => {
    const cele = przechwycPrzewijanie();
    const { rerender } = render(<ReaderView markdown={DOKUMENT} paged />);

    fireEvent.click(screen.getByLabelText(/następna strona/i));
    fireEvent.click(screen.getByLabelText(/następna strona/i));
    expect(screen.getByText(/3\s*\/\s*5/)).toBeTruthy();

    rerender(<ReaderView markdown={DOKUMENT} />);

    // Trzecia strona zaczyna się 1200 px od góry treści (3000 px / 5 stron).
    expect(cele[cele.length - 1]).toBe(1200);
  });

  it('z przewijania na strony otwiera stronę, na której czytelnik był', () => {
    przechwycPrzewijanie();
    const { rerender } = render(<ReaderView markdown={DOKUMENT} />);

    // Czytelnik przewinął do połowy dokumentu.
    Object.defineProperty(window, 'scrollY', { value: 1500, configurable: true, writable: true });
    rerender(<ReaderView markdown={DOKUMENT} paged />);

    // 1500 px to czwarta strona (granice co 600 px).
    expect(screen.getByText(/3\s*\/\s*5/)).toBeTruthy();
  });

  it('czytanie dalej w trybie przewijania przenosi się na właściwą stronę', () => {
    // Samo „tam i z powrotem" niczego nie dowodzi: numer strony zostaje
    // w stanie komponentu i wraca sam z siebie. Dopiero przewinięcie **w inne
    // miejsce** pokazuje, czy tryb stron podąża za lekturą.
    przechwycPrzewijanie();
    const { rerender } = render(<ReaderView markdown={DOKUMENT} paged />);

    fireEvent.click(screen.getByLabelText(/następna strona/i));
    expect(screen.getByText(/2\s*\/\s*5/)).toBeTruthy();

    rerender(<ReaderView markdown={DOKUMENT} />);
    Object.defineProperty(window, 'scrollY', { value: 2500, configurable: true, writable: true });
    rerender(<ReaderView markdown={DOKUMENT} paged />);

    // 2500 px to piąta strona przy granicach co 600 px.
    expect(screen.getByText(/5\s*\/\s*5/)).toBeTruthy();
  });

  it('pierwsza strona nie powoduje przewijania w bok ani w dół', () => {
    const cele = przechwycPrzewijanie();
    const { rerender } = render(<ReaderView markdown={DOKUMENT} paged />);

    rerender(<ReaderView markdown={DOKUMENT} />);
    expect(cele[cele.length - 1]).toBe(0);
  });
});

/**
 * Czytnik osadzony w obszarze roboczym o stałej wysokości.
 *
 * Tak wygląda baza wiedzy w aplikacji: pasek boczny, belka u góry i treść
 * w kontenerze z własnym przewijaniem. Okno wtedy stoi w miejscu, więc kod
 * pytający `window.scrollY` dostaje zero i nie robi nic — bez błędu i bez
 * skutku.
 */
describe('gdy przewija kontener, a nie okno', () => {
  it('przełączenie trybu przewija ten kontener', () => {
    const cele: number[] = [];

    const { rerender } = render(
      <div data-testid="obszar" style={{ overflowY: 'auto', height: 600 }}>
        <ReaderView markdown={DOKUMENT} paged />
      </div>,
    );

    const obszar = screen.getByTestId('obszar');
    Object.defineProperty(obszar, 'scrollHeight', { value: 3000, configurable: true });
    Object.defineProperty(obszar, 'clientHeight', { value: 600, configurable: true });
    obszar.scrollTo = ((o: { top?: number }) => { cele.push(o?.top ?? 0); }) as typeof obszar.scrollTo;

    fireEvent.click(screen.getByLabelText(/następna strona/i));
    fireEvent.click(screen.getByLabelText(/następna strona/i));

    rerender(
      <div data-testid="obszar" style={{ overflowY: 'auto', height: 600 }}>
        <ReaderView markdown={DOKUMENT} />
      </div>,
    );

    // Okno nie drgnęło — przewinął się kontener, i to do początku trzeciej strony.
    expect(cele[cele.length - 1]).toBe(1200);
  });
});
