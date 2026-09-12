# Cross-walidacja ze SciPy

Poziom 2 walidacji z raportu (§7). Testy analityczne łapią błędy solvera tam,
gdzie znamy rozwiązanie zamknięte — ale większość układów go nie ma. Tutaj
drugim zdaniem jest **niezależny silnik**: SciPy z adaptacyjnym DOP853,
całkujący ten sam układ wyeksportowany z tego samego dokumentu.

Żeby błąd przeszedł niezauważony, musiałby być identyczny w dwóch niezależnie
napisanych całkowaniach.

## Jak regenerować odniesienia

Fixtures powstają **osobnym poleceniem**, nie w trakcie testu — inaczej
porównywalibyśmy wynik z samym sobą.

```bash
# jednorazowo: środowisko z SciPy
python3 -m venv .venv-scipy && .venv-scipy/bin/pip install numpy scipy

# regeneracja po zmianie modeli
pnpm --filter @hestia/core-sci build
cd packages/core-sci && node validation/generate-fixtures.mjs ../../.venv-scipy/bin/python
```

Testy same w sobie **nie potrzebują Pythona** — czytają gotowe pliki z
`fixtures/`. Brak fixture nie ucisza sprawdzenia: osobny test pilnuje, że
wszystkie odniesienia są obecne.

## Dlaczego punkty kontrolne

Wspólnym punktem obu dróg jest tłumaczenie wzoru z LaTeX-a na Pythona. Gdyby
tłumacz się mylił, porównanie trajektorii pokazałoby rozjazd — ale wskazywałoby
na solver, a wina byłaby gdzie indziej.

Dlatego scenariusz niesie `checkpoints`: wartości prawych stron policzone przez
silnik dokumentu w kilku stanach. Skrypt Pythona sprawdza je **przed**
całkowaniem i zatrzymuje się z jasnym komunikatem, jeśli się nie zgadzają.

## Zmierzone rozjazdy

| układ | metoda po naszej stronie | rozjazd | próg | margines |
|---|---|---|---|---|
| wahadło | rk4 | 1,9·10⁻⁷ | 5·10⁻⁶ | ×26 |
| oscylator wymuszony | rk4 | 1,9·10⁻⁷ | 5·10⁻⁶ | ×26 |
| Lorenz (t ≤ 3) | rk4 | 4,1·10⁻⁶ | 1·10⁻⁴ | ×24 |
| orbita keplerowska | verlet | 3,3·10⁻⁶ | 1·10⁻⁴ | ×30 |
| obwód sztywny | rosenbrock | 3,3·10⁻⁶ | 1·10⁻⁴ | ×30 |
| rzut ukośny | dopri5 | 1,4·10⁻⁹ | 5·10⁻⁸ | ×36 |

Trzy ostatnie dołożono w etapie 7 — **po jednym na każdą metodę**, która nie
miała dotąd potwierdzenia spoza pakietu. Metodę wybiera dokument dyrektywą
`@solver`, więc walidacja dotyczy tego, co czytelnik naprawdę dostaje. Rzut
wychodzi o trzy rzędy dokładniej od pozostałych, bo tam krok dobiera sterowanie
błędem, a nie autor.

Referencja dla obwodu sztywnego liczona jest metodą **Radau**: jawny DOP853 nie
byłby tam odniesieniem, bo jego krok narzuca stabilność, a nie dokładność.

## Chwila zdarzenia

Rzut ukośny niesie też drugie porównanie: **chwilę lądowania**. Obie strony
rozwiązują to samo równanie `g(t, y) = 0` wewnątrz kroku, ale zupełnie inaczej —
SciPy metodą Brenta na własnym interpolancie, my metodą Illinois na dense
outpucie Dormanda–Prince'a. Zgodność do ósmej cyfry znaczy, że mówią o tej samej
chwili, a nie o dwóch bliskich.

## Czego cross-walidacja NIE wykrywa

Sanity check tej metody polegał na wstrzyknięciu usterki: współczynnik `A21`
w tablicy Dormanda–Prince'a zmieniono z 1/5 na **1/4**. Nie padł ani jeden test —
ani jednostkowy, ani porównanie ze SciPy.

Powód dotyczy każdej metody ze sterowaniem błędem: zepsuty współczynnik obniża
rząd metody, ale sterowanie **skraca krok**, aż błąd zmieści się w tolerancji.
Wynik pozostaje dokładny; płaci się pracą, której nikt nie mierzy. Cała rodzina
testów opartych na dokładności wyniku jest więc na taki błąd ślepa.

Wykrywa go pomiar rzędu (`studyConvergence` z etapu 0) przy wyłączonej
adaptacji — `src/numeric/rzadMetody.test.ts`. Ta sama usterka zbija tam rząd
z 5,0 do 4,0, a zaburzenie `C21` w RODAS3 z 3,0 do 1,0.

Wniosek do zapamiętania: **dla metod o stałym kroku wystarcza porównanie
trajektorii, dla adaptacyjnych trzeba osobno mierzyć rząd.**

Progi są dobrane do **zmierzonych** różnic, nie „na oko": margines rzędu tysiąca
przepuściłby realny błąd. Sprawdzone wstrzyknięciem usterki — zmiana wagi w
kroku RK4 z `2` na `2.001` podniosła rozjazd do 3,9·10⁻³ i wywróciła wszystkie
trzy testy.

Chaos ma luźniejszy próg i krótszy przedział, bo dwa różne solwery rozjeżdżają
się tam wykładniczo z definicji zjawiska, nie z powodu błędu.
