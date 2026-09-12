---
title: Przekształcenia liniowe
tags: [algebra, podstawy]
---
# Przekształcenia liniowe

Macierz wygląda jak tabelka liczb i tak jest zwykle uczona. To najgorszy możliwy
sposób, bo gubi jedyną rzecz, która czyni ją zrozumiałą: **macierz to
odkształcenie płaszczyzny**. Nie tabelka — czynność.

Poniżej płaszczyzna jest pokryta siatką. Przeciągnij suwak i patrz, co się z nią
dzieje. Niebieska siatka to obraz szarej po przekształceniu.

## Ścinanie

Najprostsze przekształcenie, które nie jest ani obrotem, ani skalowaniem. Punkty
przesuwają się w bok tym mocniej, im wyżej leżą.

```formula:scinanie
@linalg
@mat S = [[1, 1], [0, 1]]
@vec v = [1, 1]
w = S \cdot v
```

Zwróć uwagę na dwie rzeczy. Kolumny macierzy to dokładnie te dwie strzałki:
`e₁` idzie do `[1, 0]` — czyli się nie rusza — a `e₂` do `[1, 1]`. Macierz
**jest** zapisem tego, dokąd trafiają wektory bazowe, i nic ponadto.

Druga: kwadrat jednostkowy zmienia kształt, ale nie pole. Wyznacznik wynosi 1.

```linalg:scinanie
{ "eigen": true }
```

Fioletowa przerywana prosta to kierunek własny — jedyny kierunek, który
ścinanie zostawia w spokoju. Leży na osi poziomej, bo punkty na niej mają
zerową wysokość, więc nie mają się od czego odsunąć.

## Wyznacznik jako pole

Skalowanie rozciąga osie niezależnie. Pole kwadratu jednostkowego mnoży się
przez iloczyn współczynników — i to jest wyznacznik, cała definicja.

```formula:skalowanie
@linalg
@mat D = [[3, 0], [0, 2]]
@vec v = [1, 1]
w = D \cdot v
```

```linalg:skalowanie
{ "eigen": true }
```

Tu kierunki własne są dwa i pokrywają się z osiami: wektor na osi x rozciąga
się trzykrotnie, na osi y dwukrotnie, ale żaden nie skręca.

## Obrót nie ma kierunków własnych

```formula:obrot
@linalg
@mat R = [[0.5, -0.866], [0.866, 0.5]]
@vec v = [2, 0]
w = R \cdot v
```

```linalg:obrot
{ "eigen": true }
```

Obrót o 60° skręca **każdy** kierunek, więc rzeczywistych wektorów własnych nie
ma wcale. To nie jest brak wyniku ani błąd — to prawda o obrocie, i dlatego
scena pisze „brak rzeczywistych" zamiast rysować cokolwiek.

Wyznacznik wynosi 1: obrót nie zmienia ani pola, ani orientacji.

## Rzut traci wymiar

```formula:rzut
@linalg
@mat P = [[1, 0], [0, 0]]
@vec v = [2, 1.5]
w = P \cdot v
```

Zatrzymaj animację w połowie. Cała płaszczyzna zapada się w prostą, kwadrat
jednostkowy spłaszcza się do odcinka, a jego pole idzie do zera. Wyznacznik
zero znaczy dokładnie to: **przekształcenie traci wymiar i nie da się go
cofnąć**. Nie ma macierzy odwrotnej, bo nie ma informacji, skąd punkt przyszedł.

```linalg:rzut
{}
```

## Odbicie odwraca orientację

```formula:odbicie
@linalg
@mat F = [[1, 0], [0, -1]]
@vec v = [1.5, 1]
w = F \cdot v
```

Kwadrat robi się czerwony, bo wyznacznik jest ujemny. Płaszczyzna została
przewrócona na drugą stronę — kolejność wektorów bazowych zmieniła kierunek
obiegu z przeciwnego do ruchu wskazówek zegara na zgodny.

