import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    return {
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
        build: {
            rollupOptions: {
                output: {
                    manualChunks: function (id) {
                        if (id.includes('node_modules/lightweight-charts-indicators')) {
                            return 'trading-indicators';
                        }
                        if (id.includes('node_modules/oakscriptjs')) {
                            return 'indicator-runtime';
                        }
                        if (id.includes('node_modules/lightweight-charts')) {
                            return 'trading-charts';
                        }
                        if (id.includes('node_modules/lucide-react') || id.includes('node_modules/motion')) {
                            return 'ui-vendor';
                        }
                        if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
                            return 'analytics-vendor';
                        }
                        if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/zustand')) {
                            return 'react-vendor';
                        }
                    },
                },
            },
        },
        server: {
            watch: {
                ignored: ['**/.dukascopy-cache/**', '**/node_modules/**'],
            },
            hmr: process.env.DISABLE_HMR !== 'true',
        },
    };
});
