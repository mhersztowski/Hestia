import { nanoid } from './nanoid';

describe('nanoid', () => {
  it('returns a UUID-shaped string', () => {
    const id = nanoid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('returns unique values', () => {
    const set = new Set(Array.from({ length: 100 }, () => nanoid()));
    expect(set.size).toBe(100);
  });
});
