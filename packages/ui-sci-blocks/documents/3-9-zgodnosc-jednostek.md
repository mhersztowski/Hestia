---
title: Zgodność jednostek i wymiarów
tags: [resnick-halliday, ruch-jednowymiarowy]
book: Resnick & Halliday, Fizyka tom 1 (1998)
chapter: 3 RUCH JEDNOWYMIAROWY
section: 3-9
pages: 55-57
id: rh1-sec-3-9
status: przeniesiony
---
# 3-9. Zgodność jednostek i wymiarów

Czytelnik nie powinien mechanicznie uczyć się na pamięć wzorów takich, jak podano
w ((rh1-3-tab1|tablicy 3-1)). Najważniejszą rzeczą jest dokładne prześledzenie
sposobu ich wyprowadzania. Podane wzory Czytelnik przyswoi sobie automatycznie,
stosując je do rozwiązywania zadań, częściowo wskutek wielokrotnego ich
powtarzania, ale głównie dlatego, że dzięki zastosowaniom staną się one bardziej
zrozumiałe.

W podanych równaniach możemy stosować *dowolne jednostki* czasu i odległości.
Jeżeli jednak zdecydujemy się np. czas podawać w sekundach, a odległość
w metrach, konsekwentnie będziemy musieli prędkość wyrazić w m/s,
a przyspieszenie w m/s². Gdyby w danych zadaniach jednostki pewnej wielkości,
np. prędkości, nie były zgodne z jednostkami innej wielkości, np. przyspieszenia,
wówczas powinniśmy tak przekształcić dane przed podstawieniem tych wielkości do
naszych równań, aby wszystkie jednostki były zgodne. Ustalając jednostki
wielkości podstawowych automatycznie określamy zgodne z nimi jednostki wielkości
pochodnych. Przy wszystkich obliczeniach należy pamiętać o określeniu jednostek
końcowego wyniku, ponieważ bez podania jednostek wynik nie ma znaczenia.

**Przykład 5.** Przypuśćmy, że chcemy znaleźć prędkość punktu materialnego
poruszającego się ze stałym przyspieszeniem 5,00 cm/s², po upływie ½ h od
początku ruchu, jeżeli jego prędkość początkowa wynosiła 10,0 m/s. Decydujemy się
jako jednostki długości wybrać metry, a jako jednostki czasu sekundy. Wówczas

$$a_x = 5{,}00\ \mathrm{cm/s^2} = 5{,}00\ \mathrm{cm/s^2}\cdot(1\ \mathrm{m}/100\ \mathrm{cm}) = 0{,}05\ \mathrm{m/s^2},$$

natomiast przedział czasu

$$\Delta t = t-t_0 = \tfrac{1}{2}\mathrm{h}\cdot(60\ \mathrm{s}/1\ \mathrm{min})\cdot(60\ \mathrm{min}/1\ \mathrm{h}) = 1800\ \mathrm{s}.$$

Zauważmy, że współczynniki przeliczeniowe jednostek znajdujących się w nawiasach
są równe jedności. Przyjmując, że w chwili początkowej $t_0 = 0$, podobnie jak
w równaniu (((rh1-3-eq12|3-12))), mamy

$$v_x = v_{x0}+a_x t = 10{,}0\ \mathrm{m/s}+0{,}05\ \mathrm{m/s^2}\cdot 1800\ \mathrm{s} = 100\ \mathrm{m/s}.$$

Jednym ze sposobów na upewnienie się, że otrzymane równanie jest poprawne, jest
sprawdzenie *wymiarów* wszystkich jego wyrazów.
((rh1-poj-wymiar|Wymiary)) dowolnej wielkości fizycznej można zawsze przedstawić
w postaci kombinacji wymiarów odpowiednich wielkości podstawowych, takich jak
masa, długość i czas. Wymiarem prędkości jest długość [L] dzielona przez czas
[T]; wymiarem przyspieszenia jest długość dzielona przez kwadrat czasu itd.
*W każdym poprawnym równaniu fizycznym wymiary wszystkich jego wyrazów muszą być
jednakowe.* Nie możemy na przykład przyrównywać do siebie dwóch wyrazów, z których
jeden ma wymiar prędkości, a drugi przyspieszenia. Symbole wymiarów związane
z odpowiednimi wielkościami fizycznymi należy traktować jak wielkości
algebraiczne; można łączyć, upraszczać, itd., tak jakby były one zwykłymi
wyrazami równania. Na przykład, aby sprawdzić czy równanie
(((rh1-3-eq15|3-15))) $x = x_0+v_{x0}t+\tfrac{1}{2}a_x t^2$ jest poprawne pod
względem wymiarów, zauważmy, że $x$ i $x_0$ mają wymiar długości. Pozostałe dwa
wyrazy muszą więc również mieć wymiar długości. Wymiar wyrazu $v_{x0}t$ jest
następujący:

