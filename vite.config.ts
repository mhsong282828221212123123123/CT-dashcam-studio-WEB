import { execFileSync } from 'node:child_process';
import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from '@unplugin-pwa/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/// <reference types="vitest/config" />

export default defineConfig(({ mode }) => {
  const isHttps = process.env.HTTPS === 'true' || mode === 'https';
  const basePath = process.env.VITE_BASE_PATH || '/CT-dashcam-studio-WEB/';
  const sourceRevision = (() => {
    try {
      return execFileSync('git', ['-c', 'safe.directory=*', 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim();
    } catch {
      return basePath.includes('/dev/') ? 'dev' : 'main';
    }
  })();
  return {
    base: basePath,
    define: {
      __SOURCE_REVISION__: JSON.stringify(sourceRevision),
    },
    plugins: [
      tailwindcss(),
      react(),
      babel({ plugins: ['@jellybrick/react-solid-flow/babel'] }),
      babel({ presets: [reactCompilerPreset()] }),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: false,
        generateSW: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: basePath.endsWith('/preview/pr-1/')
            ? []
            : [/\/(?:classic|dev|intro|preview)(?:\/|$)/],
          runtimeCaching: [
            {
              urlPattern: /\.woff2$/,
              handler: 'CacheFirst',
              options: { cacheName: 'fonts', expiration: { maxEntries: 120 } },
            },
          ],
        },
      }),
      ...(isHttps ? [basicSsl()] : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
    },
    test: {
      include: ['test/**/*.test.{ts,js}'],
    },
  };
});
