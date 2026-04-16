import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'path';

export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      outDir: 'dist',
      entryRoot: 'src',
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'CesiumTimelineCore',
      fileName: (format) => {
        if (format === 'umd') return 'cesium-timeline-core.umd.cjs';
        return 'cesium-timeline-core.js';
      },
    },
    rollupOptions: {
      external: ['cesium'],
      output: {
        globals: {
          cesium: 'Cesium',
        },
      },
    },
  },
});
