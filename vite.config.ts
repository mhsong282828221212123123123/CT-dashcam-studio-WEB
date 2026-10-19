import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const isHttps = process.env.HTTPS === 'true' || mode === 'https';
  return {
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
