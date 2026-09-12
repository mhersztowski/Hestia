---
title: Gaz w pudle
tags: [termodynamika, statystyka, symulacje]
requires: [Rzut ukośny z oporem powietrza]
---

# Gaz w pudle

Rozkład prędkości cząsteczek gazu wyprowadza się zwykle z rachunku
prawdopodobieństwa. Można inaczej: wpuścić kilkaset kulek do pudła, kazać im się
zderzać sprężyście — i patrzeć, co się samo wyłoni.

## Dlaczego nie graf wzorów

Poprzednie dokumenty opisywały zjawisko układem równań w blokach `formula`.
Tutaj to nie zadziała: zderzenie dwóch cząstek nie jest ciągłą pochodną, tylko
zdarzeniem zależnym od **par** obiektów, których liczba rośnie z kwadratem.
Raport nazywa to granicą automatyzacji — i tu właśnie zaczyna się druga ścieżka:
model napisany wprost, w TypeScripcie, w samym dokumencie.

Kontrakt jest ten sam co dla modeli z grafu, więc suwaki, wykresy i animacja
działają bez żadnej różnicy.

## Model

Zderzenia sprężyste równych mas w dwóch wymiarach sprowadzają się do wymiany
składowych prędkości wzdłuż linii środków. Ściany odbijają, zmieniając znak
odpowiedniej składowej.

```simscript:gaz
interface Czastka {
  x: number; y: number;
  vx: number; vy: number;
}

/** Zderzenie sprężyste równych mas: wymiana składowych wzdłuż linii środków. */
const zderz = (a: Czastka, b: Czastka, r: number): void => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 === 0 || d2 > (2 * r) ** 2) return;

  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;

  // Prędkość względna wzdłuż normalnej; ujemna znaczy, że się zbliżają.
  const wzgledna = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (wzgledna > 0) return;

  a.vx += wzgledna * nx;
  a.vy += wzgledna * ny;
  b.vx -= wzgledna * nx;
  b.vy -= wzgledna * ny;

  // Rozsunięcie, żeby w następnym kroku nie zderzyły się ponownie.
  const zachodzenie = 2 * r - d;
  if (zachodzenie > 0) {
    a.x -= (nx * zachodzenie) / 2;
    a.y -= (ny * zachodzenie) / 2;
    b.x += (nx * zachodzenie) / 2;
    b.y += (ny * zachodzenie) / 2;
  }
};

return defineModel({
  parameters: [
    { name: 'N', unit: '1', value: 200, min: 20, max: 600, step: 10 },
    { name: 'v0', unit: 'm/s', value: 1, min: 0.2, max: 3, step: 0.1 },
    { name: 'L', unit: 'm', value: 10, min: 4, max: 20, step: 1 },
    { name: 'seed', unit: '1', value: 7, min: 1, max: 50, step: 1 },
  ],
  observables: [
    { name: 'x1', kind: 'series', unit: 'm' },
    { name: 'y1', kind: 'series', unit: 'm' },
    { name: 'E', kind: 'series', unit: 'J' },
    { name: 'v_srednia', kind: 'scalar', unit: 'm/s' },
    { name: 'v_rms', kind: 'scalar', unit: 'm/s' },
    { name: 'ksztalt', kind: 'scalar', unit: '1' },
  ],
  run: (values: Record<string, number>, tSpan: [number, number]) => {
    const N = Math.round(values.N);
    const L = values.L;
    const r = 0.12;
    const los = random(Math.round(values.seed));

    // Start: wszystkie cząstki mają TĘ SAMĄ prędkość co do wartości, tylko
    // różne kierunki. Rozkład prędkości pojawi się wyłącznie ze zderzeń.
    const czastki: Czastka[] = [];
    for (let i = 0; i < N; i += 1) {
      const kat = los() * 2 * Math.PI;
      czastki.push({
        x: r + los() * (L - 2 * r),
        y: r + los() * (L - 2 * r),
        vx: values.v0 * Math.cos(kat),
        vy: values.v0 * Math.sin(kat),
      });
    }

    const x1: Array<[number, number]> = [];
    const y1: Array<[number, number]> = [];
    const E: Array<[number, number]> = [];

    // Krok wynika z przedziału, a nie odwrotnie. Host podaje `dt` dobrane pod
    // solvery ODE (bardzo drobne); użycie go wprost przy stałym limicie kroków
    // znaczyłoby, że symulacja pokrywa ułamek zadanego czasu i gaz nie zdąży
    // się ztermalizować — a wtedy dokument obiecuje coś, czego nie widać.
    const kroki = 4000;
    const h = (tSpan[1] - tSpan[0]) / kroki;

    for (let krok = 0; krok < kroki; krok += 1) {
      const t = tSpan[0] + krok * h;

      for (const c of czastki) {
        c.x += c.vx * h;
        c.y += c.vy * h;
        if (c.x < r) { c.x = r; c.vx = Math.abs(c.vx); }
        if (c.x > L - r) { c.x = L - r; c.vx = -Math.abs(c.vx); }
        if (c.y < r) { c.y = r; c.vy = Math.abs(c.vy); }
        if (c.y > L - r) { c.y = L - r; c.vy = -Math.abs(c.vy); }
      }

      // Pary sprawdzamy wprost — przy kilkuset cząstkach to wystarcza, a
      // siatka przestrzenna zaciemniłaby to, co ten dokument pokazuje.
      for (let i = 0; i < czastki.length; i += 1) {
        for (let j = i + 1; j < czastki.length; j += 1) zderz(czastki[i], czastki[j], r);
      }

      let energia = 0;
      for (const c of czastki) energia += 0.5 * (c.vx * c.vx + c.vy * c.vy);

      x1.push([t, czastki[0].x]);
      y1.push([t, czastki[0].y]);
      E.push([t, energia]);
    }

    // Rozkład prędkości na końcu symulacji.
    //
    // Miarą kształtu jest stosunek prędkości średniej kwadratowej do średniej.
    // Wybrany świadomie zamiast „najczęstszej prędkości": moda z histogramu
    // przy kilkuset cząstkach skacze o kilkadziesiąt procent między ziarnami,
    // a ten stosunek jest bezwymiarowy, uśredniony po wszystkich cząstkach i
    // ma ostrą wartość teoretyczną.
    const predkosci = czastki.map((c) => Math.hypot(c.vx, c.vy));
    const srednia = predkosci.reduce((s, v) => s + v, 0) / predkosci.length;
    const rms = Math.sqrt(predkosci.reduce((s, v) => s + v * v, 0) / predkosci.length);

    return {
      series: { x1, y1, E },
      scalars: { v_srednia: srednia, v_rms: rms, ksztalt: rms / srednia },
    };
  },
});
```

