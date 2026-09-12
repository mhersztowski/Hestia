/**
 * reservedSymbols.ts — nazwy, których silnik matematyczny nie odda.
 *
 * Compute Engine ma wbudowane znaczenia dla kilku pojedynczych liter i
 * poleceń LaTeX-a. Kto ich użyje jako zmiennych, dostanie wynik policzony z
 * cudzą stałą — bez błędu, bez ostrzeżenia, po prostu inny.
 *
 * Lista powstała z prób, nie z dokumentacji: każdą pozycję sprawdzono,
 * kompilując `2 \cdot <nazwa>` i patrząc, czy symbol trafia do wolnych zmiennych.
 * Dlatego zawiera dokładnie te przypadki, które naprawdę gryzą — a każdy z nich
 * gryzie w konkretnej dziedzinie:
 *
 *  • `i` w elektronice to prąd, w silniku jednostka urojona,
 *  • `e` w fizyce ładunek elementarny, w silniku podstawa logarytmu,
 *  • `G` w astronomii stała grawitacji, w silniku stała Catalana,
 *  • `\gamma` w mechanice tłumienie, w silniku stała Eulera–Mascheroniego.
 *
 * Podpowiadana zamiana jest zawsze taka, której fizycy i tak używają: `I` na
 * prąd, `G_N` na stałą grawitacji.
 */
export interface ReservedSymbol {
  /** Co ta nazwa znaczy dla silnika. */
  meaning: string;
  /** Nazwa, której warto użyć zamiast niej. */
  suggestion: string;
}

export const RESERVED_SYMBOLS: Record<string, ReservedSymbol> = {
  i: { meaning: 'jednostka urojona', suggestion: 'I albo i_L' },
  e: { meaning: 'podstawa logarytmu naturalnego', suggestion: 'e_0 albo q_e' },
  G: { meaning: 'stała Catalana', suggestion: 'G_N' },
  gamma: { meaning: 'stała Eulera–Mascheroniego', suggestion: 'beta albo gamma_d' },
  pi: { meaning: 'liczba π', suggestion: 'p albo inna nazwa' },
};

/** Opis kolizji dla nazwy; `undefined`, gdy nazwa jest wolna. */
export function reservedSymbol(name: string): ReservedSymbol | undefined {
  return RESERVED_SYMBOLS[name];
}
