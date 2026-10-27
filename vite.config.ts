import { defineConfig, loadEnv, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * When face mosaic is disabled (VITE_FACE_BLUR=0), main.ts's dynamic import of
 * `facePrivacy` is redirected to an empty stub to avoid bundling ONNX runtime assets.
 */
function faceBlurStub(enabled: boolean): Plugin {
  const STUB_ID = '\0face-privacy-stub';
  return {
    name: 'face-privacy-stub',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!enabled && importer && /[\\/]src[\\/]main\.ts$/.test(importer) && /core\/facePrivacy$/.test(source)) {
        return STUB_ID;
      }
      return null;
    },
    load(id) {
      return id === STUB_ID ? 'export const FaceDetector = undefined;\nexport const FacePrivacyProcessor = undefined;\n' : null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const isHttps = process.env.HTTPS === 'true' || mode === 'https';
  const basePath = process.env.VITE_BASE_PATH || '/CT-dashcam-studio-WEB/';
  // Face mosaic: enabled by default for all builds (production and dev).
  // Can be explicitly disabled with VITE_FACE_BLUR=0 if needed.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const faceBlur = env.VITE_FACE_BLUR !== '0';
  return {
    base: basePath,
    plugins: [...(isHttps ? [basicSsl()] : []), faceBlurStub(faceBlur)],
    define: {
      __FACE_BLUR__: JSON.stringify(faceBlur),
    },
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
