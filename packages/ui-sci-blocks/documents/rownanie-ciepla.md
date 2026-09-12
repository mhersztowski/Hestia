---
title: Równanie ciepła
tags: [termodynamika, pola, podstawy]
requires: [Wahadło matematyczne]
---
# Równanie ciepła

Wszystkie zjawiska w tej bazie dało się dotąd opisać kilkoma liczbami: kątem,
prędkością, położeniem. Temperatura płyty jest inna — to **pole**, czyli
wartość w każdym punkcie. Stan układu nie jest wektorem, tylko całą mapą.

## Skąd bierze się równanie

Ciepło płynie od cieplejszego do zimniejszego, tym szybciej, im większa
różnica. W jednym punkcie „różnica względem otoczenia" to laplasjan — suma
drugich pochodnych po obu kierunkach. Punkt chłodniejszy od sąsiadów ma dodatni
laplasjan i się nagrzewa.

```formula:cieplo-pole
@pde
@field u
@grid 96 x 96
@domain x: 0..1 m, y: 0..1 m
@d u = \alpha \cdot \Delta u
@init u = \exp(-60 \cdot ((x - 0.3)^2 + (y - 0.35)^2)) + 0.7 \cdot \exp(-90 \cdot ((x - 0.7)^2 + (y - 0.65)^2))
@boundary neumann
@vars u: K, alpha: m^2/s, x: m, y: m
```

## Symulacja

Dwie plamki ciepła o różnej temperaturze na izolowanej płycie. Brzeg jest
izolowany (`neumann`), więc **nic nie ucieka** — całkowite ciepło zostaje stałe,
a płyta dąży do jednolitej temperatury równej średniej.

Zwiększ `alpha`, żeby zobaczyć szybsze wyrównywanie. Zauważ, że mniejsza plamka
znika pierwsza: tempo wyrównywania rośnie z kwadratem odwrotności rozmiaru, więc
drobne szczegóły giną najszybciej. To ta sama zasada, przez którą rozmycie
gaussowskie zaciera drobny druk wcześniej niż nagłówki.

```field:cieplo-pole
{
  "alpha": 0.01,
  "duration": 3,
  "frames": 60
}
```

## Narysuj własny warunek początkowy

Kliknij **✎ rysuj** i przeciągnij po obrazie. Piórem działa nacisk — im mocniej,
tym cieplejsza plamka; odwrócone pióro (gumka) rysuje dołek, czyli obszar
zimniejszy od otoczenia.

Rysunek **nie jest obrazkiem**. Każde pociągnięcie zapisuje się jako jeden
gaussian, a cały ślad staje się zwykłym wyrażeniem — takim samym, jakie stoi
wyżej w `@init`. Dlatego rysunek nie ma rozdzielczości: ta sama linia zadziała
na siatce 32×32 i 128×128, bo dopiero solver ją próbkuje. W dokumencie ląduje
jako jedna linia `@strokes` obok równania, którą można poprawić w edytorze
tekstu.

Kształt gaussowski nie jest przypadkowy: to rozwiązanie równania dyfuzji dla
punktowego źródła, więc narysowana plamka od pierwszej klatki zachowuje się
tak, jak powinna — nie ma krawędzi, które musiałyby się dopiero wygładzić.

## Ta sama siatka, inne równanie

Jeśli zamiast pierwszej pochodnej po czasie postawić drugą, dostajemy falę.
Różnica w zapisie to jeden znak — różnica w zachowaniu jest zasadnicza:
dyfuzja **wygładza i zanika**, fala **drga i odbija się od brzegu**.

```formula:fala-pole
@pde
@field u
@grid 96 x 96
@domain x: 0..1 m, y: 0..1 m
@d2 u = c^2 \cdot \Delta u
@init u = \exp(-200 \cdot ((x - 0.5)^2 + (y - 0.5)^2))
@boundary dirichlet 0
@vars u: m, c: m/s, x: m, y: m
```

Brzeg jest tu unieruchomiony (`dirichlet 0`), jak napięta błona przymocowana do
ramy — fala się od niego odbija zamiast wychodzić poza obraz.

```field:fala-pole
{
  "c": 0.6,
  "duration": 2,
  "frames": 60
}
```

## Dlaczego krok czasowy nie jest wolnym wyborem

Schemat jawny liczy nowy stan wyłącznie ze starego. Jest prosty i szybki, ale
ma twardy warunek: informacja w symulacji nie może rozchodzić się szybciej niż
w opisywanym zjawisku. Dla dyfuzji znaczy to `dt ≤ h²/4α`, dla fali `dt ≤ h/c`.

Przekroczony o kilka procent warunek nie daje wyniku „trochę gorszego" —
symulacja rozsadza się do nieskończoności w kilkaset kroków. Dlatego krok
dobiera solver z siatki i parametrów, a nie autor dokumentu.