## Co widać

Energia całkowita (`E`) jest stała — zderzenia sprężyste jej nie zabierają, więc
to najprostszy sprawdzian poprawności modelu. Tor jednej cząstki (`x1`, `y1`)
wygląda jak błądzenie przypadkowe, choć każde pojedyncze zderzenie jest w pełni
deterministyczne.

Najciekawsze jest to, czego nie zaprogramowano. Wszystkie cząstki startują z
**identyczną** wartością prędkości — różnią się tylko kierunkiem. Gdyby
zderzenia niczego nie zmieniały, wszystkie prędkości pozostałyby równe, a
wskaźnik `ksztalt` (stosunek prędkości średniej kwadratowej do średniej) wynosiłby
dokładnie 1.

Po kilku sekundach `ksztalt` ustala się w okolicy **1,128**. To nie jest
przypadkowa liczba: dla dwuwymiarowego rozkładu Maxwella–Boltzmanna wynosi ona
√(4/π) ≈ 1,1284. Nikt tego rozkładu tu nie wpisał — wyłania się wyłącznie ze
zderzeń, i to jest cała treść tego dokumentu.

Energia całkowita przez cały czas zostaje stała, więc gaz nie „stygnie" ani się
nie rozgrzewa. Zmienia się tylko **podział** tej samej energii między cząstki:
z rozkładu skupionego w jednym punkcie w asymetryczny, z ogonem w stronę dużych
prędkości.
