import { describe, it, expect } from 'vitest';
import { DEFAULT_SMART_DISPLAY_CONFIG } from './SmartDisplayModel';

describe('DEFAULT_SMART_DISPLAY_CONFIG', () => {
  it('has the expected shape and defaults', () => {
    expect(DEFAULT_SMART_DISPLAY_CONFIG.type).toBe('smart-display-config');
    expect(DEFAULT_SMART_DISPLAY_CONFIG.views).toEqual([]);
  });

  it('defaults the cycle duration to 15 minutes', () => {
    expect(DEFAULT_SMART_DISPLAY_CONFIG.cycleDurationMs).toBe(15 * 60 * 1000);
  });
});
