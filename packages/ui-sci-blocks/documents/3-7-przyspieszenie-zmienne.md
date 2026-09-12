---
title: Ruch jednowymiarowy. Przyspieszenie zmienne
tags: [resnick-halliday, ruch-jednowymiarowy]
book: Resnick & Halliday, Fizyka tom 1 (1998)
chapter: 3 RUCH JEDNOWYMIAROWY
section: 3-7
pages: 51-52
id: rh1-sec-3-7
status: przeniesiony
---
# 3-7. Ruch jednowymiarowy. Przyspieszenie zmienne

Na podstawie równań (((rh1-3-eq5|3-5))) i (((rh1-3-eq9|3-9))), dla ruchu
dwuwymiarowego, takiego jak pokazano na ((rh1-3-rys3|rys. 3-3)), możemy napisać

$$\mathbf{a} = \frac{\mathrm{d}\mathbf{v}}{\mathrm{d}t} = \mathbf{i}\frac{\mathrm{d}v_x}{\mathrm{d}t}+\mathbf{j}\frac{\mathrm{d}v_y}{\mathrm{d}t},$$

czyli

```formula:rh1-3-eq10
@relation
\mathbf{a} = \mathbf{i}a_x+\mathbf{j}a_y,
```

*(3-10)*

gdzie $a_x(= \mathrm{d}v_x/\mathrm{d}t)$ i $a_y(= \mathrm{d}v_y/\mathrm{d}t)$ są
skalarnymi składowymi wektora przyspieszenia $\mathbf{a}$ (patrz
((rh1-3-rys3|rys. 3-3c))).

Ograniczmy się znowu jedynie do ruchu jednowymiarowego, przyjmując dla wygody,
że odbywa się on wzdłuż osi $x$. Ponieważ $v_y$ dla takiego ruchu nie zmienia
się w czasie (jest równe zeru), $a_y(= \mathrm{d}v_y/\mathrm{d}t)$ musi także
być równe zeru, czyli

```formula:rh1-3-eq11
@relation
\mathbf{a} = \mathbf{i}a_x.
```

*(3-11)*

Ponieważ $\mathbf{i}$ ma kierunek dodatni osi $x$, więc $a_x$ jest dodatnie, gdy
$\mathbf{a}$ ma ten sam kierunek, a ujemne, gdy $\mathbf{a}$ ma kierunek
przeciwny niż $\mathbf{i}$.

**Przykład 3.** Na ((rh1-3-rys5|rysunku 3-5a)) pokazany jest ruch ze zmiennym
przyspieszeniem wzdłuż osi $x$. Aby znaleźć przyspieszenie $a_x$ \* w dowolnej
chwili czasu, musimy określić dla dowolnej chwili $\mathrm{d}v_x/\mathrm{d}t$.
Jest to po prostu nachylenie krzywej przedstawiającej zależności prędkości od
czasu w danej chwili. Nachylenie tej krzywej, jak widać na
((rh1-3-rys5|rys. 3-5c)), w punkcie $b$ wynosi $-1,3$ m/s², a w punkcie $d$
wynosi $-1,8$ m/s². Wykres przedstawiający szukane nachylenie krzywej dla
wszystkich chwil czasu podany jest na ((rh1-3-rys5|rys. 3-5d)). Zauważmy, że
$a_x$ jest ujemne w każdej chwili, co oznacza, że wektor przyspieszenia
$\mathbf{a}$ ma kierunek ujemny osi $x$. Dalej oznacza to, że $v_x$ ciągle
maleje z czasem, co widać jasno na ((rh1-3-rys5|rys. 3-5c)). Podany ruch jest
przykładem ruchu z przyspieszeniem stałym co do kierunku, lecz o zmiennej
wartości (patrz ((rh1-3-rys5|rys. 3-5a))).

> \* Podobnie jak w przypadku prędkości dla ruchu jednowymiarowego, $a_x$
>   nazywamy zwykle przyspieszeniem, mimo że naprawdę przyspieszenie jest
>   wektorem, a $a_x$ tylko jego składową. W ruchu jednowymiarowym, jeżeli jedna
>   z osi jest wybrana wzdłuż kierunku ruchu, istnieje tylko jedna różna od zera
>   składowa przyspieszenia.

## Uwagi redakcyjne

*Ta sekcja nie pochodzi z książki.*

- **Zakres zgadzał się z rusztowaniem** (51–52) — trzeci raz w tym rozdziale,
  po 3-1 i 3-3. Podrozdział kończy się w połowie s. 52, tuż przed nagłówkiem 3-8.
- **Pierwszy odsyłacz, który zamknął się wstecz.** Podpis rys. 3-3 w 3-5
  przywołuje równanie (3-10) — do dziś zwykłym tekstem, bo celu nie było.
  Teraz cel istnieje, więc odsyłacz w tamtym dokumencie został podpięty. To
  pierwszy raz w rozdziale 3, gdy dokument przeniesiony **wcześniej** trafił
  w blok przeniesiony **później**; dotąd zdarzało się to tylko w rozdziale 15.
- **Zero nowych haseł.** Skorowidz wiąże ze stronami 51–52 tylko `przyspieszenie
  → chwilowe` (wzięte w 3-6) i `ruch → jednowymiarowy` (wzięte w 3-5). Nowego
  słownictwa ten podrozdział nie wprowadza — jest przełożeniem wzorów z 3-5
  z prędkości na przyspieszenie.
- **Zero rysunków własnych.** Podrozdział korzysta z rys. 3-3 (z 3-5) i rys. 3-5
  (z 3-5); oba są już w bazie, więc wszystkie sześć odesłań trafia w cel.
- **(3-10) i (3-11) są `@relation`** — oba parser odrzuca jako przypisania, bo
  po lewej stronie stoi wektor złożony z wersorów. Sprawdzone przed
  zadeklarowaniem rodzaju, jak przy (3-4)…(3-6).
- **Wzór bez numeru zostaje zwykłym LaTeX-em** — krok pośredni
  (`a = dv/dt = i dv_x/dt + j dv_y/dt`) nie ma numeru na marginesie, więc nie ma
  z czego zrobić identyfikatora. Trzeci taki wzór w rozdziale.
- **Przypis jest wydrukowany daleko od swojego odnośnika.** Gwiazdka stoi
  w Przykładzie 3, czyli w połowie s. 52, a sam przypis — na dole tej samej
  strony, **pod całym otwarciem 3-8**. Łamanie rozdzieliło je o kilkanaście
  wierszy i o granicę podrozdziału. U nas przypis stoi tuż pod przykładem, bo
  3-8 jest osobnym dokumentem i nie ma go między co wstawić; to ta sama
  sytuacja, co rys. 15-21 (most Tacoma) wydrukowany dwie strony za swoim
  tekstem — **przypis należy do dokumentu, którego tekst go przywołuje**.
- **Przykład 3 jest w druku petitem**, jak wszystkie przykłady rozwiązane w tomie.
