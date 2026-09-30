import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'docs',
    // Retain the original pipeline export, vendored tools, and research artifacts.
    emptyOutDir: false,
    rollupOptions: { output: { manualChunks: (id: string) => id.includes('node_modules/three/') ? 'three' : undefined } },
  },
});
