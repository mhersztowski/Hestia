---
title: Atraktor Lorenza
tags: [chaos, uklady-dynamiczne]
requires: [Rezonans w oscylatorze wymuszonym]
---
# Atraktor Lorenza

Edward Lorenz szukał uproszczonego modelu konwekcji w atmosferze. Dostał trzy
równania, w których identyczne warunki początkowe różniące się na czwartym
miejscu po przecinku prowadzą po chwili do zupełnie innych stanów — i tak
narodziła się teoria chaosu.

## Równania

Trzy zmienne bez jednostek: `x` opisuje intensywność konwekcji, `y` różnicę
temperatur, `z` odchylenie profilu temperatury od liniowego.

```formula:lorenz-ode
@ode
@state x, y, z
@d x = \sigma \cdot (y - x)
@d y = x \cdot (\rho - z) - y
@d z = x \cdot y - \beta \cdot z
@init x = x_0, y = 1, z = 1
@vars x: 1, y: 1, z: 1, sigma: 1, rho: 1, beta: 1, x_0: 1
```

## Odległość od początku układu

Jedna liczba, po której widać, że układ nigdy się nie ustala ani nie ucieka do
nieskończoności — krąży wokół dwóch skrzydeł atraktora.

```formula:lorenz-promien
r = \sqrt{x^2 + y^2 + z^2}
@vars r: 1, x: 1, y: 1, z: 1
@derivedFrom lorenz-ode
```

## Symulacja

Klasyczne wartości Lorenza to `sigma` = 10, `rho` = 28, `beta` = 8/3 ≈ 2,667.
Obróć rysunek myszą, żeby zobaczyć oba skrzydła. Potem zmień `x_0` o setną
część i popatrz na przebieg czasowy — początek pokrywa się idealnie, a po
kilkunastu sekundach nie ma śladu podobieństwa. Nie jest to błąd numeryczny,
tylko wrażliwość na warunki początkowe.

```sim:lorenz
{
  "sigma": 10,
  "rho": 28,
  "beta": 2.667,
  "x_0": 1,
  "duration": 40
}
```
