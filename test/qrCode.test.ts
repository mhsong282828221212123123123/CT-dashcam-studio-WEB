import { afterEach, describe, it, expect, vi } from 'vitest';
import * as qrCode from '../src/core/qrCode';
import { QR_CODE_URL, QR_MATRIX, drawQRCode } from '../src/core/qrCode';
import { OverlayRenderer, DEFAULT_RENDER_OPTIONS } from '../src/core/renderer';
import { DEFAULT_TELEMETRY } from '../src/core/seiDecoder';

afterEach(() => vi.restoreAllMocks());

describe('Brand QR Code', () => {
  it('has the correct target URL', () => {
    expect(QR_CODE_URL).toBe('https://mhsong282828221212123123123.github.io/CT-dashcam-studio-WEB');
  });

  it('has a valid 39x39 matrix format with finder patterns', () => {
    expect(QR_MATRIX.length).toBe(39);
    for (const row of QR_MATRIX) {
      expect(row.length).toBe(39);
      expect(/^[01]+$/.test(row)).toBe(true);
    }
    // Top-left finder pattern check (starts at row 3, col 3 with border 3)
    expect(QR_MATRIX[3].slice(3, 10)).toBe('1111111');
    expect(QR_MATRIX[4].slice(3, 10)).toBe('1000001');
    expect(QR_MATRIX[5].slice(3, 10)).toBe('1011101');
  });

  it('draws without crashing on a 2D canvas context', () => {
    const rects: any[] = [];
    const mockCtx = {
      save: () => {},
      restore: () => {},
      fillRect: (x: number, y: number, w: number, h: number) => {
        rects.push({ x, y, w, h });
      },
      strokeRect: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    drawQRCode(mockCtx, 100, 200, 140);
    expect(rects.length).toBeGreaterThan(100);
    // First rect is background
    expect(rects[0]).toEqual({ x: 100, y: 200, w: 140, h: 140 });
  });

  it('reserves space in computeTelemetryLayout for unmovable QR code', () => {
    const layout = OverlayRenderer.computeTelemetryLayout(DEFAULT_RENDER_OPTIONS, 1920, 1080);
    expect(layout.qrPx).toBe(140);
    expect(layout.qrPadR).toBe(16);
    // Verify that colsAvailW leaves room for the QR code zone
    expect(layout.availW - (layout.qrPx + layout.qrPadR + 18)).toBeGreaterThan(0);
  });

  it('reclaims QR space for the telemetry columns when disabled', () => {
    const on = OverlayRenderer.computeTelemetryLayout(DEFAULT_RENDER_OPTIONS);
    const off = OverlayRenderer.computeTelemetryLayout({ ...DEFAULT_RENDER_OPTIONS, qr: false });
    expect(off.frontH).toBe(on.frontH);
    expect(off.colBoxMap.fsd[0]).toBeGreaterThan(on.colBoxMap.fsd[0]);
  });

  it.each([[true, true], [true, false], [false, true], [false, false]])(
    'renders QR and caption only when enabled (HUD=%s, QR=%s)', (hud, enabled) => {
      const drawQR = vi.spyOn(qrCode, 'drawQRCode').mockImplementation(() => {});
      const fillText = vi.fn();
      const context = new Proxy<Record<string, any>>({
        fillText,
        measureText: () => ({ width: 20 }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
      }, { get: (target, key: string) => key in target ? target[key] : () => {} });
      const canvas = { width: 1920, height: 1080, getContext: () => context } as unknown as HTMLCanvasElement;
      OverlayRenderer.render(canvas, {}, DEFAULT_TELEMETRY, '00:00:00', 0, 0, 36, {
        ...DEFAULT_RENDER_OPTIONS, map: false, steering: false, speed: false,
        pedal: false, fsd: false, turn_signal: false, timestamp: hud, qr: enabled,
      });
      expect(drawQR).toHaveBeenCalledTimes(enabled ? 1 : 0);
      expect(fillText.mock.calls.some(([text]) => text === 'CT Dashcam Studio')).toBe(enabled);
    }
  );
});
