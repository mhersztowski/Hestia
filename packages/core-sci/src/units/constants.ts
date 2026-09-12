/**
 * constants.ts — stałe fizyczne (CODATA 2018) w jednostkach SI.
 *
 * Wartości wpisane wprost, nie wyliczane: stała fizyczna jest daną, a nie
 * wynikiem, i musi dać się porównać z tablicami co do cyfry. Każda ma jednostkę
 * przy sobie, bo bez niej liczba nic nie znaczy.
 */

export interface PhysicalConstant {
  symbol: string;
  name: string;
  value: number;
  unit: string;
}

export const CONSTANTS: Record<string, PhysicalConstant> = {
  c: { symbol: 'c', name: 'prędkość światła w próżni', value: 299_792_458, unit: 'm/s' },
  G: { symbol: 'G', name: 'stała grawitacji', value: 6.674_30e-11, unit: 'm^3/(kg s^2)' },
  h: { symbol: 'h', name: 'stała Plancka', value: 6.626_070_15e-34, unit: 'J s' },
  hbar: { symbol: 'ℏ', name: 'zredukowana stała Plancka', value: 1.054_571_817e-34, unit: 'J s' },
  k_B: { symbol: 'k_B', name: 'stała Boltzmanna', value: 1.380_649e-23, unit: 'J/K' },
  N_A: { symbol: 'N_A', name: 'stała Avogadra', value: 6.022_140_76e23, unit: 'mol^-1' },
  R: { symbol: 'R', name: 'stała gazowa', value: 8.314_462_618, unit: 'J/(mol K)' },
  e: { symbol: 'e', name: 'ładunek elementarny', value: 1.602_176_634e-19, unit: 'C' },
  m_e: { symbol: 'm_e', name: 'masa elektronu', value: 9.109_383_7015e-31, unit: 'kg' },
  m_p: { symbol: 'm_p', name: 'masa protonu', value: 1.672_621_923_69e-27, unit: 'kg' },
  epsilon_0: { symbol: 'ε₀', name: 'przenikalność elektryczna próżni', value: 8.854_187_8128e-12, unit: 'F/m' },
  mu_0: { symbol: 'μ₀', name: 'przenikalność magnetyczna próżni', value: 1.256_637_062_12e-6, unit: 'N/A^2' },
  sigma: { symbol: 'σ', name: 'stała Stefana-Boltzmanna', value: 5.670_374_419e-8, unit: 'W/(m^2 K^4)' },
  // Nie jest stałą fundamentalną, tylko przyjętą wartością normalną — ale w
  // dydaktyce mechaniki pojawia się częściej niż wszystkie powyższe razem.
  g_n: { symbol: 'g', name: 'przyspieszenie ziemskie (normalne)', value: 9.806_65, unit: 'm/s^2' },
};

/** Wartość stałej w SI; `undefined`, gdy nie znamy takiej. */
export function constantValue(name: string): number | undefined {
  return CONSTANTS[name]?.value;
}
