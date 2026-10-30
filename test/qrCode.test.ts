import { describe, it, expect } from 'vitest';
import { QR_CODE_URL, QR_MATRIX, drawQRCode } from '../src/core/qrCode';
import { OverlayRenderer, DEFAULT_RENDER_OPTIONS } from '../src/core/renderer';

describe('Brand QR Code', () => {
  it('has the correct target URL', () => {
    expect(QR_CODE_URL).toBe('https://mhsong282828221212123123123.github.io/CT-dashcam-studio-WEB');
  });

  it('has a valid 37x37 matrix format with finder patterns', () => {
    expect(QR_MATRIX.length).toBe(37);
    for (const row of QR_MATRIX) {
      expect(row.length).toBe(37);
      expect(/^[01]+$/.test(row)).toBe(true);
    }
    // Top-left finder pattern check (starts at row 2, col 2 with border 2)
    expect(QR_MATRIX[2].slice(2, 9)).toBe('1111111');
    expect(QR_MATRIX[3].slice(2, 9)).toBe('1000001');
    expect(QR_MATRIX[4].slice(2, 9)).toBe('1011101');
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

    drawQRCode(mockCtx, 100, 200, 122);
    expect(rects.length).toBeGreaterThan(100);
    // First rect is background
    expect(rects[0]).toEqual({ x: 100, y: 200, w: 122, h: 122 });
  });

  it('reserves space in computeTelemetryLayout for unmovable QR code', () => {
    const layout = OverlayRenderer.computeTelemetryLayout(DEFAULT_RENDER_OPTIONS, 1920, 1080);
    expect(layout.qrPx).toBe(122);
    expect(layout.qrPadR).toBe(16);
    // Verify that colsAvailW leaves room for the QR code zone
    expect(layout.availW - (layout.qrPx + layout.qrPadR + 24)).toBeGreaterThan(0);
  });
});