$$\frac{\text{długość}}{\text{czas}}\cdot\text{czas} = \text{długość}, \qquad \text{czyli} \qquad \frac{L}{T}\cdot T = L,$$

natomiast wymiarem wyrazu $\tfrac{1}{2}a_x t^2$ jest

$$\frac{\text{długość}}{\text{czas}^2}\cdot\text{czas}^2 = \text{długość}, \qquad \text{czyli} \qquad \frac{L}{T^2}T^2 = L.$$

Omawiane równanie jest więc poprawne pod względem wymiarów. Należy pamiętać
o sprawdzeniu wymiarów każdego stosowanego równania.

**Przykład 6.** Prędkość samochodu jadącego dokładnie na wschód maleje
jednostajnie od wartości 45 km/h, na odcinku równym 50 m.

(a) Jaka jest wartość i kierunek stałego przyspieszenia samochodu?

Wybieramy umownie kierunek z zachodu na wschód jako kierunek dodatni osi $x$.
Znamy $x$ i $v_x$, a szukamy $a_x$. Czas nie występuje w zadaniu. Odpowiednim
równaniem jest więc równanie (((rh1-3-eq16|3-16))) (patrz
((rh1-3-tab1|tablica 3-1))). Mamy $v_x = +30$ km/h, $v_{x0} = +45$ km/h,
$x-x_0 = +59$ m $= 0{,}05$ km. Z równania (((rh1-3-eq16|3-16))),
$v_x^2 = v_{x0}^2+2a_x(x-x_0)$ otrzymujemy

$$a_x = \frac{v_x^2-v_{x0}^2}{2(x-x_0)},$$

czyli

$$a_x = \frac{(30{,}0\ \mathrm{km/h})^2-(45{,}0\ \mathrm{km/h})^2}{2\cdot 0{,}05\ \mathrm{km}} = -1{,}13\cdot 10^4\ \mathrm{km/h^2}.$$

Przyspieszenie $\mathbf{a}$ jest skierowane dokładnie na zachód, tzn. w kierunku
ujemnym osi $x$, ponieważ $a_x$ jest ujemne; wobec tego samochód jadący na wschód
hamuje. Jeżeli prędkość jakiegoś ciała maleje, mówimy, że jego ruch jest
opóźniony.

(b) Jak długo jechał samochód ruchem opóźnionym?

Z ((rh1-3-tab1|tablicy 3-1)) widać, że jeśli chcemy skorzystać jedynie z danych
początkowych, musimy zastosować równanie (((rh1-3-eq14|3-14)))

$$x = x_0+\tfrac{1}{2}(v_{x0}+v_x)t;$$

otrzymujemy wtedy

$$t = \frac{2(x-x_0)}{v_{x0}+v_x},$$

czyli

$$t = \frac{2\cdot 0{,}05\ \mathrm{km}}{(45{,}0+30{,}0)\ \mathrm{km/h}} = \frac{1}{750}\mathrm{h} = 4{,}80\ \mathrm{s}.$$

Jeżeli chcielibyśmy skorzystać z danych zawartych w części (a), musielibyśmy
zastosować równanie (((rh1-3-eq12|3-12))). Otrzymane wyniki będziemy mogli
porównać ze sobą. Z równania (((rh1-3-eq12|3-12))), $v_x = v_{x0}+a_x t$, mamy

$$t = \frac{v_x-v_{x0}}{a_x},$$

czyli

$$t = \frac{(30{,}0-45{,}0)\ \mathrm{km/h}}{-1{,}13\cdot 10^4\ \mathrm{km/h}} = 1{,}33\cdot 10^{-3}\ \mathrm{h} = 4{,}80\ \mathrm{s}.$$

