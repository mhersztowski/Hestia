import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'iot-web', globals: true, environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
