/**
 * GanttEditor — rysunek harmonogramu plus panele edycji.
 *
 * Panel zadania rozkłada pozycję na to, czym ona naprawdę jest: znaczniki,
 * nazwa, początek i koniec — a początek i koniec mają **rodzaj**, nie tylko
 * wartość. Jedno pole tekstowe („2024-01-01" albo „after a1") wyglądałoby
 * prościej, ale wtedy nikt nie wie, co wolno wpisać, a literówka w `after`
 * cicho staje się datą.
 *
 * Ustawienia dokumentu (format dat, oś) siedzą w osobnym, domyślnie zwiniętym
 * panelu: zmienia się je raz, a zajmują tyle miejsca co pół wykresu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DiagramDocument } from '../model/diagram';
import { GANTT_TAGS, emptyGantt, taskCount, type GanttEnd, type GanttStart, type GanttTag } from '../model/gantt';
import { scheduleGantt, referenceableIds, placedCount } from '../model/ganttSchedule';
import { layoutGantt } from '../model/ganttLayout';
import { GanttView } from './GanttView';
import {
  addSection, updateSection, removeSection, moveSection,
  addTask, updateTask, toggleTag, removeTask, moveTask, moveTaskToSection, setGanttSetting,
} from '../model/ganttOps';

export interface GanttEditorProps {
  document: DiagramDocument;
  onChange: (next: DiagramDocument) => void;
  readOnly?: boolean;
  height?: number | string;
  /** Punkt odniesienia dla „dziś" i zadań bez daty — wstrzykiwany w testach. */
  today?: Date;
}