(c) Ile czasu upłynie do chwili zatrzymania samochodu, jeżeli założymy, że
hamuje on w dalszym ciągu z takim samym przyspieszeniem?

Skorzystamy z równania (((rh1-3-eq12|3-12))), które w tym wypadku jest
najwygodniejsze. Mamy $v_{x0} = 45$ km/h, $a_x = -1{,}13\cdot 10^4$ km/h²
i prędkość końcową $v_x = 0$. Z równania (((rh1-3-eq12|3-12))),
$v_x = v_{x0}+a_x t$, wyliczymy więc, że

$$t = \frac{v_x-v_{x0}}{a_x},$$

czyli

$$t = \frac{(0-45{,}0)\ \mathrm{km/h}}{-1{,}13\cdot 10^4\ \mathrm{km/h^2}} = 4{,}00\cdot 10^{-3}\ \mathrm{h} = 14{,}4\ \mathrm{s}.$$

(d) Jaką odległość przejedzie samochód do chwili zatrzymania? W tym przypadku
należy skorzystać z równania (((rh1-3-eq15|3-15))). Dane są: $v_{x0} = 45{,}0$
km/h, $a_x = -1{,}13\cdot 10^4$ km/h, $t = 4{,}00\cdot 10^{-3}$ h. Z równania
(((rh1-3-eq15|3-15))), $x = x_0+v_{x0}t+\tfrac{1}{2}a_x t^2$, otrzymujemy

$$x-x_0 = v_{x0}t+\tfrac{1}{2}a_x t^2 = 45{,}0\ \mathrm{km/h}\cdot(4{,}00\cdot 10^{-3}\ \mathrm{h})+\tfrac{1}{2}(-1{,}13\cdot 10^4\ \mathrm{km/h^2})\cdot(4{,}00\cdot 10^{-3}\mathrm{h})^2 = 0{,}09\ \mathrm{km} = 90\ \mathrm{m}.$$

**Przykład 7.** Jądro atomu helu (cząstka $\alpha$) porusza się wzdłuż linii
prostej wewnątrz pustej rury o długości 2 m, stanowiącej odcinek akceleratora.
(a) Jak długo cząstka będzie znajdowała się w rurze, przy założeniu, że porusza
się ona ze stałym przyspieszeniem, jeżeli jej prędkość na początku rury wynosi
$1\cdot 10^4$ m/s, a na końcu $5\cdot 10^6$ m/s. (b) Czemu równe jest
przyspieszenie cząstki?

(a) Przyjmujemy, że oś $x$ jest równoległa do rury, kierunek dodatni osi $x$
pokrywa się z kierunkiem ruchu cząstki, a początek osi pokrywa się z początkiem
rury. Znamy $x$ i $v_x$, a szukamy $t$. Przyspieszeniem $a_x$ nie interesujemy
się. Najwygodniej będzie więc skorzystać z równania (((rh1-3-eq14|3-14))),
$x = x_0+\tfrac{1}{2}(v_{x0}+v_x)t$, w którym $x_0 = 0$. Przekształcając to
równanie otrzymamy

$$t = \frac{2x}{v_{x0}+v_x},$$

czyli

$$t = \frac{2\cdot 2{,}0\ \mathrm{m}}{(500+1)\cdot 10^4\ \mathrm{m/s}} = 8\cdot 10^{-7}\ \mathrm{s} \qquad (\text{lub }0{,}8\ \mu\mathrm{s}).$$

(b) Przyspieszenie znajdujemy z równania (((rh1-3-eq12|3-12))),
$v_{x0}+a_x t = v_x$, skąd

$$a_x = \frac{v_x-v_{x0}}{t} = \frac{(500-1)\cdot 10^4\ \mathrm{m/s}}{8\cdot 10^{-7}\ \mathrm{s}} = +6{,}3\cdot 10^{12}\ \mathrm{m/s^2}$$

(czyli 6 trylionów m/s²). Jest to ogromne przyspieszenie, w porównaniu np.
z przyspieszeniem z poprzedniego zadania, ale występuje ono jedynie przez krótki
przeciąg czasu. Kierunek $\mathbf{a}$ jest taki, jak kierunek dodatni osi $x$,
tzn. taki, jak kierunek ruchu cząstki, ponieważ $a_x$ jest dodatnie.

