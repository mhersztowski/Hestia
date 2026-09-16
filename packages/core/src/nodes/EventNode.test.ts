import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { EventNode } from './EventNode';
import type { EventModel } from '../models/EventModel';

const make = (o?: Partial<EventModel>): EventModel => ({
  type: 'event',
  name: 'Meeting',
  startTime: '2024-01-15T10:30:00',
  ...o,
});

describe('EventNode', () => {
  it('round-trips via toModel', () => {
    const m = make({ taskId: 't1', description: 'd', endTime: '2024-01-15T12:00:00' });
    expect(new EventNode(m).toModel()).toEqual(m);
  });

  it('parses start/end dates', () => {
    const e = new EventNode(make({ endTime: '2024-01-15T12:00:00' }));
    expect(e.getStartDate()?.format('YYYY-MM-DD HH:mm')).toBe('2024-01-15 10:30');
    expect(e.getEndDate()?.format('HH:mm')).toBe('12:00');
    expect(e.getStartDateNative()).toBeInstanceOf(Date);
    expect(e.getEndDateNative()).toBeInstanceOf(Date);
  });

  it('exposes native null when no end time', () => {
    const e = new EventNode(make());
    expect(e.getEndDate()).toBeNull();
    expect(e.getEndDateNative()).toBeNull();
  });

  describe('task relationship', () => {
    it('hasTask reflects taskId', () => {
      expect(new EventNode(make({ taskId: 't' })).hasTask()).toBe(true);
      expect(new EventNode(make()).hasTask()).toBe(false);
    });
    it('setTaskRef exposes name', () => {
      const e = new EventNode(make());
      e.setTaskRef({ id: 't', name: 'Task' });
      expect(e.getTaskName()).toBe('Task');
    });
  });

  describe('time helpers', () => {
    it('getTimeRange with start and end', () => {
      const e = new EventNode(make({ endTime: '2024-01-15T12:00:00' }));
      expect(e.getTimeRange()).toBe('10:30 - 12:00');
    });
    it('getTimeRange with only start', () => {
      expect(new EventNode(make()).getTimeRange()).toBe('10:30');
    });
    it('getDuration and formatting', () => {
      const e = new EventNode(make({ endTime: '2024-01-15T12:00:00' }));
      expect(e.getDuration()).toBe(90);
      expect(e.getDurationFormatted()).toBe('1h 30m');
    });
    it('getDuration is null without an end', () => {
      expect(new EventNode(make()).getDuration()).toBeNull();
      expect(new EventNode(make()).getDurationFormatted()).toBeNull();
    });
    it('formats sub-hour durations', () => {
      const e = new EventNode(
        make({ startTime: '2024-01-15T10:00:00', endTime: '2024-01-15T10:45:00' })
      );
      expect(e.getDurationFormatted()).toBe('45m');
    });
    it('hasEndTime reflects end time', () => {
      expect(new EventNode(make({ endTime: '2024-01-15T12:00:00' })).hasEndTime()).toBe(true);
      expect(new EventNode(make()).hasEndTime()).toBe(false);
    });
  });

  it('isAllDay detects midnight start/end', () => {
    const allDay = new EventNode(make({ startTime: '2024-01-15T00:00:00' }));
    expect(allDay.isAllDay()).toBe(true);
    const timed = new EventNode(make());
    expect(timed.isAllDay()).toBe(false);
  });

  describe('past/future/now', () => {
    it('isPast for an old date', () => {
      const e = new EventNode(make({ startTime: '2000-01-01T10:00:00' }));
      expect(e.isPast()).toBe(true);
      expect(e.isFuture()).toBe(false);
    });
    it('isFuture for a far date', () => {
      const e = new EventNode(make({ startTime: '2999-01-01T10:00:00' }));
      expect(e.isFuture()).toBe(true);
      expect(e.isPast()).toBe(false);
    });
    it('isNow when now is within the range', () => {
      const start = dayjs().subtract(30, 'minute').format('YYYY-MM-DDTHH:mm:ss');
      const end = dayjs().add(30, 'minute').format('YYYY-MM-DDTHH:mm:ss');
      const e = new EventNode(make({ startTime: start, endTime: end }));
      expect(e.isNow()).toBe(true);
    });
  });

  describe('date comparisons', () => {
    it('isSameDay / isToday', () => {
      const e = new EventNode(make());
      expect(e.isSameDay(dayjs('2024-01-15'))).toBe(true);
      expect(e.isSameDay(new Date('2024-06-01'))).toBe(false);
      const today = new EventNode(make({ startTime: dayjs().format('YYYY-MM-DDTHH:mm:ss') }));
      expect(today.isToday()).toBe(true);
    });
    it('getDateFormatted / getDateTimeFormatted', () => {
      const e = new EventNode(make());
      expect(e.getDateFormatted()).toBe('2024-01-15');
      expect(e.getDateTimeFormatted()).toBe('2024-01-15 10:30');
    });
    it('getRelativeTime returns a string', () => {
      const e = new EventNode(
        make({ startTime: dayjs().add(2, 'hour').format('YYYY-MM-DDTHH:mm:ss') })
      );
      expect(e.getRelativeTime()).toContain('in');
    });
  });

  it('matches across fields', () => {
    const e = new EventNode(make({ description: 'weekly sync', taskId: 'task-5' }));
    expect(e.matches('MEETING')).toBe(true);
    expect(e.matches('weekly')).toBe(true);
    expect(e.matches('task-5')).toBe(true);
    expect(e.matches('nope')).toBe(false);
  });

  it('updateFrom re-parses dates and marks dirty', () => {
    const e = new EventNode(make());
    e.updateFrom(make({ startTime: '2025-05-05T09:00:00' }));
    expect(e.getDateFormatted()).toBe('2025-05-05');
    expect(e.isDirty).toBe(true);
  });

  it('setTimes updates parsed dates', () => {
    const e = new EventNode(make());
    e.setTimes('2026-06-06T08:00:00', '2026-06-06T09:30:00');
    expect(e.getDuration()).toBe(90);
  });

  describe('sorting', () => {
    it('compareTo orders by start time', () => {
      const a = new EventNode(make({ startTime: '2024-01-15T09:00:00' }));
      const b = new EventNode(make({ startTime: '2024-01-15T11:00:00' }));
      expect(a.compareTo(b)).toBeLessThan(0);
      expect(b.compareTo(a)).toBeGreaterThan(0);
    });
    it('sortByTime returns a sorted copy', () => {
      const a = new EventNode(make({ name: 'A', startTime: '2024-01-15T11:00:00' }));
      const b = new EventNode(make({ name: 'B', startTime: '2024-01-15T09:00:00' }));
      const sorted = EventNode.sortByTime([a, b]);
      expect(sorted.map((e) => e.name)).toEqual(['B', 'A']);
    });

    /**
     * On a day's list what counts is the time of the occurrence, not the date
     * of the rule's first occurrence: a repeating event from months ago,
     * compared by absolute date, beat everything freshly added, so a new entry
     * landed at the end of the list whatever the hour.
     */
    it("sortByTimeOn orders one day's occurrences by time of day", () => {
      const repeating = new EventNode(
        make({
          name: 'Repeating 14:00',
          startTime: '2024-01-15T14:00:00',
          endTime: '2024-01-15T15:00:00',
          recurrence: { freq: 'daily' },
        })
      );
      const fresh = new EventNode(
        make({
          name: 'Fresh 08:00',
          startTime: '2024-03-20T08:00:00',
          endTime: '2024-03-20T09:00:00',
        })
      );

      const day = dayjs('2024-03-20T00:00:00');
      expect(EventNode.sortByTime([repeating, fresh]).map((e) => e.name)).toEqual([
        'Repeating 14:00',
        'Fresh 08:00',
      ]);
      expect(EventNode.sortByTimeOn([repeating, fresh], day).map((e) => e.name)).toEqual([
        'Fresh 08:00',
        'Repeating 14:00',
      ]);
    });

    it('sortByTimeOn leaves entries with an unreadable start date at the end', () => {
      const undated = new EventNode(make({ name: 'Undated', startTime: 'not-a-date' }));
      const dated = new EventNode(make({ name: 'Dated', startTime: '2024-03-20T23:00:00' }));
      const sorted = EventNode.sortByTimeOn([undated, dated], dayjs('2024-03-20T00:00:00'));
      expect(sorted.map((e) => e.name)).toEqual(['Dated', 'Undated']);
    });
  });

  it('clone preserves task ref and base state', () => {
    const e = new EventNode(make());
    e.setTaskRef({ id: 't', name: 'T' }).setSelected(true);
    const c = e.clone();
    expect(c.getTaskName()).toBe('T');
    expect(c.isSelected).toBe(true);
  });
});
