import { CalendarItem } from './CalendarItem';
import { EventModel } from '../models/EventModel';

export class Calendar<T extends CalendarItem = CalendarItem> {
  private items: Map<string, T> = new Map();

  getItems(): T[] {
    return Array.from(this.items.values());
  }

  getItem(date: Date): T | undefined {
    const key = this.dateToKey(date);
    return this.items.get(key);
  }

  getItemByDateString(dateString: string): T | undefined {
    return this.items.get(dateString);
  }

  addItem(item: T): void {
    const key = item.getDateString();
    this.items.set(key, item);
  }

  removeItem(date: Date): void {
    const key = this.dateToKey(date);
    this.items.delete(key);
  }

  getItemsForMonth(year: number, month: number): T[] {
    return this.getItems().filter(
      item => item.getYear() === year && item.getMonth() === month
    );
  }

  getItemsForYear(year: number): T[] {
    return this.getItems().filter(item => item.getYear() === year);
  }

  getItemsInRange(startDate: Date, endDate: Date): T[] {
    return this.getItems().filter(item => {
      const date = item.getDate();
      return date >= startDate && date <= endDate;
    });
  }

  getAllEvents(): EventModel[] {
    const events: EventModel[] = [];
    for (const item of this.items.values()) {
      events.push(...item.getEvents());
    }
    return events;
  }

  clear(): void {
    this.items.clear();
  }

  size(): number {
    return this.items.size;
  }

  private dateToKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
