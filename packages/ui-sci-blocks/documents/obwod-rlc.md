---
title: Obwód RLC
tags: [elektronika, drgania]
requires: [Rezonans w oscylatorze wymuszonym]
---
# Obwód RLC

Kondensator, cewka i opornik w szereg zachowują się dokładnie tak jak masa na
sprężynie z tarciem. To nie jest analogia dydaktyczna, tylko to samo równanie —
dlatego wszystko, co wiadomo o rezonansie mechanicznym, przenosi się tu wprost.

## Wielkości charakterystyczne

```formula:rlc-omega
\omega_0 = \frac{1}{\sqrt{L \cdot C}}
@vars omega_0: s^-1, L: H, C: F
```

```formula:rlc-dobroc
Q = \frac{1}{R} \cdot \sqrt{\frac{L}{C}}
@vars Q: 1, R: ohm, L: H, C: F
@derivedFrom rlc-omega
```

Dobroć `Q` mówi, ile okresów potrwa zanik. Duże `Q` to wąski, ostry rezonans —
w mechanice odpowiada mu słabe tłumienie.

## Równanie obwodu

Zmienne stanu to ładunek na kondensatorze i prąd. Prąd nazywa się tu `I`, nie
`i` — mała litera jest w silniku matematycznym jednostką urojoną i cicho
zamieniłaby równanie w zespolone. Napięcie na oporniku jest
proporcjonalne do prądu, na cewce do jego pochodnej, na kondensatorze do
ładunku — stąd całe równanie.

```formula:rlc-ode
@ode
@state q, I
@d q = I
@d I = \frac{U_0 \cdot \cos(\Omega \cdot t) - R \cdot I - \frac{q}{C}}{L}
@init q = 0, I = 0
@vars q: C, I: A, R: ohm, L: H, C: F, U_0: V, Omega: s^-1
@derivedFrom rlc-omega
```

## Napięcie na kondensatorze

To ono jest zwykle sygnałem wyjściowym filtru.

```formula:rlc-uc
U_C = \frac{q}{C}
@vars U_C: V, q: C, C: F
@derivedFrom rlc-ode
```

## Symulacja

Ustaw `Omega` równe `omega_0` i zmniejszaj `R`: amplituda napięcia na
kondensatorze rośnie ponad napięcie zasilania. To nie pomyłka — w rezonansie
szeregowym napięcia na cewce i kondensatorze znoszą się nawzajem, a każde z
osobna może być `Q` razy większe od zasilania.

```sim:rlc
{
  "R": "50 ohm",
  "L": "0.01 H",
  "C": "1e-6 F",
  "U_0": "5 V",
  "Omega": "10000 s^-1",
  "duration": 0.01,
  "view": ["timeseries", "phase", "scalars"]
}
```

