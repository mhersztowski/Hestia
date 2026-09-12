/**
 * TimelineEditor — oś wydarzeń: okresy wzdłuż linii, wydarzenia pod nimi.
 *
 * HTML, nie SVG ani React Flow. Wydarzenie to zdanie, które musi się zawijać, a
 * okresów bywa dużo — układ w poziomie z przewijaniem robi to sam. W SVG
 * trzeba by liczyć łamanie wierszy ręcznie, a to jedyna trudna rzecz na tym
 * rysunku.
 *
 * Linia czasu jest jedna dla całej osi, a sekcje siedzą **nad** nią jako pasy
 * obejmujące swoje okresy — dzięki temu widać, że sekcja to grupa okresów, a
 * nie osobna oś.
 */
import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DiagramDocument } from '../model/diagram';
import { emptyTimeline, eventCount, periodCount } from '../model/timeline';
import {
  addTimelineSection, updateTimelineSection, removeTimelineSection, moveTimelineSection,
  addPeriod, updatePeriod, removePeriod, movePeriod, movePeriodToSection,
  addEvent, updateEvent, removeEvent, moveEvent, setTimelineTitle,
} from '../model/timelineOps';

export interface TimelineEditorProps {
  document: DiagramDocument;
  onChange: (next: DiagramDocument) => void;
  readOnly?: boolean;
  height?: number | string;
}

