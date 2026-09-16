import dayjs, { Dayjs } from 'dayjs';
import { NodeBase } from './NodeBase';
import { EventModel, EventComponentModel, RecurrenceModel } from '../models/EventModel';

// Forward reference type for task
type TaskNodeRef = { id: string; name: string } | null;

/**
 * EventNode extends EventModel with UI state, relationships, and utility functions
 * Uses dayjs for all date/time operations
 */
export class EventNode extends NodeBase<EventModel> {
  readonly type = 'event' as const;
  taskId?: string;
  name: string;
  description?: string;
  startTime: string;
  endTime?: string;
  components?: EventComponentModel[];
  recurrence?: RecurrenceModel;
  /** Dates (YYYY-MM-DD) of cancelled occurrences. */
  exceptions?: string[];

  // Task reference
  private _taskRef: TaskNodeRef = null;

  // Parsed dates cache (using dayjs)
  private _startDate: Dayjs | null = null;
  private _endDate: Dayjs | null = null;

  constructor(model: EventModel) {
    super();
    this.taskId = model.taskId;
    this.name = model.name;
    this.description = model.description;
    this.startTime = model.startTime;
    this.endTime = model.endTime;
    this.components = model.components;
    this.recurrence = model.recurrence;
    this.exceptions = model.exceptions ? [...model.exceptions] : undefined;
    this.parseDates();
  }

  static fromModel(model: EventModel): EventNode {
    return new EventNode(model);
  }
  static fromModels(models: EventModel[]): EventNode[] {
    return models.map((m) => new EventNode(m));
  }

  // Parse date strings to Dayjs objects
  private parseDates(): void {
    // An unreadable date notation means "no date". `dayjs('anything')` does not
    // throw, it returns an Invalid Date, and that goes on being computed with
    // silently: every comparison against it yields NaN, so sorting arranges the
    // list any which way.
    this._startDate = this.parseValidOrNull(this.startTime);
    if (this.endTime) this._endDate = this.parseValidOrNull(this.endTime);
  }

  private parseValidOrNull(timeStr: string): Dayjs | null {
    try {
      const parsed = this.parseTimeString(timeStr);
      return parsed.isValid() ? parsed : null;
    } catch {
      return null;
    }
  }

  // Parse time string (supports HH:mm, HH:mm:ss, or ISO)
  private parseTimeString(timeStr: string): Dayjs {
    // If it's a full ISO string or date
    if (timeStr.includes('T') || timeStr.includes('-')) {
      return dayjs(timeStr);
    }

    // If it's just time (HH:mm or HH:mm:ss)
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    return dayjs()
      .hour(hours || 0)
      .minute(minutes || 0)
      .second(seconds || 0)
      .millisecond(0);
  }

  // Task reference
  get taskRef(): TaskNodeRef {
    return this._taskRef;
  }

  setTaskRef(ref: TaskNodeRef): this {
    this._taskRef = ref;
    return this;
  }

  // Display name
  getDisplayName(): string {
    return this.name;
  }

  // Get parsed start date (as Dayjs)
  getStartDate(): Dayjs | null {
    return this._startDate;
  }

  // Get parsed end date (as Dayjs)
  getEndDate(): Dayjs | null {
    return this._endDate;
  }

  // Get start date as native Date (for compatibility)
  getStartDateNative(): Date | null {
    return this._startDate?.toDate() ?? null;
  }

  // Get end date as native Date (for compatibility)
  getEndDateNative(): Date | null {
    return this._endDate?.toDate() ?? null;
  }

  // Check if event has task
  hasTask(): boolean {
    return !!this.taskId;
  }

  // Get task name if available
  getTaskName(): string | null {
    return this._taskRef?.name ?? null;
  }

  // Check if event has end time
  hasEndTime(): boolean {
    return !!this.endTime;
  }

  // Check if this is an all-day event (no specific time)
  isAllDay(): boolean {
    // Consider all-day if times are at midnight or not set properly
    if (!this._startDate) return false;
    const isStartMidnight = this._startDate.hour() === 0 && this._startDate.minute() === 0;
    const isEndMidnight =
      !this._endDate || (this._endDate.hour() === 0 && this._endDate.minute() === 0);
    return isStartMidnight && isEndMidnight;
  }

  // Get time range as formatted string
  getTimeRange(): string {
    if (!this._startDate) return this.startTime;

    const start = this._startDate.format('HH:mm');
    if (this._endDate) {
      return `${start} - ${this._endDate.format('HH:mm')}`;
    }
    return start;
  }

  // Get duration in minutes
  getDuration(): number | null {
    if (!this._startDate || !this._endDate) return null;
    return this._endDate.diff(this._startDate, 'minute');
  }

