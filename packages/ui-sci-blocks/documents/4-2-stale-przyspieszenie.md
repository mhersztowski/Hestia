---
title: Ruch na płaszczyźnie ze stałym przyspieszeniem
tags: [resnick-halliday, ruch-na-plaszczyznie]
book: Resnick & Halliday, Fizyka tom 1 (1998)
chapter: 4 RUCH NA PŁASZCZYŹNIE
section: 4-2
pages: 69-70
id: rh1-sec-4-2
status: przeniesiony
---
# 4-2. Ruch na płaszczyźnie ze stałym przyspieszeniem

Rozważmy najpierw specjalny przypadek ruchu na płaszczyźnie, ruch ze stałym
przyspieszeniem. W czasie tego ruchu nie zmienia się ani kierunek, ani wartość
przyspieszenia. Nie będą się również zmieniać składowe przyspieszenia, tzn.
$a_x = \mathrm{const}$ i $a_y = \mathrm{const}$. Mamy więc do czynienia
z ruchem, który można przedstawić w postaci sumy dwóch ruchów składowych,
odbywających się jednocześnie, ze stałymi przyspieszeniami, wzdłuż dwóch
wzajemnie prostopadłych kierunków. Punkt materialny będzie się, ogólnie biorąc,
poruszał wzdłuż pewnej krzywej leżącej na płaszczyźnie. Tak będzie również
wtedy, gdy jedna ze składowych przyspieszenia, powiedzmy $a_x$, jest równa zeru,
gdyż wówczas odpowiednia składowa prędkości, powiedzmy $v_x$, może być różna od
zera. Przykładem tego ostatniego ruchu jest ruch pocisku, który porusza się
wzdłuż linii krzywej w płaszczyźnie pionowej i, jeżeli pominiemy opór powietrza,
ma stałe przyspieszenie, skierowane w dół wzdłuż osi $y$.

Ogólne równanie opisujące ruch ze stałym przyspieszeniem $\mathbf{a}$ na
płaszczyźnie możemy otrzymać przyjmując po prostu, że

$$a_x = \mathrm{const}, \qquad a_y = \mathrm{const}.$$

Wówczas równania dla stałego przyspieszenia zebrane w ((rh1-3-tab1|tablicy 3-1))
można zastosować zarówno do składowej $x$ wektora położenia $\mathbf{r}$,
wektora prędkości $\mathbf{v}$ i wektora przyspieszenia $\mathbf{a}$, jak i do
składowej $y$ tych wektorów (patrz ((rh1-4-tab1|tablica 4-1))).

W obu zespołach równań podanych w ((rh1-4-tab1|tablicy 4-1)) występuje ten sam
parametr czasu $t$, ponieważ $t$ określa chwilę czasu, w której punkt poruszający
się wzdłuż linii krzywej na płaszczyźnie $xy$ zajmuje położenie opisane
składowymi $x$ i $y$ wektora $\mathbf{r}$.

```table:rh1-4-tab1
| Numer równania | Równanie opisujące ruch wzdłuż osi $x$ | Numer równania | Równanie opisujące ruch wzdłuż osi $y$ |
|---|---|---|---|
| 4-4a | $v_x = v_{x0}+a_x t$ | 4-4a′ | $v_y = v_{y0}+a_y t$ |
| 4-4b | $x = v_0+\tfrac{1}{2}(v_{x0}+v_x)t$ | 4-4b′ | $y = y_0+\tfrac{1}{2}(v_{y0}+v_v)t$ |
| 4-4c | $x = x_0+v_{x0}t+\tfrac{1}{2}a_x t^2$ | 4-4c′ | $y = y_0+v_{y0}t+\tfrac{1}{2}a_y t^2$ |
| 4-4d | $v_x^2 = v_{x0}^2+2a_x(x-x_0)$ | 4-4d′ | $v_y^2 = v_{y0}^2+2a_y(y-y_0)$ |
@caption **Tablica 4-1.** Ruch ze stałym przyspieszeniem na płaszczyźnie $xy$
```

Równania kinematyczne podane w ((rh1-4-tab1|tablicy 4-1)) można również
przedstawić w postaci wektorowej. Na przykład podstawiając równania
(((rh1-4-tab1|4-4a))) i (((rh1-4-tab1|4-4a′))) do równania (((rh1-4-eq2|4-2)))
otrzymujemy

$$\mathbf{v} = \mathbf{i}v_x+\mathbf{j}v_y = \mathbf{i}(v_{x0}+a_x t)+\mathbf{j}(v_{y0}+a_y t) = (\mathbf{i}v_{x0}+\mathbf{j}v_{y0})+(\mathbf{i}a_x+\mathbf{j}a_y)t.$$

W pierwszym nawiasie mamy wektor prędkości początkowej $\mathbf{v}_0$ [patrz
równanie (((rh1-4-eq2|4-2)))], a w drugim nawiasie wektor przyspieszenia
$\mathbf{a}$ [patrz równanie (((rh1-4-eq3|4-3)))]. Równanie wektorowe

