import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const isHttps = process.env.HTTPS === 'true' || mode === 'https';
  const basePath = process.env.VITE_BASE_PATH || '/CT-dashcam-studio-WEB/';
  return {
    base: basePath,
    plugins: isHttps ? [basicSsl()] : [],
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
