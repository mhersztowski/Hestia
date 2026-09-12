/**
 * The model's fields have to survive the trip model -> node -> model.
 *
 * `toModel()` writes out fields from a list rather than spreading the whole
 * object — adding a field to `TaskModel` without adding it here ends with the
 * value being set in the interface, written to the file and **gone at the first
 * reload**. The symptom looks like "it does not save", and the cause lies two
 * layers below.
 *
 * The test compares the full set of keys, so it catches every field after this
 * one, not only the one that happened to hurt.
 */

import { describe, expect, it } from 'vitest';
import { TaskNode } from './TaskNode';
import type { TaskModel } from '../models/TaskModel';

const FULL: TaskModel = {
    type: 'task',
    id: 'task-1',
    projectId: 'project-1',
    name: 'Design the power supply',
    description: 'Description',
    duration: 2.5,
    cost: 100,
    status: 'in_progress',
    priority: 'high',
    startDate: '2026-08-01',
    dueDate: '2026-08-20',
    assignees: ['person-1'],
    tags: ['electronics'],
    timeEntries: [{ id: 'e1', start: '2026-08-01T10:00:00.000Z', end: '2026-08-01T11:00:00.000Z' }],
    parentTaskId: 'task-0',
    order: 3,
    dependsOn: ['task-9'],
    docPath: 'notes/power-supply.md',
};

describe('TaskNode — the trip model -> node -> model', () => {
    it('loses no field', () => {
        const result = TaskNode.fromModel(FULL).toModel();

        for (const [key, value] of Object.entries(FULL)) {
            expect(result[key as keyof TaskModel], `field ${key}`).toEqual(value);
        }
    });

    it('the note survives the trip', () => {
        // This field disappeared on the first attempt — it was set in the panel,
        // reached the file and was lost on loading.
        expect(TaskNode.fromModel(FULL).toModel().docPath).toBe('notes/power-supply.md');
    });

    it('a missing note stays missing rather than becoming an empty string', () => {
        const without: TaskModel = { ...FULL };
        delete without.docPath;
        expect(TaskNode.fromModel(without).toModel().docPath).toBeUndefined();
    });
});
