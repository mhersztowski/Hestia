import { EventModel } from '../models/EventModel';

export class CalendarItem {
  private date: Date;
  private events: EventModel[] = [];

  constructor(date: Date, events: EventModel[] = []) {
    this.date = date;
    this.events = events;
  }

  getDate(): Date {
    return this.date;
  }

  getDateString(): string {
    return this.date.toISOString().split('T')[0];
  }

  getYear(): number {
    return this.date.getFullYear();
  }

  getMonth(): number {
    return this.date.getMonth() + 1;
  }

  getDay(): number {
    return this.date.getDate();
  }

  getEvents(): EventModel[] {
    return this.events;
  }

  setEvents(events: EventModel[]): void {
    this.events = events;
  }

  addEvent(event: EventModel): void {
    this.events.push(event);
  }

  removeEvent(index: number): void {
    this.events.splice(index, 1);
  }
}
