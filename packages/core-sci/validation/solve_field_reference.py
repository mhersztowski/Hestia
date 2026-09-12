"""
solve_field_reference.py — niezależne rozwiązanie równania pola z dokumentu.

Cross-walidacja pokrywała dotąd wyłącznie układy ODE. Dla pól brak był
dotkliwszy niż gdzie indziej: jawny schemat różnic skończonych ma **warunek
stabilności**, którego błędne wyliczenie objawia się dopiero na gęstszej
siatce — i nie jako błąd, tylko jako wynik rozbiegający się do nieskończoności
albo, gorzej, wyglądający wiarygodnie i będący złym.

Niezależność jest tu prawdziwa i idzie dalej niż przy ODE: po naszej stronie
jawny schemat ze stałym krokiem dobranym z warunku stabilności, po tej —
**metoda linii**: siatka przestrzenna zamieniona na wielki układ ODE, całkowany
adaptacyjnym solverem SciPy z kontrolą błędu. To są dwa różne pomysły na to samo
równanie, a nie dwa warianty tego samego.

Wspólnym punktem obu dróg zostaje tłumaczenie wzoru, więc — jak przy ODE —
laplasjan podstawiamy pod ten sam symbol i porównujemy najpierw jeden krok.

Użycie:
    python3 solve_field_reference.py scenariusz.json fixture.json
"""
import json
import sys
from math import (  # noqa: F401 — nazwy są używane przez eval wyrażeń
    sin, cos, tan, exp, log, sqrt, fabs, pi, e,
)

import numpy as np
from scipy.integrate import solve_ivp


def laplasjan(u, hx, hy, boundary):
    """
    Drugie pochodne przestrzenne różnicami centralnymi.

    Brzeg obsługujemy przez **warstwę duchów**: dla Dirichleta wartość poza
    siatką jest zadana, dla Neumanna odbita. Wpisywanie warunku wprost do
    wzoru mieszałoby dwie rzeczy — schemat różnicowy i warunek brzegowy — a
    wtedy błąd w jednym wygląda jak błąd w drugim.
    """
    rozszerzone = np.empty((u.shape[0] + 2, u.shape[1] + 2), dtype=float)
    rozszerzone[1:-1, 1:-1] = u

    if boundary["kind"] == "neumann":
        rozszerzone[0, 1:-1] = u[0, :]
        rozszerzone[-1, 1:-1] = u[-1, :]
        rozszerzone[1:-1, 0] = u[:, 0]
        rozszerzone[1:-1, -1] = u[:, -1]
    else:
        wartosc = float(boundary.get("value", 0.0))
        rozszerzone[0, 1:-1] = wartosc
        rozszerzone[-1, 1:-1] = wartosc
        rozszerzone[1:-1, 0] = wartosc
        rozszerzone[1:-1, -1] = wartosc

    # Rogi nie wchodzą do pięciopunktowego szablonu — wystarczy cokolwiek.
    rozszerzone[0, 0] = rozszerzone[0, -1] = rozszerzone[-1, 0] = rozszerzone[-1, -1] = 0.0

    d2x = (rozszerzone[1:-1, 2:] - 2 * u + rozszerzone[1:-1, :-2]) / (hx * hx)
    d2y = (rozszerzone[2:, 1:-1] - 2 * u + rozszerzone[:-2, 1:-1]) / (hy * hy)
    return d2x + d2y


