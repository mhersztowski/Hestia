import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReaderView } from './ReaderView';

/**
 * Pozycja listy złamana na wiersze musi wrócić w całości.
 *
 * Dokumenty w bazie są zawijane na 80 kolumn, więc **każda** dłuższa pozycja
 * jest wielowierszowa. Filtrowanie linii po myślniku gubiło kontynuacje po
 * cichu: lista wyglądała na kompletną, a niosła pierwszy wiersz każdej pozycji.
 */
describe('lista w czytniku', () => {
  it('punktowana pozycja złamana na wiersze składa się z powrotem', () => {
    const { container } = render(
      <ReaderView markdown={'- pierwsza pozycja, która\n  ciągnie się dalej\n- druga pozycja'} path="t.md" />,
    );
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(['pierwsza pozycja, która ciągnie się dalej', 'druga pozycja']);
  });

  it('numerowana pozycja też', () => {
    const { container } = render(
      <ReaderView markdown={'1. pytanie o to,\n   co dalej\n2. drugie pytanie'} path="t.md" />,
    );
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(['pytanie o to, co dalej', 'drugie pytanie']);
  });

  it('wyróżnienia w kontynuacji działają tak samo jak w pierwszym wierszu', () => {
    const { container } = render(
      <ReaderView markdown={'- początek pozycji\n  i **mocny** ciąg dalszy'} path="t.md" />,
    );
    expect(container.querySelector('li')?.textContent).toBe('początek pozycji i mocny ciąg dalszy');
    expect(container.querySelector('li strong')?.textContent).toBe('mocny');
  });
});

/**
 * Wyróżnienie może obejmować symbol matematyczny — w podręczniku to sytuacja
 * zwykła („*Jeżeli stała $b$ jest mała*"). Zawartość `*…*` i `**…**` szła dotąd
 * na wyjście **surowa**, więc czytelnik widział w kursywie dolary.
 */
describe('zagnieżdżenia w wyróżnieniu', () => {
  it('matematyka wewnątrz kursywy się składa', () => {
    const { container } = render(
      <ReaderView markdown={'zdanie *Jeżeli stała $b$ jest mała*, dalej.'} path="t.md" />,
    );
    expect(container.textContent).not.toContain('$');
    expect(container.querySelector('em .katex')).toBeTruthy();
  });

  it('matematyka wewnątrz pogrubienia też', () => {
    const { container } = render(
      <ReaderView markdown={'**stała $k$ jest dodatnia**'} path="t.md" />,
    );
    expect(container.textContent).not.toContain('$');
    expect(container.querySelector('strong .katex')).toBeTruthy();
  });

  it('kod w linii wewnątrz pogrubienia działa', () => {
    const { container } = render(<ReaderView markdown={'**blok `@relation` tutaj**'} path="t.md" />);
    expect(container.textContent).not.toContain('`');
    expect(container.querySelector('strong code')?.textContent).toBe('@relation');
  });

  it('zwykłe wyróżnienie bez zagnieżdżeń zostaje jak było', () => {
    const { container } = render(<ReaderView markdown={'to jest *ważne* zdanie'} path="t.md" />);
    expect(container.querySelector('em')?.textContent).toBe('ważne');
  });
});

/**
 * Numer pozycji jest treścią, a nie ozdobą: podręcznik odsyła „patrz zadanie 31",
 * a numeracja pytań i zadań biegnie ciągiem przez cały rozdział — również przez
 * akapity wtrącone w środek listy i przez nagłówki grup („Paragraf 15-3").
 * Bez `start` każda przerwa zaczynała liczenie od nowa.
 */
describe('numeracja listy przez przerwy', () => {
  it('lista po akapicie wtrąconym liczy dalej, a nie od nowa', () => {
    const md = ['1. Pierwsze.', '2. Drugie.', '', 'Akapit w środku.', '', '3. Trzecie.', '4. Czwarte.'].join('\n');
    const { container } = render(<ReaderView markdown={md} path="t.md" />);
    const listy = [...container.querySelectorAll('ol')];
    expect(listy).toHaveLength(2);
    expect(listy[0].getAttribute('start')).toBe('1');
    expect(listy[1].getAttribute('start')).toBe('3');
  });

  it('lista zaczynająca się od dużego numeru zachowuje go', () => {
    const { container } = render(<ReaderView markdown={'29. Dwudzieste dziewiąte.\n30. Trzydzieste.'} path="t.md" />);
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('29');
  });

  it('lista od jedynki nie potrzebuje niczego więcej', () => {
    const { container } = render(<ReaderView markdown={'1. Jeden.\n2. Dwa.'} path="t.md" />);
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('1');
    expect([...container.querySelectorAll('li')].map((l) => l.textContent)).toEqual(['Jeden.', 'Dwa.']);
  });
});

/**
 * Dokumenty bazy są zawijane na 80 kolumn, więc dłuższy wzór w linii **musi**
 * czasem przejść przez łamanie wiersza — tak jak podpis odsyłacza, który skleja
 * się od 15-2. Bez tego `$…$` rozjeżdżało się po cichu: w źródle wyglądało
 * poprawnie, a czytelnik dostawał surowe dolary razem z LaTeX-em. Wyszło na 4-6,
 * przy `d**r**′/d*t* = **v**′`.
 */
describe('matematyka w linii złamana na wiersze', () => {
  it('składa się z powrotem w jeden wzór', () => {
    const { container } = render(
      <ReaderView markdown={'Ale $\\mathrm{d}\\mathbf{r}/\\mathrm{d}t =\n\\mathbf{v}$ jest prędkością.'} path="t.md" />,
    );
    const t = container.textContent ?? '';
    // KaTeX dokłada do drzewa własną kopię źródła (MathML `annotation`), więc
    // sam LaTeX w `textContent` jest normalny — dowodem złożenia jest brak
    // dolarów i obecność złożonego wzoru.
    expect(t).not.toContain('$');
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(t).toContain('jest prędkością.');
  });

  it('pusty wiersz dalej kończy akapit, więc samotny dolar nie połyka tekstu', () => {
    const { container } = render(
      <ReaderView markdown={'Cena to 5 $ za sztukę.\n\nDrugi akapit z $x$ w środku.'} path="t.md" />,
    );
    const akapity = [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(akapity[0]).toContain('5 $ za sztukę.');
    expect(akapity[1]).not.toContain('$');
  });
});
