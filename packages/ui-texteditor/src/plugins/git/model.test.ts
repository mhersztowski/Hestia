/**
 * Logika panelu kontroli źródeł. Testy pilnują rzeczy, których nie widać po
 * wyglądzie: że plik zmieniony po obu stronach jest w dwóch sekcjach, że commit
 * odmawia z podaniem powodu, i że ścieżki edytora przeliczają się na ścieżki
 * repozytorium — bez tego panel pokazuje zmiany, ale kliknięcie otwiera pustkę.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  groupChanges, statusLetter, statusColor, splitPath,
  commitBlocker, syncLabel, toRepoRelative, workingContent, liczbaPlikow,
} from './model';
import type { GitChange } from './gitApi';

const zmiana = (p: Partial<GitChange> & { path: string }): GitChange => ({
  index: 'unmodified', workTree: 'unmodified',
  staged: false, unstaged: false, conflicted: false, ...p,
});

describe('sekcje listy', () => {
  it('zmiana niezastage\'owana idzie do „Zmiany"', () => {
    const grupy = groupChanges([zmiana({ path: 'a.ts', workTree: 'modified', unstaged: true })]);
    expect(grupy.changes.map((z) => z.path)).toEqual(['a.ts']);
    expect(grupy.staged).toHaveLength(0);
  });

  it('zmiana zastage\'owana idzie do „Przygotowane"', () => {
    const grupy = groupChanges([zmiana({ path: 'a.ts', index: 'modified', staged: true })]);
    expect(grupy.staged.map((z) => z.path)).toEqual(['a.ts']);
  });

  // Jeden plik w dwóch stanach. Pokazanie go raz znaczyłoby, że użytkownik
  // commituje mniej, niż widzi.
  it('zmiana po obu stronach jest w dwóch sekcjach', () => {
    const grupy = groupChanges([zmiana({
      path: 'a.ts', index: 'modified', workTree: 'modified', staged: true, unstaged: true,
    })]);
    expect(grupy.staged).toHaveLength(1);
    expect(grupy.changes).toHaveLength(1);
  });

  it('nieśledzony ma własną sekcję, nie miesza się ze zmianami', () => {
    const grupy = groupChanges([zmiana({ path: 'nowy.ts', index: 'untracked', workTree: 'untracked', unstaged: true })]);
    expect(grupy.untracked.map((z) => z.path)).toEqual(['nowy.ts']);
    expect(grupy.changes).toHaveLength(0);
  });

  it('konflikt wypada ze zwykłych sekcji', () => {
    const grupy = groupChanges([zmiana({ path: 'sporny.ts', conflicted: true, index: 'conflicted', workTree: 'conflicted' })]);
    expect(grupy.conflicts).toHaveLength(1);
    expect(grupy.staged.concat(grupy.changes, grupy.untracked)).toHaveLength(0);
  });
});

describe('znaczniki', () => {
  it('sekcja decyduje, którą stronę pokazać', () => {
    // `AM` — dodany do indeksu, potem jeszcze zmieniony w katalogu roboczym.
    const z = zmiana({ path: 'a.ts', index: 'added', workTree: 'modified', staged: true, unstaged: true });
    expect(statusLetter(z, 'staged')).toBe('A');
    expect(statusLetter(z, 'changes')).toBe('M');
  });

  it('konflikt ma własny znacznik niezależnie od sekcji', () => {
    const z = zmiana({ path: 'a.ts', conflicted: true });
    expect(statusLetter(z, 'conflicts')).toBe('!');
  });

  it('kolory rozróżniają dodanie, usunięcie i zmianę nazwy', () => {
    expect(new Set([statusColor('A'), statusColor('D'), statusColor('R'), statusColor('M')]).size).toBe(4);
  });

  it('nazwa i katalog rozdzielają się', () => {
    expect(splitPath('src/plugins/a.ts')).toEqual({ name: 'a.ts', dir: 'src/plugins' });
    expect(splitPath('README.md')).toEqual({ name: 'README.md', dir: '' });
  });
});

describe('kiedy commit ma sens', () => {
  const puste = groupChanges([]);
  const przygotowane = groupChanges([zmiana({ path: 'a.ts', index: 'modified', staged: true })]);

  // Wyszarzony przycisk bez wyjaśnienia zmusza do zgadywania, a przyczyny są
  // trzy i każda wymaga czego innego.
  it('brak opisu, brak przygotowanych plików i konflikt mają różne powody', () => {
    expect(commitBlocker(przygotowane, '   ')).toMatch(/opis/i);
    expect(commitBlocker(puste, 'poprawka')).toMatch(/nic nie jest przygotowane/i);
    const zKonfliktem = groupChanges([zmiana({ path: 'x', conflicted: true })]);
    expect(commitBlocker(zKonfliktem, 'poprawka')).toMatch(/konflikt/i);
  });

  it('konflikt przesłania pozostałe powody', () => {
    // Git i tak odmówi, więc mówienie o brakującym opisie byłoby myleniem tropu.
    const zKonfliktem = groupChanges([zmiana({ path: 'x', conflicted: true })]);
    expect(commitBlocker(zKonfliktem, '')).toMatch(/konflikt/i);
  });

  it('komplet warunków spełniony — brak przeszkody', () => {
    expect(commitBlocker(przygotowane, 'poprawka')).toBeNull();
  });
});

describe('synchronizacja', () => {
  it('pokazuje kierunek i liczbę commitów', () => {
    expect(syncLabel(0, 0)).toMatch(/zsynchronizowane/i);
    expect(syncLabel(3, 0)).toContain('↑ 3');
    expect(syncLabel(0, 2)).toContain('↓ 2');
    expect(syncLabel(1, 2)).toMatch(/↓ 2.*↑ 1/);
  });
});

describe('ścieżki', () => {
  // Edytor operuje ścieżkami VFS, git — względem korzenia repozytorium.
  // Bez tego przeliczenia kliknięcie w plik otwiera pustkę.
  it('plik edytora przelicza się na ścieżkę w repozytorium', () => {
    expect(toRepoRelative('/drive/projekt/src/a.ts', 'drive/projekt')).toBe('src/a.ts');
    expect(toRepoRelative('drive/projekt/a.ts', '/drive/projekt/')).toBe('a.ts');
  });

  it('plik spoza repozytorium daje null, a nie zgadywaną ścieżkę', () => {
    expect(toRepoRelative('/drive/inny/a.ts', 'drive/projekt')).toBeNull();
  });
});

describe('znaczniki zmian na marginesie', () => {
  it('dodane wiersze', async () => {
    const { policzZmiany } = await import('./GitPlugin');
    const zmiany = policzZmiany('a\nb\nc', 'a\nNOWY\nb\nc');
    expect(zmiany).toEqual([{ od: 2, do: 2, rodzaj: 'added' }]);
  });

  it('zmieniony wiersz', async () => {
    const { policzZmiany } = await import('./GitPlugin');
    const zmiany = policzZmiany('a\nb\nc', 'a\nZMIENIONE\nc');
    expect(zmiany[0]).toMatchObject({ rodzaj: 'modified', od: 2 });
  });

  it('brak zmian to brak znaczników', async () => {
    const { policzZmiany } = await import('./GitPlugin');
    expect(policzZmiany('a\nb\nc', 'a\nb\nc')).toEqual([]);
  });

  // Usunięcie nie ma własnego wiersza — znacznik idzie przy tym, który został,
  // bo inaczej nie byłoby go gdzie postawić.
  it('usunięcie oznacza wiersz, który po nim został', async () => {
    const { policzZmiany } = await import('./GitPlugin');
    const zmiany = policzZmiany('a\nb\nc', 'a\nc');
    expect(zmiany.some((z) => z.rodzaj === 'deleted')).toBe(true);
  });

  it('nowy plik: wszystko dodane', async () => {
    const { policzZmiany } = await import('./GitPlugin');
    const zmiany = policzZmiany('', 'a\nb');
    expect(zmiany[0].rodzaj).toBe('added');
  });

  it('zupełnie różne pliki nie zawieszają porównania', async () => {
    // Okno wyszukiwania jest ograniczone właśnie po to: bez niego dwa niepodobne
    // pliki dawałyby przeszukiwanie wszystkiego razy wszystko.
    const { policzZmiany } = await import('./GitPlugin');
    const a = Array.from({ length: 2000 }, (_, i) => `stary ${i}`).join('\n');
    const b = Array.from({ length: 2000 }, (_, i) => `nowy ${i}`).join('\n');
    const start = Date.now();
    expect(policzZmiany(a, b).length).toBeGreaterThan(0);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('treść „po" dla widoku różnic', () => {
  // To był ten błąd: kliknięcie pliku w panelu — czyli normalny sposób
  // obejrzenia zmiany, bez otwierania go w zakładce — dawało pustą prawą
  // stronę, więc cały plik szedł na czerwono jako usunięty w całości.
  // Wyglądało to na błąd liczenia różnicy, a było porównaniem z niczym.
  it('nieotwarty plik czyta się z dysku, a nie jako pusty', async () => {
    const zDysku = vi.fn(async () => 'linia 1\nlinia 2\n');
    const tresc = await workingContent({ fromEditor: () => null, fromDisk: zDysku });
    expect(tresc).toBe('linia 1\nlinia 2\n');
    expect(zDysku).toHaveBeenCalled();
  });

  it('otwarta zakładka wygrywa z dyskiem — niesie niezapisane zmiany', async () => {
    const zDysku = vi.fn(async () => 'wersja z dysku');
    const tresc = await workingContent({ fromEditor: () => 'wersja z edytora', fromDisk: zDysku });
    expect(tresc).toBe('wersja z edytora');
    expect(zDysku).not.toHaveBeenCalled();
  });

  // Rozróżnienie po samej pustce zamiast po `null` cofnęłoby tamten błąd
  // tylnymi drzwiami: plik wyczyszczony do zera pokazywałby treść z dysku,
  // czyli różnicę, której użytkownik właśnie się pozbył.
  it('pusta zakładka to treść, a nie brak zakładki', async () => {
    const zDysku = vi.fn(async () => 'cos jednak jest');
    const tresc = await workingContent({ fromEditor: () => '', fromDisk: zDysku });
    expect(tresc).toBe('');
    expect(zDysku).not.toHaveBeenCalled();
  });
});

describe('odmiana liczby plików', () => {
  // Potwierdzenia operacji nieodwracalnych trzeba zrozumieć w sekundę,
  // a „Usunąć 1 plików" każe czytać drugi raz.
  it('jeden', () => { expect(liczbaPlikow(1)).toBe('1 plik'); });
  it('dwa do czterech', () => {
    expect(liczbaPlikow(2)).toBe('2 pliki');
    expect(liczbaPlikow(4)).toBe('4 pliki');
    expect(liczbaPlikow(23)).toBe('23 pliki');
  });
  it('pięć i więcej', () => {
    expect(liczbaPlikow(5)).toBe('5 plików');
    expect(liczbaPlikow(11)).toBe('11 plików');
    expect(liczbaPlikow(0)).toBe('0 plików');
  });
  // Nastolatki są wyjątkiem: 12, 13, 14 idą jak „pięć", nie jak „dwa".
  it('nastolatki idą jak pięć', () => {
    expect(liczbaPlikow(12)).toBe('12 plików');
    expect(liczbaPlikow(14)).toBe('14 plików');
    expect(liczbaPlikow(112)).toBe('112 plików');
  });
});
