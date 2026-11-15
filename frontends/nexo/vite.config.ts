import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// React and React DOM (with its scheduler) change rarely: their own long-cached vendor chunk.
const vendor = /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/;
export default defineConfig({ base: '/nexo/', plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: id => (vendor.test(id) ? 'vendor' : undefined) } } } });
