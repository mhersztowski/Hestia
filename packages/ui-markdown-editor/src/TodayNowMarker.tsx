/**
 * "Now" marker for Markdown notes that are today's daily journal.
 *
 * Rendered by MdEditor when the file path matches `…/{yyyy}/{mm}/{dd}.md`
 * AND that date is today. Scans the document for embedded `<my-event-block>`
 * wrappers (EventBlockExtension exposes `data-start` / `data-end` on its
 * NodeView), then floats a horizontal "Teraz: HH:MM" bar:
 *
 *   - Above the first not-yet-started event (when nothing is in progress)
 *   - Between the last finished event and the next upcoming one (gap mode)
 *   - Directly on the in-progress event (highlights it with a side bar)
 *
 * The bar also shows the most useful piece of context: time until the next
 * event, or time remaining in the current one. Refreshes every 30 seconds.
 *
 * Positioning is absolute over the editor's content area — we measure the
 * relevant event block's bounding rect at render time. No DOM mutation, so
 * the marker can't desync with ProseMirror's view.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

export interface TodayNowMarkerProps {
  /** Container around the TipTap editor — the marker positions itself
   *  absolutely inside this element. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Trigger re-measure when content changes (TipTap re-renders, user edits).
   *  MdEditor passes a counter; any change invalidates positions. */
  layoutTick: number;
}

interface EventInfo {
  /** The DOM wrapper of the event block. */
  el: HTMLElement;
  /** Datetime-local strings (`YYYY-MM-DDTHH:mm`) → epoch ms. */
  startMs: number;
  /** End time; equals startMs when the event has no explicit end. */
  endMs: number;
  /** From `data-event-name` if present, else "(bez nazwy)". */
  name: string;
}

/** Parse `YYYY-MM-DDTHH:mm` (the format EventDialog writes). Returns NaN on
 *  garbage so the caller can filter. */
function parseLocalDateTime(raw: string | undefined | null): number {
  if (!raw) return NaN;
  // `new Date('2026-06-07T14:30')` is parsed as local time in modern browsers
  // when no timezone suffix is present — exactly what we want for "today's
  // journal" since the user thinks in their local clock.
  const d = new Date(raw);
  return d.getTime();
}

