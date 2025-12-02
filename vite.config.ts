import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1500, // Increase limit to 1500kb
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Create separate chunks for large dependencies
          if (id.includes('firebase')) {
            return 'vendor-firebase';
          }
          if (id.includes('xlsx')) {
            return 'vendor-xlsx';
          }
          if (id.includes('html2canvas')) {
            return 'vendor-html2canvas';
          }
          if (id.includes('sweetalert2')) {
            return 'vendor-sweetalert2';
          }
        },
      },
    },
  },
});
