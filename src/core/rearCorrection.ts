// A mild radial correction for rear footage without a per-camera calibration.
// Render only the visible crop into a reusable GPU surface.
let surface: ReturnType<typeof createSurface> | undefined;

function createSurface() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
  if (!gl) return null;

  function compile(context: WebGLRenderingContext, type: number, source: string) {
    const shader = context.createShader(type);
    if (!shader) return null;
    context.shaderSource(shader, source);
    context.compileShader(shader);
    if (context.getShaderParameter(shader, context.COMPILE_STATUS)) return shader;
    context.deleteShader(shader);
    return null;
  }

  const vertex = compile(gl, gl.VERTEX_SHADER, `
    attribute vec2 position;
    varying mediump vec2 uv;
    void main() {
      uv = vec2(position.x + 1.0, 1.0 - position.y) * 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D frame;
    uniform vec4 crop;
    uniform vec2 axisScale;
    varying mediump vec2 uv;
    void main() {
      vec2 offset = crop.xy + uv * crop.zw - 0.5;
      vec2 radius = offset * axisScale;
      // Inverse mapping samples closer to the optical center near the edges.
      vec2 sampleUV = 0.5 + offset / (1.0 + 0.12 * dot(radius, radius));
      gl_FragColor = texture2D(frame, sampleUV);
    }
  `);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!buffer || !texture) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return {
    canvas, gl,
    crop: gl.getUniformLocation(program, 'crop'),
    axisScale: gl.getUniformLocation(program, 'axisScale'),
  };
}

export function correctRearFrame(
  source: CanvasImageSource, sourceWidth: number, sourceHeight: number,
  x: number, y: number, width: number, height: number,
  outputWidth: number, outputHeight: number,
): HTMLCanvasElement | null {
  try {
    if (surface === undefined) surface = createSurface();
    if (!surface || surface.gl.isContextLost()) return null;
    const { canvas, gl, crop, axisScale } = surface;
    const w = Math.max(1, Math.round(outputWidth));
    const h = Math.max(1, Math.round(outputHeight));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform4f(crop, x / sourceWidth, y / sourceHeight, width / sourceWidth, height / sourceHeight);
    const longestSide = Math.max(sourceWidth, sourceHeight);
    gl.uniform2f(axisScale, 2 * sourceWidth / longestSide, 2 * sourceHeight / longestSide);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return gl.getError() === gl.NO_ERROR ? canvas : null;
  } catch {
    return null;
  }
}
