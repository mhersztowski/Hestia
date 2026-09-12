---
title: Prędkość chwilowa
tags: [resnick-halliday, ruch-jednowymiarowy]
book: Resnick & Halliday, Fizyka tom 1 (1998)
chapter: 3 RUCH JEDNOWYMIAROWY
section: 3-4
pages: 46-47
id: rh1-sec-3-4
status: przeniesiony
---
# 3-4. Prędkość chwilowa

Przypuśćmy, że punkt materialny porusza się w taki sposób, że jego prędkość
średnia mierzona w różnych przedziałach czasu nie jest jednakowa. Mówimy
wówczas, że punkt porusza się ze zmienną prędkością. W takich przypadkach
konieczne jest określenie prędkości punktu w dowolnej chwili czasu, czyli
*prędkości chwilowej*.

Prędkość może się zmienić na skutek zmian jej wartości, zmian kierunku lub
jednego i drugiego. Dla ruchu przedstawionego na ((rh1-3-rys2|rys. 3-2a))
średnia prędkość w przedziale czasu $t_2 - t_1$ może różnić się zarówno
wartością, jak i kierunkiem od średniej prędkości w innym przedziale czasu
$t'_2 - t_1$. Zilustrowaliśmy to na ((rh1-3-rys2|rys. 3-2b)), przesuwając punkt
$B$ kolejno coraz to bliżej do punktu $A$. Punkty $B'$ i $B''$ przedstawiają dwa
pośrednie położenia punktu materialnego, odpowiadające chwilom czasu $t'_2$
i $t''_2$ i określone odpowiednio wektorami położenia równymi $\mathbf{r}'_2$
i $\mathbf{r}''_2$. Wektorowe przemieszczenia $\Delta\mathbf{r}$,
$\Delta\mathbf{r}'$ i $\Delta\mathbf{r}''$ różnią się od siebie kierunkami
i kolejno stają się coraz to mniejsze. Podobnie, kolejno maleją odpowiednie
przedziały czasu $\Delta t(= t_2 - t_1)$, $\Delta t'(= t'_2 - t_1)$ oraz
$\Delta t''(= t''_2 - t_1)$.

Postępując dalej w ten sposób, tzn. zbliżając punkt $B$ do punktu $A$
stwierdzimy, że stosunek przemieszczeń do odpowiednich przedziałów czasu zbliża
się do określonej wartości granicznej. Chociaż przemieszczenia stają się
krańcowo małe, odpowiadające im przedziały czasu również stają się małe, tak że
stosunek tych dwu wielkości może mieć wartość skończoną. Podobnie, wraz ze
zmniejszeniem się wartości liczbowej wektora przemieszczenia, jego kierunek
zbliża się coraz bardziej do pewnego kierunku granicznego, mianowicie kierunku
stycznego do toru cząstki w punkcie $A$. Otrzymana w ten sposób graniczna
wartość $\Delta\mathbf{r}/\Delta t$ nazywana jest
((rh1-poj-predkosc-chwilowa|prędkością chwilową)) punktu materialnego w punkcie
$A$ lub prędkością punktu materialnego w chwili $t_1$.

Jeżeli $\Delta\mathbf{r}$ określa przemieszczenie punktu materialnego w małym
przedziale czasu $\Delta t$ między $t$ i $t + \Delta t$, prędkość tego punktu
w chwili $t$ jest granicą stosunku $\Delta\mathbf{r}/\Delta t$, gdy zarówno
$\Delta\mathbf{r}$, jak i $\Delta t$ dążą do zera. Jeżeli więc prędkość chwilową
oznaczymy przez $\mathbf{v}$, to

$$\mathbf{v} = \lim_{\Delta t \to 0} \frac{\Delta\mathbf{r}}{\Delta t}.$$

Kierunek $\mathbf{v}$ jest granicznym kierunkiem, jaki przyjmuje
$\Delta\mathbf{r}$, gdy $B$ zbliża się do $A$ lub gdy $\Delta t$ dąży do zera.
Jak widzieliśmy, kierunek ten jest styczny do toru punktu materialnego
w punkcie $A$.

W matematyce granicę stosunku $\Delta\mathbf{r}/\Delta t$ przy $\Delta t$
dążącym do zera oznaczamy symbolem $\mathrm{d}\mathbf{r}/\mathrm{d}t$
i nazywamy *pochodną wektora* $\mathbf{r}$ względem czasu $t$. Mamy więc

```formula:rh1-3-eq2
@relation
\mathbf{v} = \lim_{\Delta t \to 0} \frac{\Delta\mathbf{r}}{\Delta t} = \frac{\mathrm{d}\mathbf{r}}{\mathrm{d}t}.
```

*(3-2)*

Wartość prędkości chwilowej jest równa po prostu wartości bezwzględnej wektora
$\mathbf{v}$. Znaczy to, że

```formula:rh1-3-eq3
@relation
v = |\mathbf{v}| = |\mathrm{d}\mathbf{r}/\mathrm{d}t|.
```

*(3-3)*

Wartość prędkości jest zawsze liczbą dodatnią.

