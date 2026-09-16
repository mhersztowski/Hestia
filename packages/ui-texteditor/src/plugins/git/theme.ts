/**
 * Motywy MUI dla widoków kontroli źródeł.
 *
 * Komponenty MUI dostają domyślnie motyw **jasny** i rysują niemal czarny tekst,
 * a chrom edytora ma kolory wpisane na stałe i jest ciemny — panel wychodzi
 * nieczytelny, „zlany z tłem" (docs/plugins.md §5). Nic się tu nie dziedziczy po
 * hoście, więc każdy korzeń renderowania wtyczki musi motyw podać sam.
 *
 * Dwa, bo boczny pasek i obszar zakładek mają w edytorze **różne** tła
 * (`#252526` i `#1e1e1e`); jeden wspólny znaczyłby, że w jednym z tych miejsc
 * powierzchnie MUI odcinają się prostokątem od otoczenia.
 */

import { createTheme } from '@mui/material/styles';

const wspolne = {
  text: { primary: '#cccccc', secondary: '#9d9d9d' },
  divider: '#3c3c3c',
  // Domyślne wygaszenie MUI (30% bieli) na tym tle robi z „Commit"
  // napis na granicy widoczności — a to jedyne miejsce, które tłumaczy,
  // czego brakuje do commita, więc musi dać się przeczytać.
  action: {
    disabled: 'rgba(255, 255, 255, 0.45)',
    disabledBackground: 'rgba(255, 255, 255, 0.12)',
  },
} as const;

/** Boczny pasek — tło `#252526`, jak lista plików w eksploratorze. */
export const MOTYW_PASKA = createTheme({
  palette: { mode: 'dark', background: { paper: '#252526', default: '#252526' }, ...wspolne },
});

/** Zakładka edytora — tło `#1e1e1e`, jak obszar kodu. */
export const MOTYW_ZAKLADKI = createTheme({
  palette: { mode: 'dark', background: { paper: '#1e1e1e', default: '#1e1e1e' }, ...wspolne },
});
