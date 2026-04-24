import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

// Copy Cesium assets to public folder during dev
const cesiumDir = path.resolve(__dirname, 'node_modules/cesium/Build/CesiumUnminified');
const publicDir = path.resolve(__dirname, 'demo-react/public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const cesiumPublicDir = path.join(publicDir, 'cesium');
if (!fs.existsSync(cesiumPublicDir)) {
  fs.cpSync(cesiumDir, cesiumPublicDir, { recursive: true });
}

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, './demo-react'),
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      '@bariumstudios/cesium-timeline-core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@bariumstudios/cesium-timeline-react': path.resolve(__dirname, './packages/react/src/index.ts'),
    },
  },
  define: {
    'import.meta.env.CESIUM_BASE_URL': JSON.stringify('/cesium/'),
  },
  optimizeDeps: {
    include: ['cesium'],
  },
});
