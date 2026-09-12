/**
 * quantity.ts — jednostki na granicach systemu.
 *
 * Zasada, która przesądza o kształcie tego modułu: **jednostki żyją na wejściu
 * i wyjściu, nigdy w pętli solvera**. Parametr z dokumentu („1.5 m", „15 deg")
 * przechodzi tu raz, zamienia się w gołą liczbę w SI i dalej jest zwykłym
 * `number`. Wielkość z jednostką w hot-loopie to narzut bez zysku — a pomylone
 * jednostki i tak łapie się przy wejściu, nie w środku całkowania.
 *
 * Cała robota parsowania i konwersji należy do math.js; tutaj jest tylko
 * wąska fasada, żeby reszta pakietu nie zależała od jego API.
 */
import { create, all, type MathJsInstance } from 'mathjs';

const math: MathJsInstance = create(all, {});

export interface ParsedQuantity {
  /** Wartość po konwersji do jednostki podstawowej SI. */
  si: number;
  /** Jednostka, w której wielkość zapisano — do wyświetlenia z powrotem. */
  unit?: string;
  /** Wymiar w postaci porównywalnej, np. `m / s^2`. */
  dimension?: string;
}

export class UnitError extends Error {}

/**
 * Czyta wielkość z zapisu tekstowego albo liczby.
 *
 * Liczba bez jednostki przechodzi bez zmian — to świadome ustępstwo dla
 * wielkości bezwymiarowych (tłumienie, współczynniki). Gdy `expected` jest
 * podane, niezgodność wymiaru jest błędem, a nie cichą konwersją: „15" tam,
 * gdzie ma być kąt, znaczy co innego niż „15 deg".
 */
export function parseQuantity(input: string | number, expected?: string): ParsedQuantity {
  if (typeof input === 'number') {
    if (expected && expected !== '1') {
      throw new UnitError(`Wartość ${input} nie ma jednostki, a oczekiwano ${expected}.`);
    }
    return { si: input };
  }

  const text = input.trim();
  let value: unknown;
  try {
    value = math.evaluate(text);
  } catch (error) {
    throw new UnitError(`Nie umiem odczytać wielkości „${text}": ${(error as Error).message}`);
  }

  if (typeof value === 'number') {
    if (expected && expected !== '1') {
      throw new UnitError(`„${text}" nie ma jednostki, a oczekiwano ${expected}.`);
    }
    return { si: value };
  }

  if (!math.isUnit(value)) {
    throw new UnitError(`„${text}" nie jest wielkością fizyczną.`);
  }

  const unit = value as unknown as {
    toString(): string;
    toSI(): { toNumber(): number; formatUnits(): string };
    equalBase(other: unknown): boolean;
  };

  if (expected) {
    const reference = math.unit(1, expected) as unknown as { equalBase(other: unknown): boolean };
    if (!reference.equalBase(unit)) {
      throw new UnitError(`„${text}" ma inny wymiar niż oczekiwany ${expected}.`);
    }
  }

  const si = unit.toSI();
  return { si: si.toNumber(), unit: value.toString().replace(/^[\d.eE+-]+\s*/, ''), dimension: si.formatUnits() };
}

/** Skrót: sama wartość w SI. */
export function toSI(input: string | number, expected?: string): number {
  return parseQuantity(input, expected).si;
}

/**
 * Czy dwa zapisy jednostek opisują ten sam wymiar.
 *
 * To jest podstawa analizy wymiarowej wzorów: obie strony równania muszą mieć
 * ten sam wymiar, co według raportu łapie większość błędów w kodzie naukowym.
 */
export function sameDimension(a: string, b: string): boolean {
  try {
    const ua = math.unit(1, a) as unknown as { equalBase(other: unknown): boolean };
    const ub = math.unit(1, b);
    return ua.equalBase(ub);
  } catch {
    return false;
  }
}

/** Formatuje wartość SI z powrotem w zadanej jednostce — do podpisów w UI. */
export function formatIn(si: number, unit: string, digits = 3): string {
  try {
    const value = math.unit(si, math.unit(1, unit).toSI().formatUnits()).to(unit);
    return `${Number(value.toNumber().toPrecision(digits))} ${unit}`;
  } catch {
    return `${Number(si.toPrecision(digits))}`;
  }
}
