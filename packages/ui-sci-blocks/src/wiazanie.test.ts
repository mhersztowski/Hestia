/**
 * Jedna konwencja wiązania bloku z jego matematyką.
 *
 * Bloki uruchamiające znajdowały swój wzór na trzy różne sposoby: `sim` widział
 * wszystkie bloki dokumentu, `field` i `linalg` szukały bloku o dokładnie tym
 * samym identyfikatorze, a `exercise` deklarował wzory przez `@uses`. Trzy
 * konwencje na jedno pojęcie „skąd ten blok bierze matematykę" — autor musiał
 * pamiętać, która obowiązuje gdzie, a komunikat o błędzie przychodził dopiero
 * po fakcie.
 *
 * Wybraliśmy tę z `field`/`linalg` (identyfikator = identyfikator), bo jest
 * jawna i widoczna w infostringu. `sim` bez identyfikatora działa dalej jak
 * dotąd — inaczej każdy istniejący dokument wymagałby poprawki.
 */
import { describe, it, expect } from 'vitest';
import { znajdzWzor, opiszBrakWzoru, zZaleznosciami } from './wiazanie';

const BLOKI = [
  { language: 'formula:cieplo', code: '@pde\n@field u\n@grid 8 x 8' },
  { language: 'formula:scinanie', code: '@linalg\n@mat S = [[1, 1], [0, 1]]' },
  { language: 'formula:okres', code: 'T = 2\\pi\\sqrt{\\frac{L}{g}}' },
  { language: 'sim', code: '{}' },
];

describe('znajdzWzor', () => {
  it('znajduje wzór po identyfikatorze', () => {
    expect(znajdzWzor(BLOKI, 'cieplo')?.language).toBe('formula:cieplo');
  });

  it('sprawdza dodatkowy warunek treści, gdy podany', () => {
    // Blok pola musi wskazać blok z `@pde`, a nie dowolny wzór o tej nazwie.
    expect(znajdzWzor(BLOKI, 'okres', /@pde/)).toBeUndefined();
    expect(znajdzWzor(BLOKI, 'cieplo', /@pde/)?.language).toBe('formula:cieplo');
  });

  it('nie myli bloku wzoru z blokiem uruchomienia', () => {
    expect(znajdzWzor([{ language: 'field:cieplo', code: '{}' }], 'cieplo')).toBeUndefined();
  });

  it('brak identyfikatora znaczy brak wzoru', () => {
    expect(znajdzWzor(BLOKI, undefined)).toBeUndefined();
  });
});

describe('opiszBrakWzoru', () => {
  it('mówi, czego brakuje i jak to napisać', () => {
    const opis = opiszBrakWzoru('pola', 'cieplo', '@pde');
    expect(opis).toContain('cieplo');
    expect(opis).toContain('formula:cieplo');
    expect(opis).toContain('@pde');
  });

  it('podpowiada podobny identyfikator, gdy autor się pomylił', () => {
    // Literówka w nazwie jest najczęstszą przyczyną „nie ma wzoru", a autor
    // patrzy wtedy na blok wzoru i nie widzi w nim nic złego.
    const opis = opiszBrakWzoru('pola', 'cieplo', '@pde', ['cieplo-2d', 'fala']);
    expect(opis).toContain('cieplo-2d');
  });

  it('bez podobnej nazwy nie sugeruje pomyłki', () => {
    // Lista dostępnych wzorów zostaje — to informacja, nie domysł. Ale
    // „czy chodziło o" przy nazwie niepodobnej byłoby prowadzeniem na manowce.
    const opis = opiszBrakWzoru('algebry', 'scena', '@linalg', ['zupelnie-co-innego']);
    expect(opis).not.toContain('Czy chodziło');
  });

  it('wymienia wzory dostępne w dokumencie, gdy jest ich niewiele', () => {
    const opis = opiszBrakWzoru('pola', 'x', '@pde', ['cieplo', 'fala']);
    expect(opis).toMatch(/cieplo|fala/);
  });
});

describe('zZaleznosciami', () => {
  const WZORY = [
    { id: 'energia' },
    { id: 'predkosc', derivedFrom: ['energia'] },
    { id: 'zasieg', derivedFrom: ['predkosc'] },
    { id: 'osobny' },
  ];

  it('bierze wzór i to, z czego wynika', () => {
    expect(zZaleznosciami(WZORY, 'predkosc').map((f) => f.id)).toEqual(['energia', 'predkosc']);
  });

  it('idzie przez cały łańcuch zależności', () => {
    // Zawężenie do jednego bloku byłoby regresją: graf bez wzoru pośredniego
    // albo się nie skompiluje, albo weźmie brakującą wielkość za parametr.
    expect(zZaleznosciami(WZORY, 'zasieg').map((f) => f.id))
      .toEqual(['energia', 'predkosc', 'zasieg']);
  });

  it('pomija wzory niezwiązane', () => {
    expect(zZaleznosciami(WZORY, 'zasieg').map((f) => f.id)).not.toContain('osobny');
  });

  it('nieistniejąca zależność nie wywraca domknięcia', () => {
    expect(zZaleznosciami([{ id: 'a', derivedFrom: ['nie-ma'] }], 'a').map((f) => f.id)).toEqual(['a']);
  });

  it('cykl w zależnościach się nie zapętla', () => {
    const cykl = [{ id: 'a', derivedFrom: ['b'] }, { id: 'b', derivedFrom: ['a'] }];
    expect(zZaleznosciami(cykl, 'a').map((f) => f.id)).toEqual(['a', 'b']);
  });
});