/** Format ms-from-now into a short Polish label ("za 28 min", "5 min temu"). */
function relativeLabel(diffMs: number): string {
  const past = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60_000);
  if (mins === 0) return 'teraz';
  if (mins < 60) return past ? `${mins} min temu` : `za ${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  const stem = remMins === 0 ? `${hours}h` : `${hours}h ${remMins}min`;
  return past ? `${stem} temu` : `za ${stem}`;
}

/** Read `data-start` / `data-end` / `data-event-name` from each event-block
 *  wrapper. Returns events with valid timestamps only, sorted by start time. */
function readEventBlocks(container: HTMLElement | null): EventInfo[] {
  if (!container) return [];
  const nodes = container.querySelectorAll<HTMLElement>('[data-event-block]');
  const events: EventInfo[] = [];
  for (const el of Array.from(nodes)) {
    const startStr = el.getAttribute('data-start');
    if (!startStr) continue;
    const startMs = parseLocalDateTime(decodeURIComponent(startStr));
    if (!Number.isFinite(startMs)) continue;
    const endStr = el.getAttribute('data-end');
    const endMs = endStr
      ? parseLocalDateTime(decodeURIComponent(endStr))
      : NaN;
    const nameAttr = el.getAttribute('data-event-name');
    const name = nameAttr ? decodeURIComponent(nameAttr) : '';
    events.push({
      el,
      startMs,
      endMs: Number.isFinite(endMs) ? endMs : startMs,
      name: name || '(bez nazwy)',
    });
  }
  events.sort((a, b) => a.startMs - b.startMs);
  return events;
}

const TodayNowMarker: React.FC<TodayNowMarkerProps> = ({ containerRef, layoutTick }) => {
  const [now, setNow] = useState(() => Date.now());
  // The container the marker is absolutely-positioned over. We capture once
  // (it's owned by the parent) but re-measure on every tick.
  const measureRef = useRef<HTMLDivElement | null>(null);

  // Drive a 30-second refresh — fine-grained enough that the marker stays
  // accurate without burning render cycles.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /** Decide where the marker lives. Re-runs on every render (cheap — pure
   *  function of `now` + DOM read). The DOM read is intentional: TipTap can
   *  re-render event blocks asynchronously, and we want the marker to track
   *  the latest layout without subscribing to ProseMirror internals. */
  const placement = useMemo(() => {
    const events = readEventBlocks(containerRef.current);
    if (events.length === 0) {
      // No events at all — anchor at the top of the editor with a generic
      // "Teraz: HH:MM" reminder. Useful so the user knows the marker is alive
      // before they add any events.
      return { kind: 'top' as const, top: 0, label: 'teraz', highlightEl: null };
    }
    const inProgress = events.find(e => now >= e.startMs && now < e.endMs);
    if (inProgress) {
      // Mid-event: anchor directly on it; the marker draws a side bar to
      // make it obvious which event is "live".
      const remMs = inProgress.endMs - now;
      return {
        kind: 'inside' as const,
        top: inProgress.el.offsetTop,
        bottom: inProgress.el.offsetTop + inProgress.el.offsetHeight,
        label: remMs > 0
          ? `${inProgress.name} — kończy się ${relativeLabel(remMs)}`
          : `${inProgress.name} — trwa`,
        highlightEl: inProgress.el,
      };
    }
    const next = events.find(e => e.startMs > now);
    const lastPast = [...events].reverse().find(e => e.endMs <= now);

    if (next && lastPast) {
      // Between past and future event — float bar in the gap so visually it
      // sits where "now" is on the timeline.
      const gapTop = lastPast.el.offsetTop + lastPast.el.offsetHeight;
      const gapBottom = next.el.offsetTop;
      const midpoint = Math.round((gapTop + gapBottom) / 2);
      return {
        kind: 'between' as const,
        top: midpoint,
        label: `${next.name} — ${relativeLabel(next.startMs - now)}`,
        highlightEl: null,
      };
    }
    if (next) {
      // Day hasn't started yet — float above the first event.
      return {
        kind: 'before' as const,
        top: next.el.offsetTop - 16,
        label: `${next.name} — ${relativeLabel(next.startMs - now)}`,
        highlightEl: null,
      };
    }
    if (lastPast) {
      // All events are done — float below the last one.
      return {
        kind: 'after' as const,
        top: lastPast.el.offsetTop + lastPast.el.offsetHeight + 8,
        label: 'koniec dnia',
        highlightEl: null,
      };
    }
    return { kind: 'top' as const, top: 0, label: 'teraz', highlightEl: null };
    // `layoutTick` deliberately included so the memo re-evaluates when the
    // parent signals "content changed, re-measure".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, layoutTick, containerRef]);

  const timeStr = new Date(now).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Box
      ref={measureRef}
      sx={{
        position: 'absolute',
        top: placement.top,
        left: 0,
        right: 0,
        pointerEvents: 'none',
        zIndex: 2,
        // Smooth re-position when content changes (typing pushes events down).
        transition: 'top 200ms ease',
      }}
    >
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: 2,
        background: 'linear-gradient(to right, transparent, rgba(244, 67, 54, 0.85) 20%, rgba(244, 67, 54, 0.85) 80%, transparent)',
        position: 'relative',
      }}>
        {/* Time chip pinned to the left edge so it doesn't jump as the bar
            redraws. Pointer events on the chip so user can click/hover even
            though the bar itself ignores pointer events. */}
        <Chip
          size="small"
          icon={<AccessTimeIcon sx={{ fontSize: 14 }} />}
          label={timeStr}
          sx={{
            pointerEvents: 'auto',
            position: 'absolute',
            top: -12,
            left: 8,
            height: 22,
            fontSize: '0.7rem',
            fontWeight: 600,
            bgcolor: '#f44336',
            color: 'white',
            '& .MuiChip-icon': { color: 'white' },
          }}
        />
        {/* Context label — what's happening / next. Sits on the right of the
            bar in a subtle pill so it doesn't fight the timestamp. */}
        {placement.label && placement.label !== 'teraz' && (
          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              top: -10,
              right: 8,
              px: 1,
              bgcolor: 'background.paper',
              borderRadius: '10px',
              border: '1px solid',
              borderColor: 'divider',
              fontSize: '0.7rem',
              color: 'text.secondary',
              pointerEvents: 'auto',
              maxWidth: '60%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {placement.label}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default TodayNowMarker;
