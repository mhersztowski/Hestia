---
title: Rezonans w oscylatorze wymuszonym
tags: [mechanika, drgania]
requires: [Wahadło matematyczne]
---
# Rezonans w oscylatorze wymuszonym

Rezonans to nie „głośniej przy właściwej częstotliwości" — to zjawisko, w którym
odpowiedź układu rośnie tym bardziej, im mniej energii się traci. Ten sam opis
pasuje do huśtawki, mostu i obwodu RLC, bo to jedno równanie.

## Częstość własna

Bez tłumienia i bez wymuszenia układ drga z jedną, własną częstością.

```formula:czestosc-wlasna
\omega_0 = \sqrt{\frac{k}{m}}
@vars omega_0: s^-1, k: N/m, m: kg
```

## Równanie ruchu

Trzy siły: sprężystość ściąga do zera, tłumienie odbiera energię proporcjonalnie
do prędkości, wymuszenie dokłada ją okresowo.

```formula:oscylator-ode
@ode
@state x, v
@d x = v
@d v = -\omega_0^2 \cdot x - 2 \cdot \beta \cdot v + \frac{F_0}{m} \cdot \cos(\Omega \cdot t)
@init x = 0, v = 0
@vars x: m, v: m/s, omega_0: s^-1, beta: s^-1, F_0: N, m: kg, Omega: s^-1
@derivedFrom czestosc-wlasna
```

Uwaga na zapis: `\beta` i `\Omega` to zwykłe symbole, ale `\gamma` **nie** —
w silniku matematycznym oznacza stałą Eulera–Mascheroniego i cicho podstawiłby
0,577 zamiast naszego tłumienia. Dlatego tłumienie nazywa się tu `\beta`.

## Amplituda ustalona

Po zaniknięciu drgań własnych zostaje odpowiedź o amplitudzie, którą da się
policzyć wprost — i porównać z tym, co pokazuje symulacja.

```formula:amplituda
A = \frac{F_0}{m \cdot \sqrt{(\omega_0^2 - \Omega^2)^2 + 4 \cdot \beta^2 \cdot \Omega^2}}
@vars A: m, F_0: N, m: kg, omega_0: s^-1, Omega: s^-1, beta: s^-1
@derivedFrom oscylator-ode
@assume stan-ustalony
```

## Symulacja

Ustaw `Omega` blisko `omega_0` i zmniejszaj `beta`: amplituda rośnie tym
bardziej, im słabsze tłumienie. Przy `beta` bliskim zeru wykres przestaje się
ustalać w rozsądnym czasie — to nie błąd symulacji, tylko sedno rezonansu.

```sim:rezonans
{
  "k": "10 N/m",
  "m": "1 kg",
  "beta": "0.15 s^-1",
  "F_0": "1 N",
  "Omega": "3.1 s^-1",
  "duration": 60,
  "view": ["timeseries", "phase", "spectrum", "scalars"]
}
```

## Co widać w widmie

Wykres widma odpowiada na pytanie, na które przebieg w czasie odpowiada
najwyżej pośrednio: **z jakich drgań składa się ten ruch**. Na początku
symulacji są dwa — własne, o częstości `omega_0`, i wymuszone, o częstości
`Omega`. Przez pierwsze kilkanaście sekund widać ich nakładanie: amplituda
faluje, choć żadna z częstości się nie zmienia.

Własne drganie gaśnie, bo tłumienie zabiera mu energię, a wymuszenie jej nie
dostarcza akurat w jego rytmie. Po wygaśnięciu transjentu w widmie zostaje
**jeden prążek** i to jest ta chwila, od której ruch da się opisać jednym
wzorem na amplitudę ustaloną.

Ustaw `Omega` blisko `omega_0` i porównaj wysokość prążka z przewidywaniem
`F_0 / (2 m \beta \omega_0)`. Zgodność tych dwóch liczb — jednej policzonej
przez solver, drugiej wyprowadzonej rachunkiem — jest sprawdzianem, czy
symulacja liczy tę fizykę, o której mówi tekst.