const btn: CSSProperties = {
  fontSize: 11, padding: '2px 6px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};
const input: CSSProperties = {
  fontSize: 11, padding: '2px 4px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', minWidth: 0, width: '100%', boxSizing: 'border-box',
};
const tagBtn = (active: boolean): CSSProperties => ({
  ...btn,
  fontWeight: active ? 700 : 400,
  color: active ? '#1e40af' : '#94a3b8',
  background: active ? '#dbeafe' : '#fff',
  borderColor: active ? '#2563eb' : '#cbd5e1',
});
const field = (basis: string): CSSProperties => ({ fontSize: 10, color: '#94a3b8', flex: `0 1 ${basis}` });

/** Szerokość kolumny z nazwami zadań — reszta panelu należy do osi czasu. */
const LABELS_WIDTH = 170;

const SETTINGS: Array<[Parameters<typeof setGanttSetting>[1], string, string]> = [
  ['title', 'tytuł', ''],
  ['dateFormat', 'format dat', 'YYYY-MM-DD'],
  ['axisFormat', 'format osi', '%m-%d'],
  ['tickInterval', 'podziałka', '1week'],
  ['excludes', 'pomijaj', 'weekends'],
  ['todayMarker', 'znacznik dziś', 'off'],
];

export function GanttEditor({ document: doc, onChange, readOnly, height = 520, today }: GanttEditorProps) {
  const chart = doc.gantt ?? emptyGantt();
  const [selected, setSelected] = useState<{ section: number; task?: number } | undefined>();
  const [showSettings, setShowSettings] = useState(false);
  const emit = useCallback((next: DiagramDocument) => onChange(next), [onChange]);

  // Pas czasu zajmuje tyle, ile zostaje po nazwach. Stała szerokość chowałaby
  // koniec harmonogramu za krawędzią panelu — a to właśnie tam wypada termin.
  const paneRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(LABELS_WIDTH * 3);
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const measure = () => setChartWidth(Math.max(320, pane.clientWidth - LABELS_WIDTH - 24));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  const schedule = useMemo(() => scheduleGantt(chart, { today }), [chart, today]);
  const layout = useMemo(
    () => layoutGantt(schedule, { today: today ?? new Date(), labelWidth: LABELS_WIDTH, chartWidth }),
    [schedule, today, chartWidth],
  );
  const ids = useMemo(() => referenceableIds(chart), [chart]);

  const task = selected?.task !== undefined ? chart.sections[selected.section]?.tasks[selected.task] : undefined;
  const patch = (change: Parameters<typeof updateTask>[3]) =>
    emit(updateTask(doc, selected!.section, selected!.task!, change));

  /** Zmiana rodzaju początku zachowuje to, co da się zachować. */
  const setStartKind = (kind: 'none' | 'date' | 'after') => {
    if (kind === 'none') return patch({ start: undefined });
    if (kind === 'date') return patch({ start: { kind: 'date', value: task?.start?.kind === 'date' ? task.start.value : '' } });
    return patch({ start: { kind: 'after', ids: task?.start?.kind === 'after' ? task.start.ids : [] } });
  };
  const setEndKind = (kind: 'duration' | 'date' | 'until') => {
    if (kind === 'duration') return patch({ end: { kind: 'duration', value: task?.end?.kind === 'duration' ? task.end.value : '1d' } });
    if (kind === 'date') return patch({ end: { kind: 'date', value: task?.end?.kind === 'date' ? task.end.value : '' } });
    return patch({ end: { kind: 'until', ids: task?.end?.kind === 'until' ? task.end.ids : [] } });
  };

  const nieUlozone = schedule.tasks.length - placedCount(schedule);

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 6, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button type="button" style={btn} onClick={() => emit(addSection(doc, 'Nowa sekcja', selected?.section))}>
            + Sekcja
          </button>
          <button
            type="button"
            style={btn}
            disabled={!chart.sections.length}
            onClick={() => emit(addTask(doc, selected?.section ?? 0, 'Nowe zadanie', selected?.task))}
            title={chart.sections.length ? 'Dodaj zadanie w zaznaczonej sekcji' : 'Najpierw dodaj sekcję'}
          >
            + Zadanie
          </button>
          <button
            type="button"
            style={showSettings ? { ...btn, background: '#dbeafe', borderColor: '#2563eb', color: '#1e40af' } : btn}
            onClick={() => setShowSettings((v) => !v)}
          >
            Ustawienia
          </button>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            sekcji: {chart.sections.length} · zadań: {taskCount(chart)}
            {nieUlozone > 0 && <span style={{ color: '#b91c1c' }}> · bez miejsca na osi: {nieUlozone}</span>}
          </span>
        </div>
      )}

      {!readOnly && showSettings && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8, borderBottom: '1px solid #e2e8f0', background: '#f1f5f9' }}>
          {SETTINGS.map(([key, label, placeholder]) => (
            <label key={key} style={field('130px')}>
              {label}
              <input
                style={input}
                value={chart[key] ?? ''}
                placeholder={placeholder}
                onChange={(e) => emit(setGanttSetting(doc, key, e.target.value))}
              />
            </label>
          ))}
        </div>
      )}

      <div ref={paneRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 8 }}>
        <GanttView
          layout={layout}
          selected={selected?.task !== undefined ? { section: selected.section, task: selected.task } : undefined}
          onSelect={(where) => setSelected({ section: where.section, task: where.task })}
          onSelectSection={(section) => setSelected({ section })}
        />
      </div>

      {/* Panel sekcji — widoczny, gdy zaznaczono nagłówek, a nie zadanie. */}
      {!readOnly && selected && selected.task === undefined && chart.sections[selected.section] && (
        <div style={{ borderTop: '1px solid #e2e8f0', padding: 8, display: 'flex', gap: 8, alignItems: 'center', background: '#f8fafc' }}>
          <label style={field('220px')}>
            nazwa sekcji
            <input
              style={input}
              value={chart.sections[selected.section].label ?? ''}
              onChange={(e) => emit(updateSection(doc, selected.section, e.target.value))}
            />
          </label>
          <button type="button" style={btn} title="Sekcja wyżej" disabled={selected.section === 0}
            onClick={() => { emit(moveSection(doc, selected.section, selected.section - 1)); setSelected({ section: selected.section - 1 }); }}>↑</button>
          <button type="button" style={btn} title="Sekcja niżej" disabled={selected.section === chart.sections.length - 1}
            onClick={() => { emit(moveSection(doc, selected.section, selected.section + 1)); setSelected({ section: selected.section + 1 }); }}>↓</button>
          <button type="button" style={btn} title="Usuń sekcję razem z zadaniami"
            onClick={() => { emit(removeSection(doc, selected.section)); setSelected(undefined); }}>×</button>
        </div>
      )}

      {!readOnly && task && selected?.task !== undefined && (
        <div style={{ borderTop: '1px solid #e2e8f0', padding: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', background: '#f8fafc' }}>
          <label style={field('160px')}>
            nazwa
            <input style={input} value={task.label} onChange={(e) => patch({ label: e.target.value })} />
          </label>
          <label style={field('90px')}>
            nazwa (id)
            <input
              style={input}
              value={task.id ?? ''}
              placeholder="np. a1"
              title="Potrzebna tylko wtedy, gdy inne zadanie ma się do tego odwołać"
              onChange={(e) => patch({ id: e.target.value || undefined })}
            />
          </label>

          <div style={{ display: 'flex', gap: 3 }}>
            {GANTT_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                style={tagBtn(task.tags.includes(tag))}
                onClick={() => emit(toggleTag(doc, selected.section, selected.task!, tag as GanttTag))}
              >
                {tag}
              </button>
            ))}
          </div>

          <label style={field('90px')}>
            początek
            <select
              style={input}
              value={task.start?.kind ?? 'none'}
              onChange={(e) => setStartKind(e.target.value as 'none' | 'date' | 'after')}
            >
              <option value="none">po poprzednim</option>
              <option value="date">data</option>
              <option value="after">po zadaniu</option>
            </select>
          </label>
          {task.start?.kind === 'date' && (
            <label style={field('110px')}>
              data
              <input
                style={input}
                value={task.start.value}
                placeholder={chart.dateFormat ?? 'YYYY-MM-DD'}
                onChange={(e) => patch({ start: { kind: 'date', value: e.target.value } as GanttStart })}
              />
            </label>
          )}
          {task.start?.kind === 'after' && (
            <label style={field('130px')}>
              po zadaniach {ids.length ? `(${ids.join(', ')})` : ''}
              <input
                style={input}
                value={task.start.ids.join(' ')}
                placeholder="a1 a2"
                onChange={(e) => patch({ start: { kind: 'after', ids: e.target.value.split(/\s+/).filter(Boolean) } as GanttStart })}
              />
            </label>
          )}

          <label style={field('90px')}>
            koniec
            <select
              style={input}
              value={task.end?.kind ?? 'duration'}
              onChange={(e) => setEndKind(e.target.value as 'duration' | 'date' | 'until')}
            >
              <option value="duration">czas trwania</option>
              <option value="date">data</option>
              <option value="until">aż ruszy</option>
            </select>
          </label>
          {(task.end?.kind === 'duration' || task.end?.kind === 'date') && (
            <label style={field('100px')}>
              {task.end.kind === 'duration' ? 'ile' : 'data'}
              <input
                style={input}
                value={task.end.value}
                placeholder={task.end.kind === 'duration' ? '5d' : chart.dateFormat ?? 'YYYY-MM-DD'}
                onChange={(e) => patch({ end: { kind: task.end!.kind, value: e.target.value } as GanttEnd })}
              />
            </label>
          )}
          {task.end?.kind === 'until' && (
            <label style={field('130px')}>
              aż ruszy
              <input
                style={input}
                value={task.end.ids.join(' ')}
                placeholder="b1"
                onChange={(e) => patch({ end: { kind: 'until', ids: e.target.value.split(/\s+/).filter(Boolean) } as GanttEnd })}
              />
            </label>
          )}

          <div style={{ display: 'flex', gap: 3 }}>
            <button type="button" style={btn} title="Do sekcji wyżej" disabled={selected.section === 0}
              onClick={() => {
                emit(moveTaskToSection(doc, selected.section, selected.task!, selected.section - 1));
                setSelected({ section: selected.section - 1, task: chart.sections[selected.section - 1].tasks.length });
              }}>↖ sekcja</button>
            <button type="button" style={btn} title="Do sekcji niżej" disabled={selected.section === chart.sections.length - 1}
              onClick={() => {
                emit(moveTaskToSection(doc, selected.section, selected.task!, selected.section + 1));
                setSelected({ section: selected.section + 1, task: chart.sections[selected.section + 1].tasks.length });
              }}>sekcja ↘</button>
            <button type="button" style={btn} title="Wyżej" disabled={selected.task === 0}
              onClick={() => { emit(moveTask(doc, selected.section, selected.task!, selected.task! - 1)); setSelected({ section: selected.section, task: selected.task! - 1 }); }}>↑</button>
            <button type="button" style={btn} title="Niżej"
              disabled={selected.task === chart.sections[selected.section].tasks.length - 1}
              onClick={() => { emit(moveTask(doc, selected.section, selected.task!, selected.task! + 1)); setSelected({ section: selected.section, task: selected.task! + 1 }); }}>↓</button>
            <button type="button" style={btn} title="Usuń zadanie"
              onClick={() => { emit(removeTask(doc, selected.section, selected.task!)); setSelected({ section: selected.section }); }}>×</button>
          </div>

          {/* Powód, dla którego zadanie nie trafiło na oś — przy samym zadaniu,
              nie w rogu ekranu. */}
          {schedule.tasks.find((e) => e.sectionIndex === selected.section && e.taskIndex === selected.task)?.issue && (
            <div style={{ flex: '1 1 100%', fontSize: 11, color: '#b91c1c' }}>
              {schedule.tasks.find((e) => e.sectionIndex === selected.section && e.taskIndex === selected.task)!.issue}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
