---
title: Układ sztywny
tags: [elektronika, metody numeryczne]
requires: [Obwód RLC]
---
# Układ sztywny

Weź obwód RLC z poprzedniego wykładu i zwiększ opór do stu kiloomów. Fizycznie
nie dzieje się nic dramatycznego: drgania znikają, a prąd ustala się na `U_0/R`,
bo przy częstości rezonansowej reaktancje cewki i kondensatora znoszą się
i zostaje sam opornik.

Numerycznie dzieje się natomiast rzecz, która ma własną nazwę.

## Dwie skale czasu

Obwód ma teraz dwie bardzo różne skale czasu. Prąd ustala się w czasie rzędu
`tau`, a napięcie zmienia się w rytm wymuszenia o okresie `T`.

```formula:sztywny-tau
\tau = \frac{2 L}{R}
@vars tau: s, L: H, R: ohm
```

```formula:sztywny-okres
T = \frac{2\pi}{\Omega}
@vars T: s, Omega: s^-1
```

Przy `R = 100 kΩ` i `L = 10 mH` pierwsza wynosi dwieście nanosekund, druga
sześćset mikrosekund — trzy tysiące razy więcej. Szybka składowa gaśnie
w pierwszym ułamku procenta przedziału i dalej nic już nie wnosi.

**Ale metoda jawna musi ją dalej liczyć.** Nie dla dokładności — tej dawno
starczyłoby z zapasem — tylko dla stabilności: krok dłuższy niż mniej więcej
`tau` sprawia, że wygasła składowa zaczyna w obliczeniach narastać zamiast
maleć, i po kilkudziesięciu krokach zalewa wynik. To jest **układ sztywny**,
a jego cechą rozpoznawczą jest właśnie ta rozbieżność: krok wymuszony przez
stabilność jest o rzędy wielkości krótszy od kroku wystarczającego dla
dokładności.

## Trzy metody, trzy zachowania

```formula:sztywny-ode
@ode
@state q, I
@d q = I
@d I = \frac{U_0 \cdot \cos(\Omega \cdot t) - R \cdot I - \frac{q}{C}}{L}
@init q = 0, I = 0
@solver rosenbrock
@tol 1e-8
@vars q: C, I: A, R: ohm, L: H, C: F, U_0: V, Omega: s^-1
@derivedFrom sztywny-tau
```

Blok liczy się metodą niejawną, której krok nie ma ograniczenia
stabilnościowego. Zamień `rosenbrock` na `dopri5`, a symulacja nie policzy się
błędnie — rozpozna sztywność i powie wprost, czego użyć.

Najciekawsze jest trzecie zachowanie. Metoda o stałym kroku (`rk4`) nie ma czym
zauważyć, że przekroczyła granicę stabilności: policzy ten obwód
**najszybciej ze wszystkich** i zwróci wynik, który nie jest liczbą. To jest
powód, dla którego symulacja mierzy jakość własnego wyniku, zamiast zakładać,
że skoro się policzyła, to jest dobra.

## Sprawdzenie rachunkiem

W stanie ustalonym amplituda prądu nie zależy ani od `L`, ani od `C` — przy tej
częstości obwód zachowuje się jak sam opornik.

```formula:sztywny-imax
I_{max} = \frac{U_0}{R}
@vars I_max: A, U_0: V, R: ohm
@derivedFrom sztywny-ode
```

Pięć woltów na stu kiloomach daje pięćdziesiąt mikroamperów. Tyle właśnie
pokazuje wykres — i to jest sprawdzian, czy metoda policzyła obwód, czy tylko
narysowała coś, co wygląda na przebieg.

```sim:sztywny
{
  "R": "100000 ohm",
  "L": "0.01 H",
  "C": "1e-6 F",
  "U_0": "5 V",
  "Omega": "10000 s^-1",
  "duration": 0.005,
  "view": ["timeseries", "scalars"]
}
```