## Uwagi redakcyjne

*Ta sekcja nie pochodzi z książki.*

- **Zakres 55–57**, zgodnie z rusztowaniem. Pierwszy raz w rozdziale 3 zakres
  ze spisu treści zgadza się bez poprawki.
- **Podrozdział bez jednego wzoru numerowanego.** Wszystkie 18 wzorów
  wyświetlonych to rachunki w przykładach albo sprawdzenia wymiarów — żaden nie
  ma numeru, więc żaden nie jest blokiem. Dokument nie wnosi do bazy ani jednego
  celu odsyłacza; wnosi **szesnaście odesłań** do (3-12), (3-14), (3-15), (3-16)
  i tablicy 3-1 — plus jedno do hasła — wszystkie w cel. To lustrzane odbicie
  3-8, które te cele postawiło.
- **Usterka druku, najpoważniejsza: treść Przykładu 6 nie zawiera prędkości
  końcowej.** Druk mówi „maleje jednostajnie od wartości 45 km/h, na odcinku
  równym 50 m", a rozwiązanie od razu podstawia $v_x = +30$ km/h — liczby, której
  w zadaniu nie ma. Zdanie zostaje tak, jak w druku.
- **Usterka druku: „$x-x_0 = +59$ m $= 0{,}05$ km".** 0,05 km to 50 m, tyle też
  mówi treść zadania; „+59 m" jest przestawieniem cyfr. Rachunek dalej używa
  0,05 km, więc wynik jest poprawny — myli się tylko zapis.
- **Usterka druku: dwa razy zgubiony kwadrat w jednostce przyspieszenia.**
  W części (b) mianownik ma „km/h" zamiast „km/h²", i tak samo w danych części
  (d). W tym samym przykładzie, w częściach (a) i (c), jednostka jest napisana
  poprawnie — czyli to nie konwencja autora, tylko skład.
- **„6 trylionów" to kalka.** $6{,}3\cdot 10^{12}$ to po polsku 6,3 **biliona**;
  „trylion" w polskiej skali długiej znaczy $10^{18}$. Angielskie *trillion* to
  $10^{12}$, więc liczba przeszła przez tłumaczenie bez przeliczenia. Zostaje.
- **Jedno nowe hasło: `rh1-poj-wymiar`.** Skorowidz daje dla tych stron dokładnie
  dwa wpisy — `wymiar 55, 56` i `Jednostki 14, 55`. Pierwszy trafia dokładnie
  tutaj: książka mówi wprost, czym jest wymiar wielkości fizycznej. Drugi **nie
  ma na tych stronach definicji** — s. 55 tylko *używa* słowa „jednostki",
  a definiuje je s. 14, z której hasła (`rh1-poj-jednostki-podstawowe-si`,
  `rh1-poj-uklad-si`) są w bazie od rozdziału 1. To ten sam przypadek, co osiem
  haseł skorowidza wskazujących s. 13.
- **Zero notek kontekstowych, mimo że pada słowo „akcelerator".** Przykład 7
  wspomina „odcinek akceleratora", ale skorowidz stawia urządzenie na s. 238
  (`Akcelerator van de Graaffa`) — tam jest miejsce na notkę, nie tutaj. Wzmianka
  w rachunku nie jest zaczepieniem.
- **Przecinek w mianowniku.** W druku przecinek kończący zdanie po wzorze
  $t = 2(x-x_0)/(v_{x0}+v_x)$ stoi **wewnątrz** ułamka, na linii mianownika.
  To skład, nie treść — w zapisie stoi po ułamku.
- **Wzór w Przykładzie 6(d) łamie się w druku na dwie linie**, z powtórzonym
  znakiem „=" na początku drugiej. Zapisany jest jednym ciągiem, bo powtórzony
  znak jest artefaktem łamania, a nie działaniem.
- **Przykłady 5, 6 i 7 są w druku petitem**, jak wszystkie przykłady rozwiązane
  w tomie. Przykład 5 zaczyna się na s. 55 i przechodzi na s. 56.
