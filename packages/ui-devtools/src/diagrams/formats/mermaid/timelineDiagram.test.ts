import { describe, it, expect } from 'vitest';
import { parseTimelineDiagram, serializeTimelineDiagram } from './timelineDiagram';
import type { Timeline } from '../../model/timeline';

const timelineOf = (text: string): Timeline => parseTimelineDiagram(text).document.timeline!;
const roundTrip = (text: string) => serializeTimelineDiagram(parseTimelineDiagram(text).document);

describe('timeline: okresy i wydarzenia', () => {
  it('okres z jednym wydarzeniem', () => {
    const t = timelineOf(['timeline', '    2002 : LinkedIn'].join('\n'));
    expect(t.sections[0].periods[0]).toEqual({ label: '2002', events: ['LinkedIn'] });
  });

  it('kolejne dwukropki to kolejne wydarzenia', () => {
    const t = timelineOf(['timeline', '    2004 : Facebook : Google : Flickr'].join('\n'));
    expect(t.sections[0].periods[0].events).toEqual(['Facebook', 'Google', 'Flickr']);
  });

  it('okres bez wydarzeń zostaje w modelu', () => {
    const t = timelineOf(['timeline', '    2002', '    2003 : coś'].join('\n'));
    expect(t.sections[0].periods[0]).toEqual({ label: '2002', events: [] });
    expect(t.sections[0].periods).toHaveLength(2);
  });

  it('linia zaczynająca się od dwukropka dokłada wydarzenia do poprzedniego okresu', () => {
    const t = timelineOf(['timeline', '    2021 : Koronawirus', '         : Zoom', '         : Teams'].join('\n'));
    expect(t.sections[0].periods).toHaveLength(1);
    expect(t.sections[0].periods[0].events).toEqual(['Koronawirus', 'Zoom', 'Teams']);
  });

  it('czyta tytuł', () => {
    expect(timelineOf(['timeline', '    title Dzieje sieci', '    2002 : LinkedIn'].join('\n')).title).toBe('Dzieje sieci');
  });
});

describe('timeline: sekcje', () => {
  it('grupuje okresy', () => {
    const t = timelineOf([
      'timeline',
      '    section Początki',
      '        2002 : LinkedIn',
      '        2004 : Facebook',
      '    section Rozkwit',
      '        2005 : YouTube',
    ].join('\n'));

    expect(t.sections.map((s) => s.label)).toEqual(['Początki', 'Rozkwit']);
    expect(t.sections[0].periods).toHaveLength(2);
    expect(t.sections[1].periods[0].label).toBe('2005');
  });

  it('okresy przed pierwszą sekcją trafiają do sekcji bez nazwy', () => {
    const t = timelineOf(['timeline', '    2002 : LinkedIn', '    section Dalej', '        2005 : YouTube'].join('\n'));
    expect(t.sections[0].label).toBeUndefined();
    expect(t.sections[0].periods[0].label).toBe('2002');
  });

  it('pusta sekcja zostaje', () => {
    const t = timelineOf(['timeline', '    section Pusta', '    section Druga', '        2005 : YouTube'].join('\n'));
    expect(t.sections.map((s) => s.label)).toEqual(['Pusta', 'Druga']);
    expect(t.sections[0].periods).toEqual([]);
  });
});

describe('timeline: zapis', () => {
  it('odtwarza dokument w tej samej postaci', () => {
    const source = [
      'timeline',
      '    title Dzieje sieci społecznościowych',
      '    section Początki',
      '        2002 : LinkedIn',
      '        2004 : Facebook : Google',
      '    section Rozkwit',
      '        2005 : YouTube',
      '        2006 : Twitter',
    ].join('\n');

    expect(roundTrip(source)).toBe(source);
  });

  it('drugi zapis niczego nie zmienia', () => {
    const once = roundTrip(['timeline', '    2021 : Koronawirus', '         : Zoom'].join('\n'));
    expect(roundTrip(once)).toBe(once);
  });

  it('kontynuacja z osobnej linii wraca jako jeden wiersz', () => {
    // Model nie pamięta, w ilu liniach zapisano wydarzenia — a jeden wiersz
    // znaczy dokładnie to samo i czyta się prościej.
    expect(roundTrip(['timeline', '    2021 : Koronawirus', '         : Zoom'].join('\n')))
      .toBe(['timeline', '    2021 : Koronawirus : Zoom'].join('\n'));
  });

  it('okres bez wydarzeń zapisuje samą etykietę', () => {
    expect(roundTrip(['timeline', '    2002'].join('\n'))).toBe(['timeline', '    2002'].join('\n'));
  });

  it('sekcja bez nazwy nie zapisuje nagłówka section', () => {
    const written = roundTrip(['timeline', '    2002 : A', '    section Dalej', '        2005 : B'].join('\n'));
    expect(written.indexOf('2002 : A')).toBeLessThan(written.indexOf('section Dalej'));
    expect(written).not.toMatch(/^\s*section\s*$/m);
  });
});

describe('timeline: linia, której nie rozumiemy', () => {
  it('wraca na swoje miejsce', () => {
    const written = roundTrip(['timeline', '    %% komentarz', '    2002 : LinkedIn'].join('\n'));
    expect(written).toContain('%% komentarz');
  });
});
