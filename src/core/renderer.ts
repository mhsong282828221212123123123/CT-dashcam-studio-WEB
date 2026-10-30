// Ported & precisely matched to core/renderer.py (OverlayRenderer) using Canvas 2D
import { TelemetryData } from './seiDecoder';
import { OpenStreetMapTileLoader } from './mapLoader';
import { CameraKey } from './constants';
import { drawQRCode } from './qrCode';

export interface RenderOptions {
  layout: '기본 (1:3 세로배치)' | '2x2 분할 (전후/좌우)' | '단일 카메라';
  single_cam: CameraKey;
  pillar_pip: boolean;
  map: boolean;
  speed: boolean;
  fsd: boolean;
  turn_signal: boolean;
  steering: boolean;
  pedal: boolean;
  timestamp: boolean;
  qr?: boolean;
  brightness: number; // -100 ~ 100, default 0
  contrast: number; // 0.5 ~ 2.0, default 1.0
  playbackSpeed: number;
  exportSpeed?: number;
  telemetryOrder?: string[];
  draggingCol?: string | null;
}

export const DEFAULT_TELEMETRY_ORDER = ['timestamp', 'steering', 'turn_signal', 'speed', 'pedal', 'fsd'];

export const COL_WIDTH_BASE: Record<string, number> = {
  timestamp: 185,
  speed: 162,
  pedal: 176,
  steering: 118,
  turn_signal: 118,
  fsd: 156,
};

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  layout: '기본 (1:3 세로배치)',
  single_cam: 'front',
  pillar_pip: true,
  map: true,
  speed: true,
  fsd: true,
  turn_signal: true,
  steering: true,
  pedal: true,
  timestamp: true,
  qr: true,
  brightness: 0,
  contrast: 1.0,
  playbackSpeed: 1.0,
  exportSpeed: 1.0,
  telemetryOrder: [...DEFAULT_TELEMETRY_ORDER],
  draggingCol: null,
};

export class OverlayRenderer {
  private static steeringImg: HTMLImageElement | null = null;

