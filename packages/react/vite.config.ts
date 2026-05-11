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
      name: 'CesiumTimelineReact',
      fileName: (format) => {
        if (format === 'umd') return 'cesium-timeline-react.umd.cjs';
        return 'cesium-timeline-react.js';
      },
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'cesium', '@kteneyck/cesium-timeline-core'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          cesium: 'Cesium',
          '@kteneyck/cesium-timeline-core': 'CesiumTimelineCore',
        },
      },
    },
  },
});
