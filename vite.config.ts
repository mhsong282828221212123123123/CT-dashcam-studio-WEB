import type { IncomingMessage, ServerResponse } from 'node:http';
import introLocales from './intro/content.json';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const isHttps = process.env.HTTPS === 'true' || mode === 'https';
  const basePath = process.env.VITE_BASE_PATH || '/CT-dashcam-studio-WEB/';
  const introRoutes = new Set([`${basePath}intro/`, ...Object.values(introLocales).map(locale => `${basePath}intro/${locale.slug}/`)]);
  const introDirectoryIndex = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (introRoutes.has(url.pathname)) req.url = `${url.pathname}index.html${url.search}`;
    else if (introRoutes.has(`${url.pathname}/`)) {
      res.writeHead(302, { Location: `${url.pathname}/${url.search}` });
      res.end();
      return;
    }
    next();
  };
  return {
    base: basePath,
    plugins: [{
      name: 'intro-directory-index',
      configureServer(server) { server.middlewares.use(introDirectoryIndex); },
      configurePreviewServer(server) { server.middlewares.use(introDirectoryIndex); },
    }, ...(isHttps ? [basicSsl()] : [])],
    server: {
      host: '0.0.0.0',
      port: 5173,
      https: isHttps ? {} : undefined,
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
    },
  };
});
