---
title: Wahadło matematyczne
tags: [mechanika, drgania, podstawy]
---
# Wahadło matematyczne

Okres małych drgań wahadła nie zależy od amplitudy — to obserwacja Galileusza,
która pozwoliła zbudować pierwszy dokładny zegar. Zobaczmy, skąd się bierze i
kiedy przestaje być prawdziwa.

## Równanie ruchu

Na ciężarek działa składowa siły ciężkości styczna do toru. Stąd układ dwóch
równań pierwszego rzędu: kąt zmienia się z prędkością kątową, a prędkość kątowa
maleje tym szybciej, im większe wychylenie.

```formula:pendulum-ode
@ode
@state theta, omega
@d theta = \omega
@d omega = -\frac{g}{L}\sin(\theta)
@init theta = \theta_0, omega = 0
@vars g: m/s^2, L: m, theta_0: rad, theta: rad, omega: rad/s
```

## Okres małych drgań

Dla małych kątów `sin θ ≈ θ` i równanie staje się równaniem oscylatora
harmonicznego. Jego okres nie zawiera amplitudy — stąd izochronizm.

```formula:pendulum-period
T = 2\pi\sqrt{\frac{L}{g}}
@vars T: s, L: m, g: m/s^2
@derivedFrom pendulum-ode
@assume small-angles
```

## Energia

Energia całkowita jest sumą kinetycznej i potencjalnej. Powinna być stała —
i to jest najprostszy sprawdzian, czy symulacja liczy poprawnie.

```formula:pendulum-energy
E = \frac{1}{2} \cdot m \cdot L^2 \cdot \omega^2 + m \cdot g \cdot L \cdot (1 - \cos(\theta))
@vars E: J, m: kg, L: m, g: m/s^2
```

## Symulacja

Suwaki poniżej nie są nigdzie zadeklarowane — to symbole, których nie liczy
żaden wzór, więc muszą być wejściem. Spróbuj zwiększyć amplitudę do 90°:
zobaczysz, że okres z symulacji przestaje zgadzać się ze wzorem powyżej.

```sim:pendulum
{
  "L": "1 m",
  "theta_0": "15 deg",
  "m": "1 kg",
  "duration": 12
}
```

## Zadania

Dane w zadaniach są losowane, więc każde odświeżenie daje inny wariant. Klucza
nie ma nigdzie zapisanego — liczy go ten sam wzór, który stoi wyżej w tekście.
Poprawka wzoru zmienia jednocześnie wykres i odpowiedź.

```exercise:okres-z-dlugosci
Oblicz okres małych drgań wahadła matematycznego o podanej długości.
Przyjmij przyspieszenie ziemskie 9,81 m/s². Podaj wynik z jednostką.
@given L: 0.4..2.5 m step 0.1
@answer T
@tolerance 2%
@level 1
@uses pendulum-period
```

```exercise:wahadlo-na-ksiezycu
To samo wahadło przenosimy tam, gdzie przyspieszenie grawitacyjne jest inne.
Ile wynosi okres? Zwróć uwagę, że długość się nie zmieniła — zmieniło się `g`.
@given L: 0.5..1.5 m step 0.1
@given g: 1.6..3.7 m/s^2 step 0.1
@answer T
@tolerance 2%
@level 2
@uses pendulum-period
```