  static {
    if (typeof window !== 'undefined') {
      const img = new Image();
      const baseUrl = import.meta.env?.BASE_URL || '/';
      img.src = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}models/steering_hud.png`;
      img.onload = () => {
        this.steeringImg = img;
      };
    }
  }

  static drawSubSlotCover(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    source: CanvasImageSource | null | undefined,
    label: string,
    scale = 1.0
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(x, y, w, h);

    if (source) {
      try {
        const sw = (source as any).videoWidth || (source as any).width || w;
        const sh = (source as any).videoHeight || (source as any).height || h;

        if (sw > 0 && sh > 0) {
          const sRatio = sw / sh;
          const dRatio = w / h;
          let sx = 0, sy = 0, sCropW = sw, sCropH = sh;

          if (sRatio > dRatio) {
            sCropW = sh * dRatio;
            sx = (sw - sCropW) / 2;
          } else {
            sCropH = sw / dRatio;
            sy = (sh - sCropH) / 2;
          }

          ctx.drawImage(source, sx, sy, sCropW, sCropH, x, y, w, h);
        }
      } catch {
        // Fallback if video frame not ready
      }
    }

    // Subtle dark slate border
    ctx.strokeStyle = '#1e2430';
    ctx.lineWidth = Math.max(1, Math.round(scale));
    ctx.strokeRect(x, y, w, h);

    // Label Badge - matching PC version: bright yellow background with black bold text
    if (label) {
      this.drawSlotBadge(ctx, x, y, label, scale);
    }

    ctx.restore();
  }

  // Matches PC version: small yellow badge in the top-left corner
  static drawSlotBadge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    scale = 1.0
  ): void {
    ctx.save();
    const fontSize = Math.max(9, Math.round(11 * scale));
    ctx.font = `bold ${fontSize}px sans-serif`;
    const metrics = ctx.measureText(label);
    const tw = metrics.width;
    const th = fontSize;

    const padX = 6 * scale;
    const padY = 2 * scale;
    const bw = tw + padX * 2;
    const bh = th + padY * 2;

    // Bright yellow badge background
    ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.fillRect(x, y, bw, bh);

    // Black text
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + padX, y + padY);

    ctx.restore();
  }

  static drawTurnSignals(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    leftOn: boolean,
    rightOn: boolean,
    frameIdx: number,
    fps = 36.0,
    scale = 1.0
  ): void {
    const isBlinkPhase = Math.floor((frameIdx / fps) * 3.5) % 2 === 0;
    const lActive = leftOn && isBlinkPhase;
    const rActive = rightOn && isBlinkPhase;

    const lFill = lActive ? '#55f500' : '#262c36';
    const rFill = rActive ? '#55f500' : '#262c36';
    const lEdge = lActive ? '#c8ffd2' : '#444c5a';
    const rEdge = rActive ? '#c8ffd2' : '#444c5a';

    const thick = Math.max(1, Math.round(1.8 * scale));
    const lTipX = cx - Math.round(48 * scale);
    const lHeadX = cx - Math.round(22 * scale);
    const lStemEndX = cx - Math.round(8 * scale);

    const rTipX = cx + Math.round(48 * scale);
    const rHeadX = cx + Math.round(22 * scale);
    const rStemEndX = cx + Math.round(8 * scale);

    const headY = Math.round(17 * scale);
    const stemY = Math.round(7 * scale);

    ctx.save();

    // Left Arrow polygon
    ctx.beginPath();
    ctx.moveTo(lTipX, cy);
    ctx.lineTo(lHeadX, cy - headY);
    ctx.lineTo(lHeadX, cy - stemY);
    ctx.lineTo(lStemEndX, cy - stemY);
    ctx.lineTo(lStemEndX, cy + stemY);
    ctx.lineTo(lHeadX, cy + stemY);
    ctx.lineTo(lHeadX, cy + headY);
    ctx.closePath();
    ctx.fillStyle = lFill;
    ctx.fill();
    ctx.strokeStyle = lEdge;
    ctx.lineWidth = thick;
    ctx.stroke();

    // Right Arrow polygon
    ctx.beginPath();
    ctx.moveTo(rTipX, cy);
    ctx.lineTo(rHeadX, cy - headY);
    ctx.lineTo(rHeadX, cy - stemY);
    ctx.lineTo(rStemEndX, cy - stemY);
    ctx.lineTo(rStemEndX, cy + stemY);
    ctx.lineTo(rHeadX, cy + stemY);
    ctx.lineTo(rHeadX, cy + headY);
    ctx.closePath();
    ctx.fillStyle = rFill;
    ctx.fill();
    ctx.strokeStyle = rEdge;
    ctx.lineWidth = thick;
    ctx.stroke();

    ctx.restore();
  }

  static drawRotatedSteering(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    angleDeg: number,
    scale = 1.0,
    wheelPx = 96
  ): void {
    const size = Math.round(wheelPx * scale);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angleDeg * Math.PI) / 180);

    if (this.steeringImg && this.steeringImg.complete && this.steeringImg.naturalWidth > 0) {
      ctx.drawImage(this.steeringImg, -size / 2, -size / 2, size, size);
    } else {
      // Fallback clean vector steering wheel
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, Math.round(7 * scale));
      ctx.strokeStyle = '#d0d7de';
      ctx.stroke();

      // Center cap
      ctx.beginPath();
      ctx.arc(0, 0, size / 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#262c36';
      ctx.fill();
      ctx.strokeStyle = '#d0d7de';
      ctx.lineWidth = Math.max(1, Math.round(2 * scale));
      ctx.stroke();

      // Spokes
      ctx.beginPath();
      ctx.moveTo(-size / 2 + 3, 0);
      ctx.lineTo(-size / 4.5, 0);
      ctx.moveTo(size / 2 - 3, 0);
      ctx.lineTo(size / 4.5, 0);
      ctx.moveTo(0, size / 4.5);
      ctx.lineTo(0, size / 2 - 3);
      ctx.lineWidth = Math.max(2, Math.round(4 * scale));
      ctx.strokeStyle = '#8b949e';
      ctx.stroke();
    }
    ctx.restore();
  }

  static computeTelemetryLayout(options: RenderOptions, outW = 1920, outH = 1080) {
    const scale = outW / 1920.0;
    const hasBottomHud = options.map || options.timestamp || options.speed || options.fsd || options.turn_signal || options.steering || options.pedal;
    const bottomH = hasBottomHud ? Math.round(180 * scale) : 0;
    const frontH = outH - bottomH;
    const mapW = options.map ? Math.round(410 * scale) : 0;
    const offsetX = mapW;
    const availW = outW - offsetX;

    // Brand QR Code space reservation (Bottom-Right corner)
    const hasQr = options.qr !== false;
    const qrPx = hasQr ? Math.round(140 * scale) : 0;
    const qrPadR = hasQr ? Math.round(16 * scale) : 0;
    const qrZoneW = hasQr ? (qrPx + qrPadR + Math.round(18 * scale)) : Math.round(24 * scale);
    const colsAvailW = Math.max(Math.round(200 * scale), availW - qrZoneW);

    const rawOrder = options.telemetryOrder || DEFAULT_TELEMETRY_ORDER;
    const order = rawOrder.filter((k) => k in COL_WIDTH_BASE);
    for (const k of DEFAULT_TELEMETRY_ORDER) {
      if (!order.includes(k)) order.push(k);
    }

    const activeCols = order
      .filter((k) => (options as any)[k])
      .map((k) => [k, Math.round(COL_WIDTH_BASE[k] * scale)] as [string, number]);

    const numActive = activeCols.length;
    const totalColW = activeCols.reduce((acc, [, w]) => acc + w, 0);

    const colBoxMap: Record<string, [number, number]> = {};
    const fsdDividers: number[] = [];

    if (numActive > 0) {
      const fsdIndices = activeCols.map(([k], i) => (k === 'fsd' ? i : -1)).filter((i) => i >= 0);
      let numDivs = 0;
      if (fsdIndices.length > 0 && numActive >= 2) {
        const fi = fsdIndices[0];
        if (fi > 0) numDivs++;
        if (fi < numActive - 1) numDivs++;
      }
      const divUnit = Math.round(12 * scale);
      const divExtra = numDivs * divUnit;

      if (options.map && numActive === 6) {
        const sidePadL = Math.round(32 * scale);
        const sidePadR = Math.round(20 * scale);
        const innerGap = Math.max(Math.round(14 * scale), (colsAvailW - sidePadL - sidePadR - totalColW - divExtra) / 5.0);
        let currX = sidePadL;

        for (let i = 0; i < activeCols.length; i++) {
          const [k, wCol] = activeCols[i];
          if (k === 'fsd' && i > 0) {
            fsdDividers.push(Math.round(currX - innerGap / 2.0 + divUnit / 2.0));
            currX += divUnit;
          }
          colBoxMap[k] = [Math.round(currX), wCol];
          currX += wCol + innerGap;
          if (k === 'fsd' && i < numActive - 1) {
            fsdDividers.push(Math.round(currX - innerGap / 2.0 + divUnit / 2.0));
            currX += divUnit;
          }
        }
      } else {
        const freeW = Math.max(Math.round(20 * scale), colsAvailW - totalColW - divExtra);
        const gap = freeW / (numActive + 1);
        let currX = gap;

        for (let i = 0; i < activeCols.length; i++) {
          const [k, wCol] = activeCols[i];
          if (k === 'fsd' && i > 0) {
            fsdDividers.push(Math.round(currX - gap / 2.0 + divUnit / 2.0));
            currX += divUnit;
          }
          colBoxMap[k] = [Math.round(currX), wCol];
          currX += wCol + gap;
          if (k === 'fsd' && i < numActive - 1) {
            fsdDividers.push(Math.round(currX - gap / 2.0 + divUnit / 2.0));
            currX += divUnit;
          }
        }
      }
    }

    return {
      colBoxMap,
      fsdDividers,
      offsetX,
      availW,
      frontH,
      bottomH,
      qrPx,
      qrPadR,
      colsAvailW,
    };
  }

  static render(
    canvas: HTMLCanvasElement,
    frames: Partial<Record<CameraKey, CanvasImageSource | null>>,
    telemetry: TelemetryData,
    baseDateStr: string, // YYYY-MM-DD
    currentTimeSec: number,
    frameIdx: number,
    fps: number,
    options: RenderOptions
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const outW = canvas.width;
    const outH = canvas.height;
    const scale = outW / 1920.0;

    // Brightness and contrast
    const b = options.brightness;
    const c = options.contrast;
    if (b !== 0 || c !== 1.0) {
      ctx.filter = `brightness(${100 + b}%) contrast(${c * 100}%)`;
    } else {
      ctx.filter = 'none';
    }

    const { colBoxMap, fsdDividers, offsetX, availW, frontH, bottomH, qrPx, qrPadR } = this.computeTelemetryLayout(options, outW, outH);
    const hasBottomHud = bottomH > 0;
    const mapW = options.map ? offsetX : 0;

    // Clear background
    ctx.fillStyle = '#080b10';
    ctx.fillRect(0, 0, outW, outH);

    // 1. Layout Rendering
    if (options.layout === '2x2 분할 (전후/좌우)') {
      const halfW = Math.floor(outW / 2);
      const halfH = Math.floor(frontH / 2);

      this.drawSubSlotCover(ctx, 0, 0, halfW, halfH, frames.front, 'FRONT', scale);
      this.drawSubSlotCover(ctx, 0, halfH, halfW, frontH - halfH, frames.back, 'REAR', scale);
      this.drawSubSlotCover(ctx, halfW, 0, outW - halfW, halfH, frames.left_repeater, 'LEFT REPEATER', scale);
      this.drawSubSlotCover(ctx, halfW, halfH, outW - halfW, frontH - halfH, frames.right_repeater, 'RIGHT REPEATER', scale);

      // Grid dividers
      ctx.strokeStyle = '#373c46';
      ctx.lineWidth = Math.max(2, Math.round(2.5 * scale));
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, frontH);
      ctx.moveTo(0, halfH);
      ctx.lineTo(outW, halfH);
      ctx.stroke();
    } else if (options.layout === '단일 카메라') {
      const key = options.single_cam || 'front';
      const labelMap: Record<string, string> = {
        front: 'FRONT MAIN',
        back: 'REAR',
        left_repeater: 'LEFT REPEATER',
        right_repeater: 'RIGHT REPEATER',
        left_pillar: 'LEFT PILLAR',
        right_pillar: 'RIGHT PILLAR',
      };
      this.drawSubSlotCover(ctx, 0, 0, outW, frontH, frames[key], labelMap[key] || key.toUpperCase(), scale);
    } else {
      // 기본 (1:3 세로배치)
      const subW = Math.round(480 * scale);
      const frontW = outW - subW;

      this.drawSubSlotCover(ctx, 0, 0, frontW, frontH, frames.front, 'FRONT MAIN', scale);

      const subH = Math.floor(frontH / 3);
      this.drawSubSlotCover(ctx, frontW, 0, subW, subH, frames.back, 'REAR', scale);
      this.drawSubSlotCover(ctx, frontW, subH, subW, subH, frames.left_repeater, 'LEFT REPEATER', scale);
      this.drawSubSlotCover(ctx, frontW, subH * 2, subW, frontH - subH * 2, frames.right_repeater, 'RIGHT REPEATER', scale);
    }

    // B-Pillar PIP
    if (options.pillar_pip) {
      const is2x2 = options.layout === '2x2 분할 (전후/좌우)';
      const pw = Math.round((is2x2 ? 236 : 320) * scale);
      const ph = Math.round((is2x2 ? 132 : 180) * scale);

      if (frames.left_pillar) {
        this.drawSubSlotCover(ctx, Math.round(8 * scale), frontH - ph - Math.round(8 * scale), pw, ph, frames.left_pillar, 'LEFT PILLAR', scale);
      }
      if (frames.right_pillar) {
        const is2x2 = options.layout === '2x2 분할 (전후/좌우)';
        const isSingle = options.layout === '단일 카메라';
        let px = outW - pw - Math.round(8 * scale);
        if (!is2x2 && !isSingle) {
          // 1:3 layout: position at the bottom-right of the main front camera slot
          const frontW = outW - Math.round(480 * scale);
          px = frontW - pw - Math.round(8 * scale);
        }
        this.drawSubSlotCover(ctx, px, frontH - ph - Math.round(8 * scale), pw, ph, frames.right_pillar, 'RIGHT PILLAR', scale);
      }
    }

    // Speed Badge on Top-Right if non-1.0x
    const pSpeed = options.playbackSpeed || 1.0;
    const eSpeed = options.exportSpeed || 1.0;
    let speedBadgeText: string | null = null;
    if (Math.abs(pSpeed - 1.0) > 0.01 && Math.abs(eSpeed - 1.0) > 0.01) {
      speedBadgeText = `VIEW ${pSpeed.toFixed(1)}x | SAVE ${eSpeed.toFixed(1)}x`;
    } else if (Math.abs(pSpeed - 1.0) > 0.01) {
      speedBadgeText = `VIEW ${pSpeed.toFixed(1)}x`;
    } else if (Math.abs(eSpeed - 1.0) > 0.01) {
      speedBadgeText = `SAVE ${eSpeed.toFixed(1)}x SPEED`;
    }

    if (speedBadgeText) {
      ctx.save();
      const sFont = Math.max(10, Math.round(13 * scale));
      ctx.font = `bold ${sFont}px sans-serif`;
      const sMetrics = ctx.measureText(speedBadgeText);
      const sbw = sMetrics.width + 16 * scale;
      const sbh = sFont + 8 * scale;
      const sbx = (options.layout === '기본 (1:3 세로배치)' ? outW - Math.round(480 * scale) : outW) - sbw - 10 * scale;
      const sby = 10 * scale;

      ctx.fillStyle = 'rgba(12, 16, 24, 0.85)';
      ctx.strokeStyle = '#00e6ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(sbx, sby, sbw, sbh, 4 * scale);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00e6ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(speedBadgeText, sbx + sbw / 2, sby + sbh / 2);
      ctx.restore();
    }

    // Reset filter for HUD
    ctx.filter = 'none';

    // 2. Bottom HUD Bar
    if (hasBottomHud) {
      const hudY = frontH;
      const hudW = outW;

      // Dark Navy Gradient Background (matching PC version: rgb(17,21,28) -> rgb(10,12,16))
      const grad = ctx.createLinearGradient(0, hudY, 0, outH);
      grad.addColorStop(0, '#11151c');
      grad.addColorStop(1, '#0a0c10');
      ctx.fillStyle = grad;
      ctx.fillRect(0, hudY, hudW, bottomH);

      // Top separator line
      ctx.strokeStyle = '#3a3228';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
      ctx.beginPath();
      ctx.moveTo(0, hudY);
      ctx.lineTo(outW, hudY);
      ctx.stroke();

      // OpenStreetMap Minimap
      if (options.map && mapW > 0) {
        OpenStreetMapTileLoader.drawMinimap(ctx, 0, hudY, mapW, bottomH, telemetry.lat, telemetry.lon, telemetry.heading);

        // Right separator line of map
        ctx.strokeStyle = '#3a3228';
        ctx.beginPath();
        ctx.moveTo(mapW, hudY);
        ctx.lineTo(mapW, outH);
        ctx.stroke();
      }

      // Vertical alignment grid constants
      const hdrY = hudY + Math.round(16 * scale);
      const iconCenterY = hudY + Math.round(103 * scale);

      // Draw Header Dots and Titles
      const headerMeta: Record<string, [string, string]> = {
        speed: ['SPEED', '#ffc800'],
        pedal: ['PEDALS', '#82eb50'],
        steering: ['STEERING', '#ffd700'],
        turn_signal: ['BLINKER', '#78f03c'],
        timestamp: ['TIME', '#00e6ff'],
      };

      const dotR = Math.max(3, Math.round(4.2 * scale));

      for (const [k, [cx1]] of Object.entries(colBoxMap)) {
        if (k === 'fsd') continue;
        const [titleTxt, dotColor] = headerMeta[k] || [k.toUpperCase(), '#ffd700'];
        const dotCx = offsetX + cx1 + dotR;
        const dotCy = hdrY + Math.round(6 * scale);

        ctx.save();
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(dotCx, dotCy, dotR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ded4ca';
        ctx.font = `bold ${Math.round(16 * scale)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(titleTxt, dotCx + Math.round(9 * scale), dotCy);
        ctx.restore();
      }

      // FSD Dividers
      ctx.strokeStyle = '#483c32';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
      const divY1 = hudY + Math.round(16 * scale);
      const divY2 = outH - Math.round(24 * scale);
      for (const divX of fsdDividers) {
        ctx.beginPath();
        ctx.moveTo(offsetX + divX, divY1);
        ctx.lineTo(offsetX + divX, divY2);
        ctx.stroke();
      }

      // Highlight Dragging Column in Preview
      if (options.draggingCol && colBoxMap[options.draggingCol]) {
        const [dcx1, dcw] = colBoxMap[options.draggingCol];
        const padHl = Math.round(8 * scale);
        ctx.save();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = Math.max(1, Math.round(2 * scale));
        ctx.beginPath();
        ctx.roundRect(
          offsetX + Math.max(2, dcx1 - padHl),
          hudY + Math.round(8 * scale),
          dcw + padHl * 2,
          bottomH - Math.round(18 * scale),
          Math.round(8 * scale)
        );
        ctx.stroke();
        ctx.restore();
      }

      // 1. TIME Column (날짜 옐로우/골드 + 수평 분리선 + 큰 시각 화이트)
      if ('timestamp' in colBoxMap) {
        const [cx1] = colBoxMap.timestamp;
        const tPosX = offsetX + cx1;

        // Calculate accurate date/time using baseDateStr + currentTimeSec
        let dateStr = baseDateStr;
        let timeStr = '00:00:00';
        try {
          const parts = baseDateStr.split(' ');
          const datePart = parts[0] || '2026-10-07';
          const timePart = parts[1] || '00:00:00';
          const [yy, mo, dd] = datePart.split('-').map(Number);
          const [hh, mi, ss] = timePart.split(':').map(Number);
          const d = new Date(yy, (mo || 1) - 1, dd || 1, hh || 0, mi || 0, ss || 0);
          d.setSeconds(d.getSeconds() + currentTimeSec);

          dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        } catch {
          dateStr = baseDateStr;
        }

        ctx.save();
        // Date text
        ctx.fillStyle = '#f5ca73';
        ctx.font = `bold ${Math.round(21 * scale)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(dateStr, tPosX, hudY + Math.round(52 * scale));

        // Horizontal separator line
        ctx.strokeStyle = '#423830';
        ctx.lineWidth = Math.max(1, Math.round(1.2 * scale));
        ctx.beginPath();
        ctx.moveTo(tPosX, hudY + Math.round(84 * scale));
        ctx.lineTo(tPosX + Math.round(155 * scale), hudY + Math.round(84 * scale));
        ctx.stroke();

        // Time text (Large, white, bold)
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(33 * scale)}px monospace`;
        ctx.fillText(timeStr, tPosX, hudY + Math.round(94 * scale));

        // OpenStreetMap credit (time 밑 빈공간에 배경 박스 없이 옅은 회색으로 은은하게 텍스트만 배치)
        if (options.map) {
          ctx.fillStyle = 'rgba(165, 172, 182, 0.55)';
          ctx.font = `${Math.round(11 * scale)}px sans-serif`;
          ctx.fillText('Map: OpenStreetMap', tPosX, hudY + Math.round(145 * scale));
        }
        ctx.restore();
      }

      // 2. STEERING Column (중앙 정렬 휠 회전 이미지)
      if ('steering' in colBoxMap) {
        const [cx1] = colBoxMap.steering;
        const xWheel = offsetX + cx1 + Math.round(52 * scale);
        this.drawRotatedSteering(ctx, xWheel, iconCenterY, telemetry.steering_deg, scale, 96);
      }

      // 3. BLINKER Column (좌우 깜빡이 화살표)
      if ('turn_signal' in colBoxMap) {
        const [cx1] = colBoxMap.turn_signal;
        const xBlinker = offsetX + cx1 + Math.round(52 * scale);
        this.drawTurnSignals(ctx, xBlinker, iconCenterY, telemetry.left_blinker, telemetry.right_blinker, frameIdx, fps, scale * 0.96);
      }

      // 4. SPEED Column (상단 프로그레스 바 + 노란색 숫자와 km/h)
      if ('speed' in colBoxMap) {
        const [cx1] = colBoxMap.speed;
        const spdVal = Math.round(telemetry.speed_kmh);
        const barX1 = offsetX + cx1;
        const barW = Math.round(152 * scale);
        const barH = Math.max(4, Math.round(7 * scale));
        const barY1 = hudY + Math.round(62 * scale);
        const barR = Math.max(2, Math.round(3.5 * scale));

        ctx.save();
        // Progress track
        ctx.fillStyle = '#342922';
        ctx.beginPath();
        ctx.roundRect(barX1, barY1, barW, barH, barR);
        ctx.fill();

        // Progress fill (yellow)
        const spdPct = Math.max(0, Math.min(1.0, spdVal / 150.0));
        if (spdPct > 0.01) {
          ctx.fillStyle = '#0ae4ff'; // yellow-gold in BGR is #ffe40a
          ctx.fillStyle = '#ffe00a';
          ctx.beginPath();
          ctx.roundRect(barX1, barY1, Math.max(barR * 2, barW * spdPct), barH, barR);
          ctx.fill();
        }

        // Speed Number & Unit
        const spdStr = `${spdVal}`;
        ctx.fillStyle = '#ffe00a';
        ctx.font = `bold ${Math.round(48 * scale)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const numMetrics = ctx.measureText(spdStr);
        const sW = numMetrics.width;

        ctx.font = `600 ${Math.round(17 * scale)}px sans-serif`;
        const uMetrics = ctx.measureText('km/h');
        const uW = uMetrics.width;

        const gapSu = Math.round(7 * scale);
        const totalW = sW + gapSu + uW;
        const startX = barX1 + Math.max(0, Math.round((barW - totalW) / 2));
        const baselineY = hudY + Math.round(128 * scale);

        // Draw Number
        ctx.fillStyle = '#ffe00a';
        ctx.font = `bold ${Math.round(48 * scale)}px sans-serif`;
        ctx.fillText(spdStr, startX, baselineY);

        // Draw Unit
        ctx.fillStyle = '#d7cdc3';
        ctx.font = `600 ${Math.round(17 * scale)}px sans-serif`;
        ctx.fillText('km/h', startX + sW + gapSu, baselineY);
        ctx.restore();
      }

      // 5. PEDALS Column (가속 세로 게이지 + ACC % / BRK ON/OFF)
      if ('pedal' in colBoxMap) {
        const [cx1] = colBoxMap.pedal;
        const accPct = Math.min(100, Math.max(0, Math.round(telemetry.accel_pct)));
        const brkOn = telemetry.brake_applied || telemetry.brake_pct > 0;

        const barW = Math.round(22 * scale);
        const by1 = hudY + Math.round(58 * scale);
        const by2 = hudY + Math.round(138 * scale);
        const barH = by2 - by1;
        const bx1 = offsetX + cx1;
        const bx2 = bx1 + barW;
        const br = Math.max(4, Math.round(barW / 2));

        ctx.save();
        // Track
        ctx.fillStyle = '#16120e';
        ctx.strokeStyle = '#5f5246';
        ctx.lineWidth = Math.max(1, Math.round(1.3 * scale));
        ctx.beginPath();
        ctx.roundRect(bx1, by1, barW, barH, br);
        ctx.fill();
        ctx.stroke();

        // Ticks
        for (const tFrac of [0.25, 0.5, 0.75]) {
          const ty = Math.round(by1 + barH * tFrac);
          ctx.strokeStyle = '#64584c';
          ctx.beginPath();
          ctx.moveTo(bx2 + Math.round(2 * scale), ty);
          ctx.lineTo(bx2 + Math.round(6 * scale), ty);
          ctx.stroke();
        }

        // Accel fill (Green)
        if (accPct > 0) {
          const fh = Math.max(br * 2, Math.round((barH - 2) * (accPct / 100.0)));
          const fy1 = Math.max(by1 + 1, by2 - fh);
          ctx.fillStyle = '#6eeb00';
          ctx.beginPath();
          ctx.roundRect(bx1 + 1, fy1, barW - 2, by2 - fy1 - 1, Math.max(2, br - 1));
          ctx.fill();
        }

        // Labels
        const accTx = bx2 + Math.round(10 * scale);
        const brkX = offsetX + cx1 + Math.round(96 * scale);

        ctx.fillStyle = '#d7cdc3';
        ctx.font = `bold ${Math.round(14 * scale)}px sans-serif`;
        ctx.fillText('ACC', accTx, by1 + Math.round(16 * scale));
        ctx.fillText('BRK', brkX, by1 + Math.round(16 * scale));

        // Accel % Text
        const accStr = `${accPct}%`;
        ctx.fillStyle = accPct > 0 ? '#96ff50' : '#a59b91';
        ctx.font = `bold ${Math.round(19 * scale)}px sans-serif`;
        ctx.fillText(accStr, accTx, by2 - Math.round(4 * scale));

        // Brake Lamp Badge
        const lampW = Math.round(64 * scale);
        const lampH = Math.round(27 * scale);
        const lampY1 = by2 - lampH;
        const lampR = Math.max(4, Math.round(6 * scale));

        ctx.fillStyle = brkOn ? '#381cc3' : '#1e1814';
        ctx.strokeStyle = brkOn ? '#955aff' : '#4b4037';
        ctx.lineWidth = Math.max(1, Math.round(1.3 * scale));
        ctx.beginPath();
        ctx.roundRect(brkX, lampY1, lampW, lampH, lampR);
        ctx.fill();
        ctx.stroke();

        // Brake Dot & State Text
        const ldR = Math.max(2, Math.round(4 * scale));
        const ldCx = brkX + Math.round(14 * scale);
        const ldCy = lampY1 + lampH / 2;

        ctx.fillStyle = brkOn ? '#8c8cff' : '#5a5048';
        ctx.beginPath();
        ctx.arc(ldCx, ldCy, ldR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = brkOn ? '#ffffff' : '#9b9188';
        ctx.font = `bold ${Math.round(14 * scale)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(brkOn ? 'ON' : 'OFF', ldCx + Math.round(8 * scale), ldCy);
        ctx.restore();
      }

      // 6. FSD Mode Column (우측 끝 4단계 수직 목록)
      if ('fsd' in colBoxMap) {
        const [cx1] = colBoxMap.fsd;
        const fsdX = offsetX + cx1;
        const apRaw = telemetry.ap_mode || 'MANUAL';
        const activeKey = apRaw === 'FSD ACTIVE' ? 'FSD' : apRaw;

        const modesList = [
          { label: 'MANUAL', key: 'MANUAL', activeTxt: '#fcf8f8', activeDot: '#e1d7d7', activeBg: '#30363e', activeBd: '#919ba5' },
          { label: 'TACC', key: 'TACC', activeTxt: '#5acdef', activeDot: '#28b9ff', activeBg: '#14304a', activeBd: '#2dafef' },
          { label: 'AUTOPILOT', key: 'AUTOPILOT', activeTxt: '#64ffa5', activeDot: '#2df56e', activeBg: '#164222', activeBd: '#32eb73' },
          { label: 'FSD', key: 'FSD', activeTxt: '#50eeff', activeDot: '#00dcff', activeBg: '#0e384e', activeBd: '#00d2ff' },
        ];

        const startY = hdrY;
        const boxH = Math.round(27 * scale);
        const stepY = Math.round(31.5 * scale);
        const boxW = Math.round(145 * scale);
        const boxR = Math.max(3, Math.round(6 * scale));

        ctx.save();
        for (let i = 0; i < modesList.length; i++) {
          const item = modesList[i];
          const isAct = activeKey === item.key;
          const by1 = startY + Math.round(i * stepY);

          if (isAct) {
            ctx.fillStyle = item.activeBg;
            ctx.strokeStyle = item.activeBd;
            ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
            ctx.beginPath();
            ctx.roundRect(fsdX, by1, boxW, boxH, boxR);
            ctx.fill();
            ctx.stroke();
          }

          const dR = Math.max(2, Math.round((isAct ? 4.2 : 3.2) * scale));
          const dCx = fsdX + Math.round(12 * scale);
          const dCy = by1 + boxH / 2;

          ctx.fillStyle = isAct ? item.activeDot : '#5a5048';
          ctx.beginPath();
          ctx.arc(dCx, dCy, dR, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = isAct ? item.activeTxt : '#8c847a';
          ctx.font = `bold ${Math.round(18 * scale)}px sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.label, dCx + Math.round(10 * scale), dCy);
        }
        ctx.restore();
      }

      // 7. Brand QR Code (Bottom-Right of HUD)
      if (options.qr !== false) {
        const qrX1 = outW - qrPadR - qrPx;
        const qrY1 = hudY + Math.round(10 * scale);
        drawQRCode(ctx, qrX1, qrY1, qrPx);

        // Watermark text below QR code
        ctx.save();
        ctx.fillStyle = '#8a7c72';
        ctx.font = `600 ${Math.max(9, Math.round(11 * scale))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('CT Dashcam Studio', qrX1 + qrPx / 2, outH - Math.round(10 * scale));
        ctx.restore();
      }
    }

    // Brand QR Code when Bottom HUD is turned off
    if (!hasBottomHud && options.qr !== false) {
      const qx1 = outW - qrPadR - qrPx;
      const qy1 = outH - Math.round(28 * scale) - qrPx;

      ctx.save();
      // Semi-transparent dark card background over video
      ctx.fillStyle = 'rgba(8, 11, 16, 0.75)';
      ctx.beginPath();
      ctx.roundRect(
        qx1 - Math.round(6 * scale),
        qy1 - Math.round(6 * scale),
        qrPx + Math.round(12 * scale),
        qrPx + Math.round(26 * scale),
        Math.round(8 * scale)
      );
      ctx.fill();

      drawQRCode(ctx, qx1, qy1, qrPx);

      ctx.fillStyle = '#ded4ca';
      ctx.font = `600 ${Math.max(9, Math.round(11 * scale))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('CT Dashcam Studio', qx1 + qrPx / 2, qy1 + qrPx + Math.round(15 * scale));
      ctx.restore();
    }
  }
}
