import { defineConfig, loadEnv, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * Production builds must not even load the experimental face mosaic module: Rollup resolves
 * dynamic imports (and Vite emits `?url` assets such as the 15MB ONNX runtime wasm) even from
 * dead branches. When the flag is off, main.ts's dynamic import is redirected to an empty stub.
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
  // Experimental face mosaic: compile-time flag. Enabled only for the /dev/ deployment build
  // (VITE_FACE_BLUR=1 in CI) and for `npm run dev` (.env.development). Production builds get a
  // literal `false`, so the feature and the ONNX runtime assets are removed from the bundle.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const faceBlur = env.VITE_FACE_BLUR === '1';
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
