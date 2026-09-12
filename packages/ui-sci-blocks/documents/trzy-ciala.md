---
title: Trzy ciała
tags: [astronomia, mechanika]
requires: [Orbita keplerowska]
---
# Trzy ciała

Dwa ciała krążące wokół siebie mają rozwiązanie w postaci zamkniętej — elipsę
z ogniskiem we wspólnym środku masy. Trzy ciała takiego rozwiązania **nie
mają** i to nie jest kwestia braku pomysłu: udowodniono, że nie istnieje.
Zostaje całkowanie równań ruchu.

Równań jest dwanaście: każde ciało wnosi dwa położenia i dwie prędkości.
Wypisanie ich w dokumencie niczego by nie nauczyło — wszystkie mają tę samą
postać, a różnią się wyłącznie numerami. Dlatego ten blok nie buduje modelu
z wzorów, tylko wskazuje zjawisko z biblioteki: `"model": "nbody"`. Wzory niżej
zostają do **czytania i sprawdzania**, a nie do liczenia.

## Konfiguracja Lagrange'a

Wśród nieskończenie wielu ruchów trzech ciał są takie, które zamykają się
w prostym wzorze. Najładniejszy z nich: trzy równe masy w wierzchołkach
trójkąta równobocznego, obracające się wokół wspólnego środka jak sztywna
całość. Trójkąt nie zmienia kształtu — zmienia tylko położenie.

Warunek jest jeden i dotyczy prędkości. Siła wypadkowa od dwóch pozostałych
ciał musi być dokładnie siłą dośrodkową:

```formula:trzy-predkosc
v = \sqrt{\frac{G_N \cdot M}{\sqrt{3} \cdot r}}
@vars v: m/s, G_N: m^3/(kg s^2), M: kg, r: m
```

Pierwiastek z trzech bierze się z geometrii: wypadkowa dwóch sił o równych
wartościach, skierowanych pod kątem 60° do promienia, jest √3 razy większa od
każdej z nich, a odległość między ciałami jest √3 razy większa od promienia.

```formula:trzy-okres
T = \frac{2\pi r}{v}
@vars T: s, r: m, v: m/s
@derivedFrom trzy-predkosc
```

Dla trzech gwiazd o masie Słońca w odległości jednej jednostki astronomicznej
od środka wychodzi prędkość około 22,6 km/s i okres około 1,3 roku. Wartości
w bloku niżej podano z pięcioma cyframi po przecinku i nie jest to przesada:
konfiguracja jest niestabilna, więc zaokrąglenie prędkości do pełnych metrów na
sekundę rozjeżdża trójkąt o pół procenta w ciągu półtora obiegu.

## Symulacja

Ciała startują dokładnie w konfiguracji Lagrange'a. Bok trójkąta ma zostać
stały przez cały czas — i to jest sprawdzian, czy symulacja liczy fizykę, czy
tylko rysuje coś okrągłego.

```sim:trzy
{
  "model": "nbody",
  "bodies": [
    { "name": "A", "mass": 1.989e30, "x": 1.496e11, "y": 0, "vx": 0, "vy": 22634.66874 },
    { "name": "B", "mass": 1.989e30, "x": -7.48e10, "y": 1.2955740041e11, "vx": -19602.1981351, "vy": -11317.33437 },
    { "name": "C", "mass": 1.989e30, "x": -7.48e10, "y": -1.2955740041e11, "vx": 19602.1981351, "vy": -11317.33437 }
  ],
  "duration": 60000000,
  "view": ["path2d", "timeseries"]
}
```

Przesuń teraz suwak zmiękczenia (`softening`) albo zmień jedną prędkość o kilka
procent: trójkąt przestaje być trójkątem, a ruch — okresowy. Konfiguracja
Lagrange'a jest rozwiązaniem **niestabilnym**, więc w przyrodzie utrzymuje się
tylko wtedy, gdy jedna z mas jest znikoma wobec pozostałych. Tak właśnie krążą
trojańczyki Jowisza.
