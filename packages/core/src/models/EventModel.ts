/** How often an event repeats. `weekdays` = selected days of the week. */
export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly" | "weekdays";

export interface RecurrenceModel {
    freq: RecurrenceFreq;
    /** Every how many units (days/weeks/months/years). Defaults to 1. Ignored for "weekdays". */
    interval?: number;
    /** For freq="weekdays": days of the week, 0=Sunday … 6=Saturday. */
    weekdays?: number[];
    /** Optional end date for the repetition (ISO or YYYY-MM-DD). */
    until?: string;
}

export interface EventModel {
    type: "event";
    taskId?: string;
    name: string;
    description?: string;
    startTime: string;
    endTime?: string;
    components?: EventComponentModel[];
    /** Repetition rule. Absent = a one-off event. */
    recurrence?: RecurrenceModel;
    /** Dates (YYYY-MM-DD) of cancelled occurrences of a repeating event. */
    exceptions?: string[];
}

export interface EventsModel {
    type: "events";
    tasks: EventModel[];
}

export interface EventComponentModel {
    type: string;
}

export interface EventTestComponentModel extends EventComponentModel {
    type: "event_test";
    name: string;
    description: string;
}