```formula:rh1-4-eq5a
@relation
\mathbf{v} = \mathbf{v}_0+\mathbf{a}t
```

*(4-5a)*

jest więc równoważne dwóm równaniom skalarnym (((rh1-4-tab1|4-4a))) i
(((rh1-4-tab1|4-4a′))) podanym w ((rh1-4-tab1|tablicy 4-1)). Z równania tego
jasno widać, że prędkość $\mathbf{v}$ w dowolnej chwili jest sumą prędkości
początkowej $\mathbf{v}_0$, jaką miałby punkt materialny, gdyby nie występowało
przyspieszenie, oraz wektorowej zmiany prędkości $\mathbf{a}t$, uzyskanej
w przedziale czasu od 0 do $t$, dzięki stałemu przyspieszeniu $\mathbf{a}$.
Podobnie równania skalarne (((rh1-4-tab1|4-4c))) i (((rh1-4-tab1|4-4c′))) są
równoważne pojedynczemu równaniu wektorowemu

```formula:rh1-4-eq5b
@relation
\mathbf{r} = \mathbf{r}_0+\mathbf{v}_0 t+\tfrac{1}{2}\mathbf{a}t^2,
```

*(4-5b)*

które można równie łatwo zinterpretować. Udowodnienie tej i pozostałych
zależności odkładamy do zadania 3.

## Uwagi redakcyjne

*Ta sekcja nie pochodzi z książki.*

- **Zakres 69–70, a nie 69.** Ósmy raz z rzędu rusztowanie podaje sam początek —
  podrozdział zaczyna się w połowie s. 69 i kończy zdaniem „odkładamy do
  zadania 3" w pierwszej trzeciej s. 70, pod którym stoi nagłówek 4-3.
- **Numer równania, którego jedynym miejscem jest tablica.** Równania (4-4a)…
  (4-4d′) nie są w druku wydrukowane osobno — istnieją wyłącznie jako wiersze
  tablicy 4-1, a mimo to tekst odsyła do nich po numerze cztery razy (i piąty raz
  w zadaniu 3). Odsyłacz prowadzi więc do **tablicy**, a numer siedzi w podpisie
  odsyłacza: `((…tab1|4-4a))`. To ta sama decyzja co przy panelach rysunku —
  wiersz tablicy nie jest osobnym blokiem, więc nie ma własnego identyfikatora.
  Pierwszy taki przypadek w bazie.
- **Usterka druku: `x = v_0 + ½(v_{x0}+v_x)t` w wierszu 4-4b.** Ma być $x_0$,
  bo równanie bliźniacze 4-4b′ ma po prawej stronie $y_0$, a pierwowzór (3-14)
  z tablicy 3-1 — $x_0$. Zostaje tak, jak stoi.
- **Druga usterka w tym samym wierszu: `v_v` zamiast `v_y` w 4-4b′.**
  Rozstrzygnięte porównaniem kroju znaku, a nie rachunkiem: w tym samym wierszu
  indeks przy $v_{y0}$ ma ogonek schodzący pod linię, a przy drugim składniku go
  nie ma. Dwie usterki w jednym wierszu tablicy i obie w wierszu „b" — pozostałe
  sześć równań jest bez zarzutu.
- **Tablica ma cztery kolumny, bo tak jest w druku.** Nagłówek „Numer równania"
  powtarza się w środku i to on dzieli tablicę na zespół $x$ i zespół $y$. Zwykły
  markdown to unosi, w odróżnieniu od tablicy 1-2, gdzie podział był bez
  powtórzonego nagłówka.
- **Ani jednego hasła.** Skorowidz nie wiąże ze stronami 69–70 nic poza `rzut
  ukośny 70 i n.`, a to hasło należy do 4-3 — na stronie 70 podrozdział 4-2 się
  kończy, zanim książka rzut ukośny wprowadzi. Podrozdział bez haseł jest stanem
  poprawnym, jak 15-6 i 15-7.
- **Zero notek kontekstowych.** Podrozdział nie wymienia nikogo ani niczego;
  przypis o Galileuszu z tej samej strony należy do 4-3.
- **Odsyłacz „do zadania 3" zostaje zwykłym tekstem** — `Zadania.md` rozdziału 4
  jeszcze nie istnieje, a pozycja listy i tak nie ma dziś identyfikatora. To
  drugi w bazie tekst wykładowy odsyłający do numeru zadania, po 15-3.
- **Dwa wzory numerowane i dwa wyświetlenia bez numeru.** (4-5a) i (4-5b) są
  `@relation`, bo po lewej stoi wektor. Wyprowadzenie nad (4-5a) i para
  $a_x = \mathrm{const}$ numeru w druku nie mają, więc zostają zwykłym LaTeX-em.
