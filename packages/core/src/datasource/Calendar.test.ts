import { describe, it, expect } from 'vitest';
import { Calendar } from './Calendar';
import { CalendarItem } from './CalendarItem';
import type { EventModel } from '../models/EventModel';

const evt = (name: string): EventModel => ({
  type: 'event',
  name,
  startTime: '10:00',
});

describe('CalendarItem', () => {
  it('derives date parts (1-based month)', () => {
    const item = new CalendarItem(new Date('2024-03-15T00:00:00Z'));
    expect(item.getYear()).toBe(2024);
    expect(item.getMonth()).toBe(3);
    expect(item.getDateString()).toBe('2024-03-15');
  });

  it('starts with no events and appends them', () => {
    const item = new CalendarItem(new Date('2024-01-01T00:00:00Z'));
    expect(item.getEvents()).toEqual([]);
    item.addEvent(evt('a'));
    item.addEvent(evt('b'));
    expect(item.getEvents().map((e) => e.name)).toEqual(['a', 'b']);
  });

  it('removes an event by index', () => {
    const item = new CalendarItem(new Date('2024-01-01T00:00:00Z'), [evt('a'), evt('b')]);
    item.removeEvent(0);
    expect(item.getEvents().map((e) => e.name)).toEqual(['b']);
  });

  it('setEvents replaces the list', () => {
    const item = new CalendarItem(new Date('2024-01-01T00:00:00Z'), [evt('a')]);
    item.setEvents([evt('x'), evt('y')]);
    expect(item.getEvents()).toHaveLength(2);
  });
});

describe('Calendar', () => {
  const dateKey = (s: string) => new Date(`${s}T00:00:00Z`);

  it('adds and retrieves items keyed by date string', () => {
    const cal = new Calendar();
    const item = new CalendarItem(dateKey('2024-05-10'), [evt('m')]);
    cal.addItem(item);
    expect(cal.size()).toBe(1);
    expect(cal.getItemByDateString('2024-05-10')).toBe(item);
    expect(cal.getItem(dateKey('2024-05-10'))).toBe(item);
  });

  it('returns undefined for missing dates', () => {
    const cal = new Calendar();
    expect(cal.getItem(dateKey('2020-01-01'))).toBeUndefined();
  });

  it('removes items by date', () => {
    const cal = new Calendar();
    cal.addItem(new CalendarItem(dateKey('2024-05-10')));
    cal.removeItem(dateKey('2024-05-10'));
    expect(cal.size()).toBe(0);
  });

  it('filters items by month and year', () => {
    const cal = new Calendar();
    cal.addItem(new CalendarItem(dateKey('2024-05-10')));
    cal.addItem(new CalendarItem(dateKey('2024-05-20')));
    cal.addItem(new CalendarItem(dateKey('2024-06-01')));
    cal.addItem(new CalendarItem(dateKey('2023-05-15')));
    expect(cal.getItemsForMonth(2024, 5)).toHaveLength(2);
    expect(cal.getItemsForYear(2024)).toHaveLength(3);
  });

  it('filters items within an inclusive date range', () => {
    const cal = new Calendar();
    cal.addItem(new CalendarItem(dateKey('2024-01-01')));
    cal.addItem(new CalendarItem(dateKey('2024-02-01')));
    cal.addItem(new CalendarItem(dateKey('2024-03-01')));
    const inRange = cal.getItemsInRange(dateKey('2024-01-15'), dateKey('2024-02-15'));
    expect(inRange).toHaveLength(1);
    expect(inRange[0].getDateString()).toBe('2024-02-01');
  });

  it('aggregates all events across items', () => {
    const cal = new Calendar();
    cal.addItem(new CalendarItem(dateKey('2024-01-01'), [evt('a'), evt('b')]));
    cal.addItem(new CalendarItem(dateKey('2024-01-02'), [evt('c')]));
    expect(cal.getAllEvents().map((e) => e.name).sort()).toEqual(['a', 'b', 'c']);
  });

  it('clear empties the calendar', () => {
    const cal = new Calendar();
    cal.addItem(new CalendarItem(dateKey('2024-01-01')));
    cal.clear();
    expect(cal.size()).toBe(0);
    expect(cal.getItems()).toEqual([]);
  });
});
