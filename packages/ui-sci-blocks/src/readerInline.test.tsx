/**
 * Symbol matematyczny i odsyłacz do hasła w biegnącym tekście.
 *
 * W podręczniku kursywa robi dwie różne rzeczy naraz: wprowadza **pojęcie**
 * („nazywamy *ruchem okresowym*") i składa **symbol** („siła *F* działająca").
 * W 15-1 na 41 kursyw 22 to symbole. Zapisane jednakowo są w źródle nie do
 * odróżnienia, więc symbole idą jako matematyka w linii, a pojęcia jako
 * odsyłacz do słownika.
 *
 * Odsyłacz do hasła renderuje się **kursywą**, bo tak termin definiowany
 * wygląda w druku — znacznik nie ma prawa zmienić tego, co czytelnik widzi.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReaderView } from './ReaderView';

afterEach(cleanup);

const dokument = (tresc: string) => ['---', 'title: Test', '---', '', tresc, ''].join('\n');

describe('matematyka w linii', () => {
  it('składa $x$ jako matematykę, nie jako tekst z dolarami', () => {
    const { container } = render(render_(dokument('Punkt odległy o $x$ od położenia.')));
    expect(container.querySelector('.katex')).toBeTruthy();
    expect(container.textContent).not.toContain('$');
  });

  it('nie tyka pojedynczego dolara ani kwoty', () => {
    // „koszt 5 $ za sztukę" nie jest wzorem; para musi być domknięta.
    const { container } = render(render_(dokument('koszt 5 $ za sztukę')));
    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toContain('5 $');
  });

  it('nie rozrywa bloku $$…$$ i nie zostawia samotnego dolara', () => {
    // Wzorzec dla linii wgryzał się w środek („$F = ma$" z „$$F = ma$$")
    // i zostawiał końcowy dolar jako tekst.
    const { container } = render(render_(dokument('$$F = ma$$')));
    expect(container.querySelector('.katex')).toBeTruthy();
    expect(container.textContent).not.toContain('$');
  });

  it('wzór blokowy w akapicie z tekstem wokół zostaje blokiem', () => {
    const { container } = render(render_(dokument('Przed. $$E = mc^2$$ Po.')));
    expect(container.querySelector('.katex-display')).toBeTruthy();
    expect(container.textContent).not.toContain('$');
  });

  it('symbol nie gubi tekstu wokół', () => {
    render(render_(dokument('siła $F$ działająca na punkt')));
    expect(screen.getByText(/działająca na punkt/)).toBeTruthy();
  });
});

describe('odsyłacz do hasła słownika', () => {
  const resolveRef = (id: string) => (id === 'rh1-poj-ruch-okresowy'
    ? {
      kind: 'term' as const,
      code: 'Ruch okresowy\n@definition Ruch, który powtarza się w regularnych odstępach czasu.',
      documentTitle: 'Słownik zagadnień',
      sameDocument: false,
    }
    : undefined);

  it('pokazuje podpis, a nie identyfikator', () => {
    render(render_(dokument('nazywamy ((rh1-poj-ruch-okresowy|ruchem okresowym)).'), resolveRef));
    expect(screen.getByText('ruchem okresowym')).toBeTruthy();
  });

  it('renderuje się kursywą — tak jak termin w druku', () => {
    render(render_(dokument('nazywamy ((rh1-poj-ruch-okresowy|ruchem okresowym)).'), resolveRef));
    expect(getComputedStyle(screen.getByText('ruchem okresowym')).fontStyle).toBe('italic');
  });

  it('bez podpisu pokazuje nazwę hasła, nie identyfikator', () => {
    render(render_(dokument('nazywamy ((rh1-poj-ruch-okresowy)).'), resolveRef));
    expect(screen.getByText('Ruch okresowy')).toBeTruthy();
  });

  it('hasło, którego nie ma, jest widocznie oznaczone', () => {
    render(render_(dokument('patrz ((rh1-poj-nie-ma|coś)).'), resolveRef));
    const el = screen.getByText('coś');
    expect(el.getAttribute('title')).toMatch(/nie ma/i);
  });
});

/** Skrót — ReaderView z jednym opcjonalnym propem. */
function render_(markdown: string, resolveRef?: (id: string) => any) {
  return <ReaderView markdown={markdown} path="t.md" resolveRef={resolveRef} />;
}

describe('escape i cytat blokowy', () => {
  it('\\* jest zwykłą gwiazdką, a nie początkiem kursywy', () => {
    // Książka oznacza przypis gwiazdką. Bez obsługi escape'u ta gwiazdka
    // otwierała kursywę, która połykała wszystko do następnej — razem
    // z odsyłaczami do słownika po drodze.
    const { container } = render(render_(dokument('herc (Hz)\\*. Dalej *kursywa* i koniec.')));
    expect(container.textContent).toContain('(Hz)*.');
    expect(container.textContent).not.toContain('\\');
    expect(container.querySelectorAll('em')).toHaveLength(1);
  });

  it('escape nie połyka odsyłacza stojącego za nim', () => {
    const resolveRef = () => ({ kind: 'term' as const, code: 'Coś\n@definition Definicja.', sameDocument: true });
    render(render_(dokument('(Hz)\\*. Położeniem ((rh1-poj-x|równowagi)) nazywamy *to*.'), resolveRef));
    expect(screen.getByText('równowagi')).toBeTruthy();
  });

  it('cytat blokowy renderuje się bez znaku >', () => {
    // Podpisy rysunków w podręczniku stoją jako cytaty blokowe.
    const { container } = render(render_(dokument('> **Rys. 15-1.** Punkt materialny.')));
    expect(container.textContent).not.toContain('>');
    expect(container.querySelector('blockquote')).toBeTruthy();
    expect(container.textContent).toContain('Rys. 15-1.');
  });

  it('cytat złożony z kilku wierszy jest jednym blokiem', () => {
    const { container } = render(render_(dokument('> Pierwszy wiersz\n> drugi wiersz')));
    expect(container.querySelectorAll('blockquote')).toHaveLength(1);
    expect(container.textContent).toContain('Pierwszy wiersz drugi wiersz');
  });
});