Animacja przechodzi przy tym przez wyznacznik zero. Tak musi być: nie da się
odbić płaszczyzny, nie spłaszczając jej po drodze — chyba że wyjdzie się w
trzeci wymiar i obróci kartkę.

```linalg:odbicie
{}
```

## Znajdź kierunek własny sam

Do tej pory kierunki własne były pokazywane. Teraz je znajdź.

Chwyć koniec niebieskiej strzałki `v` i przeciągaj po płaszczyźnie. Pomarańczowa
`w = A · v` podąża. Pasek pokazuje, jak blisko jesteś kierunku, w którym `w`
leży dokładnie na `v` — a to jest cała definicja wektora własnego.

```formula:szukanie
@linalg
@mat A = [[2, 1], [1, 2]]
@vec v = [2, 0.6]
w = A \cdot v
```

```linalg:szukanie
{ "drag": true, "snap": true, "eigen": true }
```

Ta macierz ma dwa kierunki własne: wzdłuż prostej `y = x` (obie współrzędne
rosną trzykrotnie) i wzdłuż `y = -x` (wektor kurczy się do jednej trzeciej).
Znajdź oba. Blisko trafienia strzałka sama wskoczy na kierunek — bo trafienie
w niego dokładnie myszą byłoby kwestią przypadku.

Zwróć uwagę, że **długość nie ma znaczenia**. Wydłuż `v` dwukrotnie: `w` też
się wydłuża dwukrotnie, a zgodność zostaje. Własny jest kierunek, nie wektor.

## Składanie

Macierze mnoży się po to, żeby składać przekształcenia. Zapis `A \cdot B` znaczy
„najpierw B, potem A" — kolejność jest odwrotna do czytania, bo tak samo
odwrotna jest w `A(B(v))`.

```formula:zlozenie
@linalg
@mat R = [[0, -1], [1, 0]]
@mat D = [[2, 0], [0, 1]]
C = R \cdot D
@vec v = [1, 0]
w = C \cdot v
```

```linalg:zlozenie
{}
```

Rozciągnięcie w poziomie, potem obrót o 90°. Wektor `[1, 0]` idzie najpierw do
`[2, 0]`, a potem do `[0, 2]`. Wyznacznik złożenia to iloczyn wyznaczników —
pola mnożą się tak samo jak przekształcenia się składają.

## Procedury, nie wzory

Dwie rzeczy w algebrze są przepisami, a nie wzorami — wykonuje się je krok po
kroku i to droga jest treścią, a nie liczba na końcu.

### Eliminacja Gaussa

Układ `2x + y = 5`, `4x + 3y = 11` zapisany jako macierz rozszerzona. Pionowa
kreska oddziela współczynniki od prawej strony; eliminacja polega na patrzeniu,
co dzieje się po obu jej stronach naraz.

```procedure:gauss-przyklad
{
  "kind": "gauss",
  "matrix": [[2, 1], [4, 3]],
  "rhs": [5, 11]
}
```

Przechodź strzałkami. Cel jest jeden: wyzerować lewy dolny róg, żeby drugie
równanie miało tylko jedną niewiadomą.

### Gram-Schmidt

Dwa dowolne wektory rozpinają płaszczyznę, ale nie są prostopadłe. Procedura
buduje z nich bazę ortonormalną — i cała jej treść mieści się w jednym kroku:
**odejmij od `b` tę część, która leży wzdłuż `a`**.

```procedure:gram-schmidt-przyklad
{
  "kind": "gram-schmidt",
  "a": [2, 0],
  "b": [1.4, 1.8]
}
```

Szara strzałka `p` to rzut `b` na pierwszy kierunek. Reszta — to, co zostaje po
jego odjęciu — jest już prostopadła, bo usunęliśmy z `b` wszystko, co miało
kierunek `a`. Zostaje ją tylko skrócić do jedynki.
