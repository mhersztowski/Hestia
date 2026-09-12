"""
solve_reference.py — niezależne rozwiązanie układu z dokumentu.

Drugi silnik cross-walidacji (raport §7, poziom 2). Czyta scenariusz
wyeksportowany przez sci-core, całkuje go SciPy i zapisuje trajektorię jako
golden fixture. Vitest porównuje potem swój wynik z tym plikiem.

Niezależność jest tu prawdziwa: po naszej stronie RK4 ze stałym krokiem, po tej
adaptacyjny solver z kontrolą błędu. Żeby błąd przeszedł niezauważony,
musiałby być identyczny w dwóch niezależnie napisanych całkowaniach.

Wspólnym punktem obu dróg jest tłumaczenie wzoru, dlatego **najpierw**
sprawdzamy punkty kontrolne. Rozjazd tam znaczy błąd w tłumaczeniu i jest
zupełnie inną diagnozą niż rozjazd trajektorii, który wskazywałby na solver.

Użycie:
    python3 solve_reference.py scenariusz.json fixture.json
"""
import json
import sys
from math import (  # noqa: F401 — nazwy są używane przez eval wyrażeń
    sin, cos, tan, asin, acos, atan, sinh, cosh, tanh,
    exp, log, log10, sqrt, fabs, pi, e,
)

import numpy as np
from scipy.integrate import solve_ivp

# Tolerancja dla punktów kontrolnych. Ostrzejsza niż dla trajektorii, bo tu
# porównujemy to samo wyrażenie policzone dwa razy — różnica powyżej progu
# zaokrągleń znaczy inny wzór, a nie inną metodę.
TOLERANCJA_KONTROLNA = 1e-9


def srodowisko(scenario, stan, t):
    """Zakres nazw widoczny dla wyrażeń: parametry, zmienne stanu i czas."""
    zakres = dict(scenario["parameters"])
    zakres.update(stan)
    zakres["t"] = t
    return zakres


def sprawdz_punkty_kontrolne(scenario):
    """Czy nasze tłumaczenie wzoru daje to samo, co silnik dokumentu."""
    for numer, punkt in enumerate(scenario["checkpoints"], start=1):
        zakres = srodowisko(scenario, punkt["state"], 0.0)

        for nazwa, oczekiwana in punkt["derivatives"].items():
            policzona = eval(scenario["derivatives"][nazwa], globals(), zakres)  # noqa: S307
            # Porównanie **względne**, z bezwzględnym progiem przy zerze.
            # Przy wielkościach astronomicznych (przyspieszenie rzędu 10^14)
            # ostatni bit podwójnej precyzji to 0,04 — a sama zmiana kolejności
            # mnożeń między JS-em a Pythonem wystarczy, żeby ten bit się różnił.
            # Kryterium bezwzględne odrzucałoby tłumaczenie idealnie poprawne.
            skala = max(abs(policzona), abs(oczekiwana), 1.0)
            if abs(policzona - oczekiwana) > TOLERANCJA_KONTROLNA * skala:
                raise SystemExit(
                    f"Punkt kontrolny {numer}: pochodna „{nazwa}” nie zgadza się.\n"
                    f"  dokument: {oczekiwana!r}\n"
                    f"  Python:   {policzona!r}\n"
                    f"  wyrażenie: {scenario['derivatives'][nazwa]}\n"
                    "To błąd tłumaczenia wzoru, nie solvera — porównanie trajektorii "
                    "nie miałoby sensu."
                )


def zbuduj_zdarzenia(scenario):
    """Funkcje zdarzeń dla `solve_ivp` — te same wyrażenia co po stronie TS."""
    nazwy = scenario["state"]
    opisy = scenario.get("events") or []
    funkcje = []

    for opis in opisy:
        def zdarzenie(t, y, kod=opis["expression"]):
            stan = dict(zip(nazwy, y))
            zakres = srodowisko(scenario, stan, t)
            return eval(kod, globals(), zakres)  # noqa: S307

        zdarzenie.direction = opis.get("direction", 0)
        zdarzenie.terminal = bool(opis.get("terminal"))
        funkcje.append(zdarzenie)

    return funkcje


def prawa_strona(scenario):
    """Funkcja `f(t, y)` dla `solve_ivp`, zbudowana z wyrażeń scenariusza."""
    nazwy = scenario["state"]

    def f(t, y):
        stan = dict(zip(nazwy, y))
        zakres = srodowisko(scenario, stan, t)
        return [eval(scenario["derivatives"][n], globals(), zakres) for n in nazwy]  # noqa: S307

    return f


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)

    with open(sys.argv[1], encoding="utf-8") as plik:
        scenario = json.load(plik)

    if scenario.get("issues"):
        raise SystemExit("Scenariusz ma uwagi: " + "; ".join(scenario["issues"]))

    sprawdz_punkty_kontrolne(scenario)

    t0, t1 = scenario["tSpan"]
    czasy = np.linspace(t0, t1, scenario["samples"])
    y0 = [scenario["initial"][n] for n in scenario["state"]]

    # Ciasne tolerancje: fixture ma być odniesieniem, więc jego własny błąd
    # numeryczny musi być o rzędy wielkości mniejszy niż różnica, której
    # szukamy między solverami.
    #
    # Metoda przychodzi ze scenariusza: dla układu sztywnego jawny DOP853 jest
    # odniesieniem bezużytecznym, bo krok narzuca mu stabilność, a nie dokładność.
    metoda = scenario.get("method", "DOP853")
    # Metody niejawne nie schodzą tak nisko z tolerancją jak DOP853 —
    # ich jakobian liczony różnicami stawia własną granicę.
    rtol, atol = (1e-11, 1e-12) if metoda == "DOP853" else (1e-10, 1e-12)

    zdarzenia = zbuduj_zdarzenia(scenario)
    wynik = solve_ivp(
        prawa_strona(scenario), (t0, t1), y0,
        t_eval=czasy, method=metoda, rtol=rtol, atol=atol,
        events=zdarzenia if zdarzenia else None,
    )

    if not wynik.success:
        raise SystemExit(f"SciPy nie rozwiązał układu: {wynik.message}")

    # Zdarzenie kończące skraca przedział, więc `t_eval` poza nim nie ma
    # odpowiednika w wyniku — bierzemy tyle punktów, ile solver policzył.
    fixture = {
        "id": scenario["id"],
        "state": scenario["state"],
        "parameters": scenario["parameters"],
        "initial": scenario["initial"],
        "tSpan": scenario["tSpan"],
        "solver": f"scipy {metoda} rtol={rtol:g} atol={atol:g}",
        "t": [float(x) for x in wynik.t],
        "y": {n: [float(v) for v in wynik.y[i]] for i, n in enumerate(scenario["state"])},
        # Chwile zdarzeń: to jest odniesienie dla etapu 2, w którym zdarzenie
        # przestało być sprawdzeniem po kroku i stało się równaniem.
        "eventTimes": [
            [float(t) for t in czasy_zdarzen]
            for czasy_zdarzen in (wynik.t_events if wynik.t_events is not None else [])
        ],
    }

    with open(sys.argv[2], "w", encoding="utf-8") as plik:
        json.dump(fixture, plik, indent=2)
        plik.write("\n")

    print(f"{scenario['id']}: {len(wynik.t)} punktów → {sys.argv[2]}")


if __name__ == "__main__":
    main()
