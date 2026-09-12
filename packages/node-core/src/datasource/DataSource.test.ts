import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { DataSource } from './DataSource';
import { FileSystem } from '../filesystem/FileSystem';

let tmpDir: string;
let fileSystem: FileSystem;

const personsJson = JSON.stringify({
  type: 'persons',
  items: [
    { type: 'person', id: 'p1', nick: 'joe', firstName: 'Joe' },
    { type: 'person', id: 'p2', nick: 'ann' },
  ],
});

const tasksJson = JSON.stringify({
  type: 'tasks',
  tasks: [{ type: 'task', id: 't1', name: 'Do thing' }],
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ds-test-'));
  fileSystem = new FileSystem(tmpDir);
  await fileSystem.initialize();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('DataSource', () => {
  it('initialize emits "loaded" and marks the store loaded', async () => {
    const ds = new DataSource(fileSystem);
    let loadedEmitted = false;
    ds.on('loaded', () => {
      loadedEmitted = true;
    });
    expect(ds.isLoaded).toBe(false);
    await ds.initialize();
    expect(loadedEmitted).toBe(true);
    expect(ds.isLoaded).toBe(true);
  });

  it('initialize tolerates missing data files', async () => {
    const ds = new DataSource(fileSystem);
    await expect(ds.initialize()).resolves.not.toThrow();
    expect(ds.persons).toEqual([]);
    expect(ds.tasks).toEqual([]);
  });

  it('loads persons and tasks from disk', async () => {
    await fileSystem.writeFile('data/persons.json', personsJson);
    await fileSystem.writeFile('data/tasks.json', tasksJson);

    const ds = new DataSource(fileSystem);
    await ds.initialize();

    expect(ds.persons).toHaveLength(2);
    expect(ds.getPersonById('p1')?.nick).toBe('joe');
    expect(ds.tasks).toHaveLength(1);

    const stats = ds.getStats();
    expect(stats.persons).toBe(2);
    expect(stats.tasks).toBe(1);
  });

  it('respects a userDataPath prefix', async () => {
    await fileSystem.writeFile('Users/marcin/data/persons.json', personsJson);
    const ds = new DataSource(fileSystem, 'Users/marcin');
    await ds.initialize();
    expect(ds.persons).toHaveLength(2);
  });

  it('onFileChanged reloads persons and emits dataChanged', async () => {
    await fileSystem.writeFile('data/persons.json', personsJson);
    const ds = new DataSource(fileSystem);
    await ds.initialize();
    expect(ds.persons).toHaveLength(2);

    const events: Array<{ type: string; path: string }> = [];
    ds.on('dataChanged', (e) => events.push(e));

    // Update the file, invalidate cache, then notify
    const updated = JSON.stringify({
      type: 'persons',
      items: [{ type: 'person', id: 'p1', nick: 'joe' }],
    });
    await fileSystem.writeFile('data/persons.json', updated);
    await ds.onFileChanged('data/persons.json');

    expect(ds.persons).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('persons');
  });

  it('onFileChanged normalises backslash paths', async () => {
    await fileSystem.writeFile('data/tasks.json', tasksJson);
    const ds = new DataSource(fileSystem);
    await ds.initialize();

    const events: Array<{ type: string }> = [];
    ds.on('dataChanged', (e) => events.push(e));
    await ds.onFileChanged('data\\tasks.json');
    expect(events.map((e) => e.type)).toContain('tasks');
  });

  it('onFileChanged for a calendar file emits an events change', async () => {
    await fileSystem.writeFile(
      'data/calendar/2026/07/03.json',
      JSON.stringify({ type: 'events', tasks: [] }),
    );
    const ds = new DataSource(fileSystem);
    await ds.initialize();

    const events: Array<{ type: string }> = [];
    ds.on('dataChanged', (e) => events.push(e));
    await ds.onFileChanged('data/calendar/2026/07/03.json');
    expect(events.map((e) => e.type)).toContain('events');
  });

  it('onFileChanged ignores unrelated paths', async () => {
    const ds = new DataSource(fileSystem);
    await ds.initialize();
    const events: unknown[] = [];
    ds.on('dataChanged', (e) => events.push(e));
    await ds.onFileChanged('some/other/file.txt');
    expect(events).toHaveLength(0);
  });

  it('clear resets the store', async () => {
    await fileSystem.writeFile('data/persons.json', personsJson);
    const ds = new DataSource(fileSystem);
    await ds.initialize();
    expect(ds.persons.length).toBeGreaterThan(0);
    ds.clear();
    expect(ds.persons).toEqual([]);
    expect(ds.getStats().persons).toBe(0);
  });
});
