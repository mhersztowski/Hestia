---
title: Rzut ukośny z oporem powietrza
tags: [mechanika, podstawy]
---
# Rzut ukośny z oporem powietrza

Parabola, której uczą w szkole, jest prawdziwa tylko w próżni. Powietrze zmienia
tor na niesymetryczny: wznoszenie jest dłuższe i łagodniejsze niż opadanie, a
zasięg zależy od masy pocisku — czego w paraboli w ogóle nie ma.

## Ruch bez oporu

Najpierw przypadek podręcznikowy. Przyspieszenie jest stałe i pionowe, więc
składowa pozioma prędkości się nie zmienia.

```formula:rzut-prozniowy
R = \frac{v_0^2 \cdot \sin(2 \cdot \alpha)}{g}
@vars R: m, v_0: m/s, alpha: rad, g: m/s^2
@assume brak-oporu
```

Ten wzór mówi, że najdalej rzucimy pod kątem 45° i że masa nie ma znaczenia.
Symulacja poniżej pokaże, kiedy przestaje to być prawdą.

## Równania ruchu z oporem

Opór powietrza przy prędkościach rzutu jest proporcjonalny do **kwadratu**
prędkości i skierowany przeciwnie do niej. Rozkładamy go na składowe: każda
dostaje czynnik `v`, czyli długość wektora prędkości.

```formula:rzut-ode
@ode
@state x, y, v_x, v_y
@d x = v_x
@d y = v_y
@d v_x = -\frac{b}{m} \cdot v_x \cdot \sqrt{v_x^2 + v_y^2}
@d v_y = -g - \frac{b}{m} \cdot v_y \cdot \sqrt{v_x^2 + v_y^2}
@init x = 0, y = 0, v_x = v_0 \cdot \cos(\alpha), v_y = v_0 \cdot \sin(\alpha)
@when y < 0
@stop
@solver dopri5
@tol 1e-9
@vars x: m, y: m, v_x: m/s, v_y: m/s, g: m/s^2, b: kg/m, m: kg, v_0: m/s, alpha: rad
```

Zdarzenie `@when y < 0 @stop` kończy symulację w chwili upadku — bez niego
pocisk leciałby dalej pod ziemię, a wykres pokazywałby bzdurę.

Chwila upadku nie jest tu jednak drobiazgiem technicznym: **zasięg to położenie
w tej właśnie chwili**, więc błąd w jej wyznaczeniu przenosi się wprost na
wynik. Dlatego blok liczy się metodą adaptacyjną (`@solver dopri5`), która
zdarzenie **rozwiązuje** — szuka miejsca zerowego wysokości wewnątrz kroku
zamiast sprawdzać po kroku, czy pocisk jest już pod ziemią. Bez oporu
(`b = 0`) da się to sprawdzić rachunkiem: zasięg wychodzi dokładnie
v₀²·sin(2α)/g.

## Energia i prędkość

Wysokość maksymalną i prędkość chwilową liczymy z tego samego stanu, więc żadna
z nich nie może rozjechać się z rysunkiem.

```formula:rzut-predkosc
v = \sqrt{v_x^2 + v_y^2}
@vars v: m/s, v_x: m/s, v_y: m/s
```

## Symulacja

Zwiększ `b` od zera w górę: przy zerze tor jest symetryczną parabolą, a zasięg
zgadza się ze wzorem próżniowym. Im większy opór, tym bardziej opadanie robi się
strome — i tym silniej cięższy pocisk (większe `m`) leci dalej od lekkiego.

```sim:rzut
{
  "v_0": "40 m/s",
  "alpha": "45 deg",
  "m": "1 kg",
  "b": "0.01 kg/m",
  "duration": 12,
  "view": ["path2d", "timeseries", "scalars"]
}
```

## Zadanie

```exercise:zasieg-w-prozni
Pocisk wystrzelono z podaną prędkością pod podanym kątem. Jaki byłby jego
zasięg w próżni? Wynik podaj w metrach.
@given v_0: 20..60 m/s step 5
@given alpha: 20..70 deg step 5
@answer R
@tolerance 3%
@level 1
@uses rzut-prozniowy
```
