import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
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
      name: 'CesiumTimeline',
      fileName: (format) => {
        if (format === 'umd') return 'cesium-timeline.umd.cjs';
        return 'cesium-timeline.js';
      },
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'cesium'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          cesium: 'Cesium',
        },
      },
    },
  },
});
