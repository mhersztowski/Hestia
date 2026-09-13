import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // The MQTT objects as their own bundle — see `coreobject/index.ts`.
    'coreobject-mqtt': 'src/coreobject/mqtt/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  external: ['dayjs', 'zod', 'mqtt'],
  treeshake: true,
});