Podobnie jak punkt materialny jest pojęciem fizycznym związanym z matematycznym
pojęciem punktu, tak prędkość jest pojęciem fizycznym związanym z matematyczną
operacją różniczkowania. W istocie rachunek różniczkowy został wynaleziony, aby
być wygodnym narzędziem matematycznym przy rozważaniu podstawowych zagadnień
mechaniki.

```callout:rh1-nota-newton-leibniz
@kind person
Newton i Leibniz
@body Rachunek różniczkowy powstał dwa razy, niezależnie. Newton opracował
  swoją „metodę fluksji" około 1665 roku, ale ogłosił ją późno; Leibniz
  wydrukował swoją wersję w 1684 roku w czasopiśmie „Acta Eruditorum". Zapis,
  którego Resnick używa na tej stronie — $\mathrm{d}\mathbf{r}/\mathrm{d}t$ —
  jest Leibniza; Newton stawiał kropkę nad symbolem. Spór o pierwszeństwo
  poróżnił matematyków angielskich z kontynentalnymi na ponad sto lat, a wygrał
  go zapis, nie autor.
@source 3-4, s. 47
```

W następnym paragrafie zbadamy dokładniej pojęcie prędkości chwilowej dla
specjalnego przypadku ruchu, ruchu jednowymiarowego (prostoliniowego).

## Uwagi redakcyjne

*Ta sekcja nie pochodzi z książki.*

- **Zakres poprawiony wobec rusztowania**: 46–47, nie 46. Podrozdział kończy się
  w górnej ćwiartce s. 47, dwa akapity przed nagłówkiem 3-5. Drugi raz w tym
  rozdziale zakres ze spisu treści okazał się za krótki o ostatnią stronę.
- **Jedno nowe hasło**: `prędkość chwilowa` (skorowidz: „prędkość — chwilowa
  46 i n."). Czekało od 3-3, gdzie podpis rys. 3-2b tylko je zapowiadał.
  Odsyłacz stoi przy **drugim** wystąpieniu kursywy — pierwsze („czyli
  *prędkości chwilowej*") nazywa pojęcie, a dopiero drugie mówi, czym ono jest.
  To ta sama reguła, co przy „masie zredukowanej" w 15-8.
- **Hasło `ruch → jednowymiarowy` (s. 47) należy do 3-5, nie tutaj.** Skorowidz
  wskazuje stronę, na której zaczyna się następny podrozdział; w części
  należącej do 3-4 zwrot „ruchu jednowymiarowego (prostoliniowego)" nie ma
  kursywy i niczego nie wprowadza.
- **„Pochodna wektora" zostaje kursywą bez hasła** — skorowidz nie zna tego
  pojęcia (ma tylko „wielkości pochodne 13").
- **(3-2) i (3-3) są `@relation`, ale z różnych powodów.** (3-2) parser
  **odrzuca** jako przypisanie, bo po prawej stronie stoi granica. (3-3)
  natomiast **przechodzi bez jednej uwagi** i zostaje zapisane jako zwykła
  definicja z wyrażeniem `|dr/dt|` — czyli silnik wziąłby różniczki za zwykłe
  symbole i policzył coś zupełnie innego, gdyby wzór trafił kiedyś do bloku
  `sim`. To ta sama rodzina pułapek, co `\varphi` czytane jako złoty podział:
  **wynik by wyszedł, tylko nieprawdziwy**. Rodzaj deklarujemy więc jawnie
  w obu przypadkach.
- **Wzór bez numeru zostaje zwykłym LaTeX-em.** Pierwsza granica (`v = lim
  Δr/Δt`) jest w druku wyświetlona, ale **nie ma numeru na marginesie**, więc
  nie ma z czego zrobić identyfikatora — schemat `rh1-3-eq{n}` bierze numer
  z książki, a nazwa opisowa byłaby moim wymysłem. Nic się na ten wzór nie
  powołuje, więc nic na tym nie tracimy.
- **Usterka druku: `t` złożone antykwą.** W zdaniu „nazywamy *pochodną wektora*
  r względem czasu t" symbol czasu jest **prosty**, choć w całym tomie stoi
  kursywą (dwa wiersze wyżej, w „przy $\Delta t$ dążącym", jest już kursywny).
  U nas idzie jako matematyka w linii, czyli kursywą — tej różnicy kroju nasz
  zapis nie odwzorowuje, tak samo jak nie odwzorowuje petitu.
- **„W następnym paragrafie" zostaje zwykłym tekstem.** Książka nie podaje tu
  numeru, a odsyłacz `rh1-sec-3-5` byłby dopisaniem informacji, której w druku
  nie ma. Podpis odsyłacza ma brzmieć jak w książce, a książka mówi „następnym".
- **Notka kontekstowa `rh1-nota-newton-leibniz` jest nasza, nie Resnicka.**
  Zaczepieniem jest zdanie książki o tym, że rachunek różniczkowy wynaleziono
  dla mechaniki — Resnick mówi to, ale **nie podaje ani jednego nazwiska**.
  Notka dopowiada nazwiska i zauważa, że zapis `dr/dt` z tej strony jest
  Leibniza, a nie Newtona.
