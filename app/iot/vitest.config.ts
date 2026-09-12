import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'iot-backend', globals: true, include: ['src/**/*.test.ts'] },
});