const btn: CSSProperties = {
  fontSize: 11, padding: '2px 6px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};
const input: CSSProperties = {
  fontSize: 11, padding: '2px 4px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', minWidth: 0, width: '100%', boxSizing: 'border-box',
};
const field = (basis: string): CSSProperties => ({ fontSize: 10, color: '#94a3b8', flex: `0 1 ${basis}` });

/** Barwy sekcji — kolejne grupy różnią się odcieniem, jak w Mermaidzie. */
const SECTION_COLORS = ['#dbeafe', '#dcfce7', '#fef3c7', '#fae8ff', '#ffe4e6', '#e0e7ff'];

const PERIOD_WIDTH = 140;

type Where = { section: number; period?: number; event?: number };

export function TimelineEditor({ document: doc, onChange, readOnly, height = 520 }: TimelineEditorProps) {
  const timeline = doc.timeline ?? emptyTimeline();
  const [selected, setSelected] = useState<Where | undefined>();
  const emit = useCallback((next: DiagramDocument) => onChange(next), [onChange]);

  const section = selected ? timeline.sections[selected.section] : undefined;
  const period = selected?.period !== undefined ? section?.periods[selected.period] : undefined;

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 6, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button type="button" style={btn} onClick={() => emit(addTimelineSection(doc, 'Nowa sekcja', selected?.section))}>
            + Sekcja
          </button>
          <button
            type="button"
            style={btn}
            onClick={() => emit(addPeriod(doc, selected?.section ?? 0, 'Nowy okres', selected?.period))}
            title="Dodaj okres w zaznaczonej sekcji"
          >
            + Okres
          </button>
          <button
            type="button"
            style={btn}
            disabled={selected?.period === undefined}
            onClick={() => emit(addEvent(doc, selected!.section, selected!.period!, 'Nowe wydarzenie', selected!.event))}
            title={selected?.period === undefined ? 'Zaznacz okres' : 'Dodaj wydarzenie w zaznaczonym okresie'}
          >
            + Wydarzenie
          </button>
          <label style={{ ...field('180px'), display: 'flex', alignItems: 'center', gap: 4 }}>
            tytuł
            <input
              style={input}
              value={timeline.title ?? ''}
              placeholder="bez tytułu"
              onChange={(e) => emit(setTimelineTitle(doc, e.target.value))}
            />
          </label>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            sekcji: {timeline.sections.length} · okresów: {periodCount(timeline)} · wydarzeń: {eventCount(timeline)}
          </span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 8px' }}>
        {timeline.title && (
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 10, textAlign: 'center' }}>
            {timeline.title}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {timeline.sections.map((section, sectionIndex) => {
            const color = SECTION_COLORS[sectionIndex % SECTION_COLORS.length];
            const aktywnaSekcja = selected?.section === sectionIndex && selected.period === undefined;
            return (
              <div
                key={sectionIndex}
                onClick={() => setSelected({ section: sectionIndex })}
                style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto' }}
              >
                {/* Sekcja bez nazwy nie dostaje paska — nie ma czego podpisać. */}
                {section.label !== undefined && (
                  <div
                    style={{
                      background: color,
                      border: `1px solid ${aktywnaSekcja ? '#2563eb' : 'transparent'}`,
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#334155',
                      textAlign: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    {section.label}
                  </div>
                )}

                {/* Zero odstępu między okresami: linia czasu biegnie przez całą
                    sekcję, a oddech dają marginesy wewnątrz kolumny. */}
                <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
                  {section.periods.map((period, periodIndex) => {
                    const aktywnyOkres = selected?.section === sectionIndex
                      && selected.period === periodIndex && selected.event === undefined;
                    return (
                      <div
                        key={periodIndex}
                        onClick={(e) => { e.stopPropagation(); setSelected({ section: sectionIndex, period: periodIndex }); }}
                        style={{ width: PERIOD_WIDTH, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, cursor: 'pointer' }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#0f172a',
                            padding: '2px 6px',
                            margin: '0 3px',
                            borderRadius: 4,
                            textAlign: 'center',
                            border: `1px solid ${aktywnyOkres ? '#2563eb' : '#e2e8f0'}`,
                            background: aktywnyOkres ? '#dbeafe' : '#fff',
                          }}
                        >
                          {period.label}
                        </div>

                        {/* Kropka na linii czasu — ten sam poziom w każdej
                            kolumnie, więc linia czyta się jako jedna oś. */}
                        <div style={{ position: 'relative', width: '100%', height: 12 }}>
                          <div style={{ position: 'absolute', top: 5, left: 0, right: 0, height: 2, background: '#cbd5e1' }} />
                          <div style={{
                            position: 'absolute', top: 2, left: '50%', marginLeft: -4,
                            width: 8, height: 8, borderRadius: '50%', background: '#64748b',
                          }} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '0 3px' }}>
                          {period.events.map((event, eventIndex) => {
                            const aktywne = selected?.section === sectionIndex
                              && selected.period === periodIndex && selected.event === eventIndex;
                            return (
                              <div
                                key={eventIndex}
                                onClick={(e) => { e.stopPropagation(); setSelected({ section: sectionIndex, period: periodIndex, event: eventIndex }); }}
                                style={{
                                  background: color,
                                  border: `1px solid ${aktywne ? '#2563eb' : '#e2e8f0'}`,
                                  borderRadius: 4,
                                  padding: '4px 6px',
                                  fontSize: 11,
                                  color: '#0f172a',
                                }}
                              >
                                {event}
                              </div>
                            );
                          })}
                          {period.events.length === 0 && (
                            <div style={{ fontSize: 10, color: '#cbd5e1', textAlign: 'center' }}>bez wydarzeń</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {section.periods.length === 0 && (
                    <div style={{ width: PERIOD_WIDTH, fontSize: 10, color: '#cbd5e1', textAlign: 'center' }}>
                      sekcja bez okresów
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {timeline.sections.length === 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Oś bez okresów — dodaj pierwszy.</div>
          )}
        </div>
      </div>

      {/* Jeden panel u dołu, zależny od tego, co zaznaczono: wydarzenie, okres
          albo sekcja. Trzy osobne panele pokazywałyby to samo trzy razy. */}
      {!readOnly && selected && section && (
        <div style={{ borderTop: '1px solid #e2e8f0', padding: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', background: '#f8fafc' }}>
          {selected.event !== undefined && period ? (
            <>
              <label style={field('260px')}>
                wydarzenie
                <input
                  style={input}
                  value={period.events[selected.event] ?? ''}
                  onChange={(e) => emit(updateEvent(doc, selected.section, selected.period!, selected.event!, e.target.value))}
                />
              </label>
              <div style={{ display: 'flex', gap: 3 }}>
                <button type="button" style={btn} title="Wcześniej" disabled={selected.event === 0}
                  onClick={() => { emit(moveEvent(doc, selected.section, selected.period!, selected.event!, selected.event! - 1)); setSelected({ ...selected, event: selected.event! - 1 }); }}>←</button>
                <button type="button" style={btn} title="Później" disabled={selected.event === period.events.length - 1}
                  onClick={() => { emit(moveEvent(doc, selected.section, selected.period!, selected.event!, selected.event! + 1)); setSelected({ ...selected, event: selected.event! + 1 }); }}>→</button>
                <button type="button" style={btn} title="Usuń wydarzenie"
                  onClick={() => { emit(removeEvent(doc, selected.section, selected.period!, selected.event!)); setSelected({ section: selected.section, period: selected.period }); }}>×</button>
              </div>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                Dwukropek rozdziela wydarzenia — w treści go nie zapiszesz.
              </span>
            </>
          ) : selected.period !== undefined && period ? (
            <>
              <label style={field('180px')}>
                okres
                <input
                  style={input}
                  value={period.label}
                  onChange={(e) => emit(updatePeriod(doc, selected.section, selected.period!, e.target.value))}
                />
              </label>
              <div style={{ display: 'flex', gap: 3 }}>
                <button type="button" style={btn} title="Do sekcji w lewo" disabled={selected.section === 0}
                  onClick={() => {
                    const target = selected.section - 1;
                    const index = timeline.sections[target].periods.length;
                    emit(movePeriodToSection(doc, selected.section, selected.period!, target));
                    setSelected({ section: target, period: index });
                  }}>← sekcja</button>
                <button type="button" style={btn} title="Do sekcji w prawo" disabled={selected.section === timeline.sections.length - 1}
                  onClick={() => {
                    const target = selected.section + 1;
                    const index = timeline.sections[target].periods.length;
                    emit(movePeriodToSection(doc, selected.section, selected.period!, target));
                    setSelected({ section: target, period: index });
                  }}>sekcja →</button>
                <button type="button" style={btn} title="Wcześniej" disabled={selected.period === 0}
                  onClick={() => { emit(movePeriod(doc, selected.section, selected.period!, selected.period! - 1)); setSelected({ section: selected.section, period: selected.period! - 1 }); }}>←</button>
                <button type="button" style={btn} title="Później" disabled={selected.period === section.periods.length - 1}
                  onClick={() => { emit(movePeriod(doc, selected.section, selected.period!, selected.period! + 1)); setSelected({ section: selected.section, period: selected.period! + 1 }); }}>→</button>
                <button type="button" style={btn} title="Usuń okres razem z wydarzeniami"
                  onClick={() => { emit(removePeriod(doc, selected.section, selected.period!)); setSelected({ section: selected.section }); }}>×</button>
              </div>
            </>
          ) : (
            <>
              <label style={field('180px')}>
                nazwa sekcji
                <input
                  style={input}
                  value={section.label ?? ''}
                  placeholder="sekcja bez nazwy"
                  onChange={(e) => emit(updateTimelineSection(doc, selected.section, e.target.value))}
                />
              </label>
              <div style={{ display: 'flex', gap: 3 }}>
                <button type="button" style={btn} title="Sekcja w lewo" disabled={selected.section === 0}
                  onClick={() => { emit(moveTimelineSection(doc, selected.section, selected.section - 1)); setSelected({ section: selected.section - 1 }); }}>←</button>
                <button type="button" style={btn} title="Sekcja w prawo" disabled={selected.section === timeline.sections.length - 1}
                  onClick={() => { emit(moveTimelineSection(doc, selected.section, selected.section + 1)); setSelected({ section: selected.section + 1 }); }}>→</button>
                <button type="button" style={btn} title="Usuń sekcję razem z okresami"
                  onClick={() => { emit(removeTimelineSection(doc, selected.section)); setSelected(undefined); }}>×</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
