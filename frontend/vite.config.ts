import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/_laravel-brain/',
  root: '.',
  build: {
    outDir: '../public',
    emptyOutDir: false, // preserve router.php and graph.json
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'vendor-react';
            if (id.includes('cytoscape')) return 'vendor-cytoscape';
            if (id.includes('html2canvas')) return 'vendor-utils';
            return 'vendor';
          }
        }
      }
    }
  },
})
