---
title: Układ Słoneczny i pętle planet
tags: [astronomia, efemerydy, symulacje]
requires: [Orbita keplerowska]
---

# Układ Słoneczny i pętle planet

Poprzedni dokument liczył orbitę z równań ruchu. Tutaj idziemy inaczej:
korzystamy z **efemeryd** — tablicowych elementów keplerowskich, które opisują,
gdzie planeta naprawdę jest w danym dniu. To ten sam kod, który liczy pozycje w
programach astronomicznych, przeniesiony z Drive do biblioteki.

## Skąd biorą się pętle

Mars co dwa lata zatrzymuje się na niebie, cofa przez kilka tygodni i rusza
dalej. Starożytni budowali dla tego epicykle. Wyjaśnienie jest prostsze: Ziemia
krąży szybciej i co jakiś czas **wyprzedza** Marsa — wtedy z naszego punktu
widzenia cofa się on na tle gwiazd.

Poniższy model rysuje orbity obu planet i pokazuje jednocześnie, jak zmienia się
długość ekliptyczna Marsa widziana z Ziemi.

```simscript:uklad
/** Ile dni od J2000 odpowiada zadanej liczbie lat. */
const DZIEN = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12);

return defineModel({
  parameters: [
    { name: 'lata', unit: '1', value: 4, min: 1, max: 15, step: 1 },
    { name: 'start', unit: '1', value: 0, min: 0, max: 20, step: 1 },
  ],
  observables: [
    { name: 'x_Mars', kind: 'series', unit: 'm' },
    { name: 'y_Mars', kind: 'series', unit: 'm' },
    { name: 'x_Ziemia', kind: 'series', unit: 'm' },
    { name: 'y_Ziemia', kind: 'series', unit: 'm' },
    { name: 'dlugosc_Marsa', kind: 'series', unit: 'deg' },
    { name: 'odleglosc_Marsa', kind: 'series', unit: 'm' },
    { name: 'cofniec', kind: 'scalar', unit: '1' },
  ],
  run: (values: Record<string, number>) => {
    const dni = Math.round(values.lata * 365.25);
    const offset = Math.round(values.start * 365.25);
    const krok = Math.max(1, Math.round(dni / 900));

    const xM: Array<[number, number]> = [];
    const yM: Array<[number, number]> = [];
    const xZ: Array<[number, number]> = [];
    const yZ: Array<[number, number]> = [];
    const dlugosc: Array<[number, number]> = [];
    const odleglosc: Array<[number, number]> = [];

    let poprzedniaDlugosc: number | undefined;
    let cofniec = 0;

    for (let dzien = 0; dzien <= dni; dzien += krok) {
      const data = new Date(J2000 + (offset + dzien) * DZIEN);
      const mars = heliocentric('Mars', data);
      const ziemia = heliocentric('Earth', data);
      if (!mars || !ziemia) continue;

      const t = dzien / 365.25;
      xM.push([t, mars.x]);
      yM.push([t, mars.y]);
      xZ.push([t, ziemia.x]);
      yZ.push([t, ziemia.y]);

      const lambda = geocentricLongitude('Mars', data) ?? 0;
      dlugosc.push([t, lambda]);
      odleglosc.push([t, distanceFromEarth('Mars', data) ?? 0]);

      if (poprzedniaDlugosc !== undefined) {
        let delta = lambda - poprzedniaDlugosc;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        if (delta < 0) cofniec += 1;
      }
      poprzedniaDlugosc = lambda;
    }

    return {
      series: {
        x_Mars: xM, y_Mars: yM,
        x_Ziemia: xZ, y_Ziemia: yZ,
        dlugosc_Marsa: dlugosc,
        odleglosc_Marsa: odleglosc,
      },
      scalars: { cofniec },
    };
  },
});
```

## Co widać

Na wykresie długości ekliptycznej `dlugosc_Marsa` widać zygzaki — to właśnie
pętle. Licznik `cofniec` mówi, ile próbek przypadło na ruch wsteczny; przy
czterech latach wypada kilkadziesiąt, bo opozycje Marsa zdarzają się mniej
więcej co 780 dni.

Przebieg `odleglosc_Marsa` tłumaczy przy okazji, dlaczego Mars raz świeci jak
najjaśniejsza gwiazda, a innym razem ledwie go widać: odległość zmienia się
kilkukrotnie między opozycją a koniunkcją.
