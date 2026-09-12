---
title: Orbita keplerowska
tags: [astronomia, mechanika]
requires: [Rzut ukośny z oporem powietrza]
---
# Orbita keplerowska

Planeta nie krąży po okręgu i nie porusza się ze stałą prędkością. Obie te
rzeczy wynikają z jednego prawa — siły malejącej z kwadratem odległości — i
symulacja poniżej pokazuje je bez żadnego dodatkowego założenia.

## Prawo powszechnego ciążenia

Stała grawitacji nazywa się tu `G_N`, bo samo `G` jest w silniku matematycznym
stałą Catalana. Siła jest skierowana do środka i maleje z kwadratem odległości. W równaniach
ruchu wygodniej używać przyspieszenia, więc masa krążącego ciała skraca się i
znika — dlatego orbita nie zależy od masy planety.

```formula:orbita-mu
\mu = G_N \cdot M
@vars mu: m^3/s^2, G_N: m^3/(kg s^2), M: kg
```

## Równania ruchu

Trzy wymiary, choć ruch dwóch ciał zawsze odbywa się w płaszczyźnie: składowa
`z` startuje od zera i sama tam zostaje. To dobry test poprawności — gdyby
wyszła z zera, coś byłoby nie tak z równaniami.

```formula:orbita-ode
@ode
@state x, y, z, v_x, v_y, v_z
@d x = v_x
@d y = v_y
@d z = v_z
@d v_x = -\mu \cdot \frac{x}{(x^2 + y^2 + z^2)^{1.5}}
@d v_y = -\mu \cdot \frac{y}{(x^2 + y^2 + z^2)^{1.5}}
@d v_z = -\mu \cdot \frac{z}{(x^2 + y^2 + z^2)^{1.5}}
@init x = r_0, y = 0, z = 0, v_x = 0, v_y = v_0, v_z = 0
@solver verlet
@invariant E = \frac{v_x^2 + v_y^2 + v_z^2}{2} - \frac{\mu}{\sqrt{x^2 + y^2 + z^2}}
@invariant L_z = x \cdot v_y - y \cdot v_x
@vars x: m, y: m, z: m, v_x: m/s, v_y: m/s, v_z: m/s, mu: m^3/s^2, r_0: m, v_0: m/s
@derivedFrom orbita-mu
```

Metoda całkowania jest tu wskazana wprost: `@solver verlet`. Runge–Kutta liczy
dokładniej krok po kroku, ale po tysiącu obiegów orbita zauważalnie się zwęża,
bo energia powoli ucieka. Verlet tego nie robi.

Dwie ostatnie linijki mówią, co ma pozostać stałe: energia na jednostkę masy
i moment pędu. Nie wchodzą do obliczeń — orbita liczy się tak samo z nimi
i bez nich. Wchodzą do tego, co symulacja **melduje pod wykresem**: gdyby
zamienić `verlet` na `rk4`, panel jakości zacząłby pokazywać powolny ubytek
energii, a orbita na ekranie wyglądałaby przy tym równie ładnie. Stałość
momentu pędu to zresztą drugie prawo Keplera zapisane jedną linijką.

## Prędkość kołowa i okres

Dla zadanego promienia istnieje jedna prędkość dająca okrąg. Każda inna daje
elipsę — mniejsza ciaśniejszą, większa rozciągniętą.

```formula:orbita-vkol
v_k = \sqrt{\frac{\mu}{r_0}}
@vars v_k: m/s, mu: m^3/s^2, r_0: m
@derivedFrom orbita-ode
```

```formula:orbita-okres
T = 2\pi\sqrt{\frac{r_0^3}{\mu}}
@vars T: s, r_0: m, mu: m^3/s^2
@derivedFrom orbita-vkol
@assume orbita-kolowa
```

## Symulacja

Wartości domyślne to orbita niska wokół Ziemi. Zmieniaj `v_0` wokół prędkości
kołowej: przy mniejszej orbita opada po drugiej stronie, przy większej —
wznosi się. Trzeci prawo Keplera zobaczysz, porównując okres z `T` powyżej.

```sim:orbita
{
  "G_N": "6.6743e-11 m^3/(kg s^2)",
  "M": "5.972e24 kg",
  "r_0": "7000 km",
  "v_0": "7546 m/s",
  "duration": 6000,
  "expose": ["r_0", "v_0"]
}
```
