/**
 * Format `--porcelain` jest ustalony, więc da się go sprawdzić bez repozytorium.
 * Warto, bo pomyłka pokazuje plik w złej sekcji — czyli namawia użytkownika do
 * zacommitowania czegoś, czego nie chciał.
 */
import { describe, it, expect } from 'vitest';
import { parsePorcelain, groupChanges, statusLetter } from './porcelain';

/** Buduje wyjście `-z`: wpisy rozdzielone bajtem zerowym. */
const z = (...wpisy: string[]) => `${wpisy.join('\0')}\0`;

describe('odczyt stanu', () => {
  it('modyfikacja tylko w katalogu roboczym', () => {
    const [zmiana] = parsePorcelain(z(' M src/a.ts'));
    expect(zmiana).toMatchObject({
      path: 'src/a.ts',
      index: 'unmodified',
      workTree: 'modified',
      staged: false,
      unstaged: true,
    });
  });

  it("modyfikacja zastage'owana", () => {
    const [zmiana] = parsePorcelain(z('M  src/a.ts'));
    expect(zmiana).toMatchObject({ staged: true, unstaged: false });
  });

  // `MM` to jeden plik w dwóch stanach — dlatego trafia do dwóch sekcji.
  // Ukrycie jednej połówki znaczyłoby, że użytkownik commituje mniej, niż widzi.
  it('zmiany po obu stronach są widoczne po obu stronach', () => {
    const [zmiana] = parsePorcelain(z('MM src/a.ts'));
    expect(zmiana.staged).toBe(true);
    expect(zmiana.unstaged).toBe(true);
    const grupy = groupChanges([zmiana]);
    expect(grupy.staged).toHaveLength(1);
    expect(grupy.changes).toHaveLength(1);
  });

  it('nowy plik: nieśledzony kontra dodany do indeksu', () => {
    const [nowy] = parsePorcelain(z('?? nowy.txt'));
    expect(nowy.index).toBe('untracked');
    expect(nowy.staged).toBe(false);

    const [dodany] = parsePorcelain(z('A  nowy.txt'));
    expect(dodany.staged).toBe(true);
    expect(groupChanges([dodany]).staged).toHaveLength(1);
  });

  it('usunięcie po obu stronach', () => {
    expect(parsePorcelain(z(' D a.txt'))[0]).toMatchObject({ workTree: 'deleted', unstaged: true });
    expect(parsePorcelain(z('D  a.txt'))[0]).toMatchObject({ index: 'deleted', staged: true });
  });
});

describe('zmiana nazwy', () => {
  // Wpis niesie dwie ścieżki; pominięcie drugiej przesuwa cały dalszy odczyt
  // o jedno pole i reszta listy wychodzi bez sensu.
  it('czyta nową i starą nazwę, nie gubiąc kolejnych wpisów', () => {
    const zmiany = parsePorcelain(z('R  nowa.ts', 'stara.ts', ' M inny.ts'));
    expect(zmiany).toHaveLength(2);
    expect(zmiany[0]).toMatchObject({ path: 'nowa.ts', oldPath: 'stara.ts', index: 'renamed' });
    expect(zmiany[1].path).toBe('inny.ts');
  });

  it('kopia działa tak samo jak zmiana nazwy', () => {
    const [zmiana] = parsePorcelain(z('C  kopia.ts', 'wzor.ts'));
    expect(zmiana).toMatchObject({ index: 'copied', oldPath: 'wzor.ts' });
  });
});

describe('nazwy plików', () => {
  // Bez `-z` git cytowałby taką nazwę albo rozbił ją na dwa wiersze.
  it('spacje w nazwie nie rozbijają wpisu', () => {
    const [zmiana] = parsePorcelain(z(' M katalog z spacja/plik i nazwa.txt'));
    expect(zmiana.path).toBe('katalog z spacja/plik i nazwa.txt');
  });

  it('znak nowej linii w nazwie też przechodzi', () => {
    const [zmiana] = parsePorcelain(z(' M dziwny\nplik.txt'));
    expect(zmiana.path).toBe('dziwny\nplik.txt');
  });
});

describe('konflikty', () => {
  // Siedem kombinacji, każda znaczy inny rodzaj zderzenia; dla listy liczy się
  // jedno: tego pliku nie wolno zacommitować, zanim ktoś tego nie rozstrzygnie.
  it.each(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'])('%s to konflikt', (kod) => {
    const [zmiana] = parsePorcelain(z(`${kod} sporny.ts`));
    expect(zmiana.conflicted).toBe(true);
    expect(zmiana.staged).toBe(false);
    expect(groupChanges([zmiana]).conflicts).toHaveLength(1);
  });

  it('konflikt nie trafia do zwykłych sekcji', () => {
    const grupy = groupChanges(parsePorcelain(z('UU a.ts', ' M b.ts')));
    expect(grupy.conflicts.map((c) => c.path)).toEqual(['a.ts']);
    expect(grupy.changes.map((c) => c.path)).toEqual(['b.ts']);
  });
});

describe('drobiazgi', () => {
  it('puste wyjście to brak zmian', () => {
    expect(parsePorcelain('')).toEqual([]);
    expect(parsePorcelain('\0')).toEqual([]);
  });

  it('znaczniki są takie, jak w edytorze', () => {
    expect(statusLetter('added')).toBe('A');
    expect(statusLetter('deleted')).toBe('D');
    expect(statusLetter('renamed')).toBe('R');
    expect(statusLetter('modified')).toBe('M');
    expect(statusLetter('untracked')).toBe('U');
  });
});
