import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // 'autoUpdate' preserves how this app behaved with no service worker
        // at all: a push to main reaches everyone on their next open, with no
        // "update available" prompt to tap. Without it, the worker would keep
        // serving the installed version indefinitely.
        registerType: 'autoUpdate',
        // public/manifest.json is already written by hand and linked from
        // index.html - don't generate a second, competing one.
        manifest: false,
        workbox: {
          // Build output only. Everything here is content-hashed by Vite, so
          // a stale copy is impossible: a changed file gets a new filename.
          globPatterns: ['**/*.{js,css,html,png,svg,ico,json}'],
          // SPA routes (/analyze, /bucket/:id/...) are served by index.html.
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          // Deliberately no runtimeCaching for the Supabase API. Balances and
          // transactions must never be served from cache - showing a stale
          // figure in a ledger is worse than showing a spinner. The worker
          // speeds up the app shell; data still always comes from the network.
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
