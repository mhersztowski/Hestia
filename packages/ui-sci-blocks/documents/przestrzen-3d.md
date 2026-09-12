---
title: Przekształcenia w przestrzeni
tags: [algebra, podstawy]
requires: [Przekształcenia liniowe]
---
# Przekształcenia w przestrzeni

Trzeci wymiar nie jest „tym samym, tylko więcej". Dokłada dwie rzeczy, których
na płaszczyźnie nie ma — i obie są warte osobnego rozdziału.

## Oś obrotu jest wektorem własnym

Obrót płaszczyzny nie ma rzeczywistych kierunków własnych: skręca każdy.
Obrót przestrzeni ma **dokładnie jeden** — i jest nim oś, wokół której się
kręci.

```formula:obrot-3d
@linalg
@mat3 R = [[0.5, -0.866, 0], [0.866, 0.5, 0], [0, 0, 1]]
@vec3 v = [1.5, 0, 0]
w = R \cdot v
```

Przeciągnij scenę myszą i obejrzyj ją z boku. Fioletowa prosta to kierunek
własny — pokrywa się z osią z, bo wokół niej ten obrót działa. Wartość własna
wynosi 1: punkty na osi nie ruszają się wcale.

```linalg:obrot-3d
{ "eigen": true }
```

To jest odpowiedź na pytanie „wokół czego to się kręci", zapisana jako wektor
własny. Nie rachunek — obserwacja.

## Wyznacznik to objętość

Sześcian jednostkowy odkształca się w równoległościan. Wyznacznik mówi, ile
razy zmieniła się jego **objętość**.

```formula:skala-3d
@linalg
@mat3 D = [[2, 0, 0], [0, 1.5, 0], [0, 0, 0.5]]
@vec3 v = [1, 1, 1]
w = D \cdot v
```

```linalg:skala-3d
{ "eigen": true }
```

Dwa razy szerzej, półtora raza wyżej, o połowę płycej: 2 × 1,5 × 0,5 = 1,5.
Wartości własne to dokładnie te trzy współczynniki, a kierunki własne to osie.

## Rzut zgniata przestrzeń

```formula:rzut-3d
@linalg
@mat3 P = [[1, 0, 0], [0, 1, 0], [0, 0, 0]]
@vec3 v = [1, 1, 1]
w = P \cdot v
```

Wyznacznik zero: sześcian spłaszcza się do kwadratu, objętość znika. Pomarańczowa
prosta to **jądro** — kierunek, który przekształcenie zgniata do zera. Wszystko,
co leżało wzdłuż osi z, przestaje istnieć.

```linalg:rzut-3d
{ "kernel": true, "eigen": true }
```

Dlatego rzutu nie da się odwrócić. Nie chodzi o trudność rachunku — informacja
o wysokości przepadła i nie ma jej skąd wziąć.

## Zgniecenie do prostej

Można stracić więcej niż jeden wymiar naraz.

```formula:rzut-osi
@linalg
@mat3 Q = [[1, 0, 0], [0, 0, 0], [0, 0, 0]]
@vec3 v = [1, 1, 1]
w = Q \cdot v
```

Tu jądro jest **płaszczyzną**, a nie prostą — ginie wszystko poza kierunkiem x.
Pomarańczowa półprzezroczysta płaszczyzna pokazuje dokładnie to, co przepada.

```linalg:rzut-osi
{ "kernel": true }
```

Rząd macierzy to liczba wymiarów, które przeżyły: tutaj jeden. Wymiar jądra to
liczba tych, które zginęły: dwa. Razem zawsze trzy — i to nie jest zbieg
okoliczności, tylko twierdzenie o rzędzie i defekcie.
