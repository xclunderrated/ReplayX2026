import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({mode}) => {
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    build: {
      chunkSizeWarningLimit: 2000,
    },
    server: {
      watch: {
        ignored: ['**/.dukascopy-cache/**', '**/node_modules/**'],
      },
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