  // Get duration formatted
  getDurationFormatted(): string | null {
    const duration = this.getDuration();
    if (duration === null) return null;

    if (duration < 60) {
      return `${duration}m`;
    } else {
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
  }

  // Check if event is currently happening
  isNow(): boolean {
    if (!this._startDate) return false;
    const now = dayjs();

    if (this._endDate) {
      return (
        (now.isAfter(this._startDate) && now.isBefore(this._endDate)) ||
        now.isSame(this._startDate) ||
        now.isSame(this._endDate)
      );
    }

    // If no end time, consider "now" if within an hour of start
    const hourAfterStart = this._startDate.add(1, 'hour');
    return (
      (now.isAfter(this._startDate) || now.isSame(this._startDate)) && now.isBefore(hourAfterStart)
    );
  }

  // Check if event is in the past
  isPast(): boolean {
    const endDate = this._endDate || this._startDate;
    if (!endDate) return false;
    return dayjs().isAfter(endDate);
  }

  // Check if event is in the future
  isFuture(): boolean {
    if (!this._startDate) return false;
    return dayjs().isBefore(this._startDate);
  }

  // Check if event has components
  hasComponents(): boolean {
    return !!this.components && this.components.length > 0;
  }

  // Get component by type
  getComponentByType<T extends EventComponentModel>(type: string): T | undefined {
    return this.components?.find((c) => c.type === type) as T | undefined;
  }

  // Search helper
  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(lowerQuery) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false) ||
      (this.taskId?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  // Update from model
  updateFrom(model: EventModel): this {
    this.taskId = model.taskId;
    this.name = model.name;
    this.description = model.description;
    this.startTime = model.startTime;
    this.endTime = model.endTime;
    this.components = model.components;
    this.recurrence = model.recurrence;
    this.exceptions = model.exceptions ? [...model.exceptions] : undefined;
    this.parseDates();
    this.markDirty();
    return this;
  }

  // Set times and update parsed dates
  setTimes(startTime: string, endTime?: string): this {
    this.startTime = startTime;
    this.endTime = endTime;
    this.parseDates();
    this.markDirty();
    return this;
  }

  // Check if event is on the same day as given date
  isSameDay(date: Dayjs | Date): boolean {
    if (!this._startDate) return false;
    const compareDate = dayjs(date);
    return this._startDate.isSame(compareDate, 'day');
  }

  /**
   * Whether the event occurs on a given day (honouring the repetition rule).
   * Without `recurrence` — only on the start day. Never before the start day.
   */
  occursOn(date: Dayjs | Date): boolean {
    if (!this._startDate) return false;
    const target = dayjs(date).startOf('day');
    const start = this._startDate.startOf('day');
    if (!this.recurrence) return start.isSame(target, 'day');
    if (target.isBefore(start)) return false;

    const rec = this.recurrence;
    if (rec.until) {
      const until = dayjs(rec.until).startOf('day');
      if (until.isValid() && target.isAfter(until)) return false;
    }
    const interval = Math.max(1, Math.floor(rec.interval ?? 1));

    switch (rec.freq) {
      case 'daily':
        return target.diff(start, 'day') % interval === 0;
      case 'weekly':
        if (target.day() !== start.day()) return false;
        return (target.diff(start, 'day') / 7) % interval === 0;
      case 'monthly':
        if (target.date() !== start.date()) return false;
        return target.diff(start, 'month') % interval === 0;
      case 'yearly':
        return (
          target.date() === start.date() &&
          target.month() === start.month() &&
          (target.year() - start.year()) % interval === 0
        );
      case 'weekdays': {
        const wd = rec.weekdays && rec.weekdays.length ? rec.weekdays : [start.day()];
        return wd.includes(target.day());
      }
      default:
        return start.isSame(target, 'day');
    }
  }

  /** The day key (YYYY-MM-DD) on the list of cancelled occurrences. */
  private dayKey(date: Dayjs | Date): string {
    return dayjs(date).format('YYYY-MM-DD');
  }

  /** Whether the occurrence on a given day was cancelled (it is not removed from the calendar — it is greyed out). */
  isCancelledOn(date: Dayjs | Date): boolean {
    return !!this.exceptions?.includes(this.dayKey(date));
  }

  /** Cancel the occurrence on a given day (for repeating events). */
  cancelOccurrence(date: Dayjs | Date): this {
    const key = this.dayKey(date);
    if (!this.exceptions) this.exceptions = [];
    if (!this.exceptions.includes(key)) {
      this.exceptions.push(key);
      this.markDirty();
    }
    return this;
  }

  /** Restore a previously cancelled occurrence. */
  restoreOccurrence(date: Dayjs | Date): this {
    const key = this.dayKey(date);
    if (this.exceptions?.includes(key)) {
      this.exceptions = this.exceptions.filter((d) => d !== key);
      this.markDirty();
    }
    return this;
  }

  /** Event start with the time of day from the model, but on `date` (for repeated occurrences). */
  getStartOn(date: Dayjs | Date): Dayjs | null {
    if (!this._startDate) return null;
    const d = dayjs(date);
    return d
      .hour(this._startDate.hour())
      .minute(this._startDate.minute())
      .second(this._startDate.second())
      .millisecond(0);
  }

  /** Event end moved to the day `date` (keeping the duration). */
  getEndOn(date: Dayjs | Date): Dayjs | null {
    const start = this.getStartOn(date);
    if (!start) return null;
    if (!this._endDate || !this._startDate) return null;
    const durationMs = this._endDate.diff(this._startDate);
    return start.add(durationMs, 'millisecond');
  }

  /** Whether the occurrence on `date` is already in the past (by the event's time of day). */
  isPastOn(date: Dayjs | Date): boolean {
    const end = this.getEndOn(date) ?? this.getStartOn(date);
    if (!end) return false;
    return dayjs().isAfter(end);
  }

  /** Whether the occurrence on `date` is happening right now. */
  isNowOn(date: Dayjs | Date): boolean {
    const start = this.getStartOn(date);
    if (!start) return false;
    const now = dayjs();
    const end = this.getEndOn(date) ?? start.add(1, 'hour');
    return (now.isAfter(start) || now.isSame(start)) && (now.isBefore(end) || now.isSame(end));
  }

  /** Short description of the repetition rule, or null when it is a one-off. */
  getRecurrenceLabel(): string | null {
    const rec = this.recurrence;
    if (!rec) return null;
    const n = Math.max(1, Math.floor(rec.interval ?? 1));
    const every = (unit1: string, unitN: string) =>
      n === 1 ? `Every ${unit1}` : `Every ${n} ${unitN}`;
    switch (rec.freq) {
      case 'daily':
        return every('day', 'days');
      case 'weekly':
        return every('week', 'weeks');
      case 'monthly':
        return every('month', 'months');
      case 'yearly':
        return every('year', 'years');
      case 'weekdays': {
        const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const wd = rec.weekdays && rec.weekdays.length ? rec.weekdays : [];
        return wd.length ? wd.map((d) => names[d]).join(', ') : 'Selected days';
      }
      default:
        return 'Recurring';
    }
  }

  // Check if event is today
  isToday(): boolean {
    return this.isSameDay(dayjs());
  }

  // Get formatted date string
  getDateFormatted(format = 'YYYY-MM-DD'): string | null {
    return this._startDate?.format(format) ?? null;
  }

  // Get full formatted date and time
  getDateTimeFormatted(format = 'YYYY-MM-DD HH:mm'): string | null {
    return this._startDate?.format(format) ?? null;
  }

  // Get relative time from now (e.g., "in 2 hours", "3 days ago")
  getRelativeTime(): string | null {
    if (!this._startDate) return null;
    const now = dayjs();
    const diffMinutes = this._startDate.diff(now, 'minute');
    const diffHours = this._startDate.diff(now, 'hour');
    const diffDays = this._startDate.diff(now, 'day');

    if (Math.abs(diffMinutes) < 60) {
      return diffMinutes >= 0 ? `in ${diffMinutes}m` : `${Math.abs(diffMinutes)}m ago`;
    } else if (Math.abs(diffHours) < 24) {
      return diffHours >= 0 ? `in ${diffHours}h` : `${Math.abs(diffHours)}h ago`;
    } else {
      return diffDays >= 0 ? `in ${diffDays}d` : `${Math.abs(diffDays)}d ago`;
    }
  }

  // Convert back to model
  toModel(): EventModel {
    return {
      type: 'event',
      taskId: this.taskId,
      name: this.name,
      description: this.description,
      startTime: this.startTime,
      endTime: this.endTime,
      components: this.components,
      recurrence: this.recurrence,
      exceptions: this.exceptions && this.exceptions.length ? [...this.exceptions] : undefined,
    };
  }

  clone(): EventNode {
    const cloned = this.copyBaseStateTo(new EventNode(this.toModel()));
    cloned._taskRef = this._taskRef;
    return cloned;
  }

  // Compare by time for sorting
  compareTo(other: EventNode): number {
    if (!this._startDate && !other._startDate) return 0;
    if (!this._startDate) return 1;
    if (!other._startDate) return -1;
    return this._startDate.diff(other._startDate);
  }

  /**
   * Comparison in the context of one particular day.
   *
   * `compareTo` looks at the absolute date, and an occurrence of a repeating
   * event carries it from the day of the first occurrence — so on a day's list
   * a rule set months ago came before everything added today, whatever the
   * time. Here what counts is the time of day, which is what the list shows.
   */
  compareToOn(other: EventNode, date: Dayjs | Date): number {
    const mine = this.getStartOn(date);
    const theirs = other.getStartOn(date);
    if (!mine && !theirs) return 0;
    if (!mine) return 1;
    if (!theirs) return -1;
    return mine.diff(theirs);
  }

  // Static sort helper
  static sortByTime(events: EventNode[]): EventNode[] {
    return [...events].sort((a, b) => a.compareTo(b));
  }

  /** Sorting the list of one day — see `compareToOn`. */
  static sortByTimeOn(events: EventNode[], date: Dayjs | Date): EventNode[] {
    return [...events].sort((a, b) => a.compareToOn(b, date));
  }
}