def main() -> int:
    scenariusz = json.loads(open(sys.argv[1], encoding="utf-8").read())
    if scenariusz.get("issues"):
        print("Scenariusz ma uwagi:", scenariusz["issues"], file=sys.stderr)
        return 1

    nx, ny = scenariusz["nx"], scenariusz["ny"]
    x0, x1 = scenariusz["domainX"]
    y0, y1 = scenariusz["domainY"]

    xs = np.linspace(x0, x1, nx)
    ys = np.linspace(y0, y1, ny)
    X, Y = np.meshgrid(xs, ys)

    # Funkcje i stałe podajemy jawnie: `eval` dostaje puste `__builtins__`,
    # więc nic nie wchodzi tu samo — i o to chodzi, bo wyrażenie pochodzi
    # z dokumentu.
    srodowisko = dict(scenariusz["parameters"])
    srodowisko.update({
        "sin": np.sin, "cos": np.cos, "tan": np.tan,
        "exp": np.exp, "log": np.log, "sqrt": np.sqrt,
        "fabs": np.abs, "abs": np.abs,
        "pi": np.pi, "e": np.e,
    })

    u0 = np.asarray(
        eval(scenariusz["initial"], {"__builtins__": {}}, {**srodowisko, "x": X, "y": Y}),
        dtype=float,
    )
    if u0.shape != (ny, nx):
        u0 = np.full((ny, nx), float(u0))

    # Brzeg ustalony obowiązuje też w chwili zero: rozbieżność tutaj dawałaby
    # skok w pierwszym kroku i wyglądała na błąd solvera.
    if scenariusz["boundary"]["kind"] != "neumann":
        wartosc = float(scenariusz["boundary"].get("value", 0.0))
        u0[0, :] = u0[-1, :] = wartosc
        u0[:, 0] = u0[:, -1] = wartosc

    hx = (x1 - x0) / (nx - 1)
    hy = (y1 - y0) / (ny - 1)
    falowe = scenariusz["order"] == "wave"

    dirichlet = scenariusz["boundary"]["kind"] != "neumann"

    def prawa_strona(pole):
        lokalne = {
            **srodowisko,
            scenariusz["field"]: pole,
            "Lambda": laplasjan(pole, hx, hy, scenariusz["boundary"]),
            "x": X,
            "y": Y,
        }
        wynik = np.asarray(eval(scenariusz["rhs"], {"__builtins__": {}}, lokalne), dtype=float)

        # Brzeg ustalony ma **zostać** ustalony: w metodzie linii punkty
        # brzegowe też są niewiadomymi i bez wyzerowania ich pochodnej zaczynają
        # ewoluować według równania. Przy dyfuzji ledwo to widać (brzeg i tak
        # dąży do zera), przy fali daje odbicie o złej fazie — i to właśnie
        # rozjeżdżało referencję z naszym schematem, który brzeg trzyma sztywno.
        if dirichlet:
            wynik = np.array(wynik, copy=True)
            wynik[0, :] = wynik[-1, :] = 0.0
            wynik[:, 0] = wynik[:, -1] = 0.0
        return wynik

    def f(_t, y):
        if falowe:
            # Równanie drugiego rzędu jako układ pierwszego: pole i jego prędkość.
            pole = y[: nx * ny].reshape(ny, nx)
            predkosc = y[nx * ny :].reshape(ny, nx)
            return np.concatenate([predkosc.ravel(), prawa_strona(pole).ravel()])
        return prawa_strona(y.reshape(ny, nx)).ravel()

    y0v = np.concatenate([u0.ravel(), np.zeros(nx * ny)]) if falowe else u0.ravel()
    czasy = np.linspace(scenariusz["tSpan"][0], scenariusz["tSpan"][1], scenariusz["frames"])

    wynik = solve_ivp(
        f, scenariusz["tSpan"], y0v, t_eval=czasy,
        method="LSODA", rtol=1e-8, atol=1e-10,
    )
    if not wynik.success:
        print("SciPy nie policzył:", wynik.message, file=sys.stderr)
        return 1

    klatki = []
    for i, t in enumerate(wynik.t):
        pole = wynik.y[: nx * ny, i]
        klatki.append({"t": float(t), "values": [float(v) for v in pole]})

    fixture = {
        "id": scenariusz["id"],
        "nx": nx,
        "ny": ny,
        "order": scenariusz["order"],
        "parameters": scenariusz["parameters"],
        "tSpan": scenariusz["tSpan"],
        "frames": klatki,
    }
    open(sys.argv[2], "w", encoding="utf-8").write(json.dumps(fixture))
    print(f"{scenariusz['id']}: {len(klatki)} klatek {nx}×{ny}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
