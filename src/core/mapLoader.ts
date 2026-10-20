// Ported from core/map_loader.py (OpenStreetMapTileLoader)
import { i18n } from './i18n';

export class OpenStreetMapTileLoader {
  private static tileCache: Map<string, HTMLImageElement> = new Map();
  private static pendingFetches: Map<string, Promise<HTMLImageElement | null>> = new Map();

  static latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
    const latRad = (lat * Math.PI) / 180;
    const n = Math.pow(2, zoom);
    const x = ((lon + 180) / 360) * n;
    const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;
    return { x, y };
  }

  static async getTile(zoom: number, tileX: number, tileY: number): Promise<HTMLImageElement | null> {
    const key = `${zoom}/${tileX}/${tileY}`;
    if (this.tileCache.has(key)) {
      return this.tileCache.get(key)!;
    }
    if (this.pendingFetches.has(key)) {
      return this.pendingFetches.get(key)!;
    }

    const fetchPromise = (async () => {
      try {
        const url = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Tile load error"));
          img.src = url;
        });
        this.tileCache.set(key, img);
        return img;
      } catch {
        return null;
      } finally {
        this.pendingFetches.delete(key);
      }
    })();

    this.pendingFetches.set(key, fetchPromise);
    return fetchPromise;
  }

  static drawMinimap(
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    lat: number,
    lon: number,
    heading: number,
    zoom = 16
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();

    // Dark background
    ctx.fillStyle = "#161b22";
    ctx.fillRect(dx, dy, dw, dh);

    if (lat === 0 && lon === 0) {
      ctx.fillStyle = "#6e7681";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(i18n.t('map_no_gps'), dx + dw / 2, dy + dh / 2);
      ctx.restore();
      return;
    }

    const { x: exactTileX, y: exactTileY } = this.latLonToTile(lat, lon, zoom);
    const centerTileX = Math.floor(exactTileX);
    const centerTileY = Math.floor(exactTileY);
    const subOffsetX = (exactTileX - centerTileX) * 256;
    const subOffsetY = (exactTileY - centerTileY) * 256;

    const centerX = dx + dw / 2;
    const centerY = dy + dh / 2;

    // Draw 3x3 tiles surrounding the center
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const tx = centerTileX + ox;
        const ty = centerTileY + oy;
        const posX = centerX + ox * 256 - subOffsetX;
        const posY = centerY + oy * 256 - subOffsetY;

        const key = `${zoom}/${tx}/${ty}`;
        const cachedImg = this.tileCache.get(key);
        if (cachedImg) {
          ctx.drawImage(cachedImg, posX, posY, 256, 256);
        } else {
          // Trigger async load for future frames
          this.getTile(zoom, tx, ty);
        }
      }
    }

    // Vehicle Top-View Red Tesla Car Marker (matching PC reference UI)
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((heading * Math.PI) / 180);

    // Car Body Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.roundRect(-9, -17, 18, 36, 5);
    ctx.fill();

    // Red Car Body
    ctx.fillStyle = "#d32f2f";
    ctx.strokeStyle = "#801313";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-8, -16, 16, 34, 4);
    ctx.fill();
    ctx.stroke();

    // Windshield (Front dark glass)
    ctx.fillStyle = "#1e2430";
    ctx.beginPath();
    ctx.roundRect(-6, -11, 12, 7, 2);
    ctx.fill();

    // Panoramic Tinted Glass Roof
    ctx.fillStyle = "#11141a";
    ctx.beginPath();
    ctx.roundRect(-5.5, -3, 11, 11, 1);
    ctx.fill();

    // Rear Windshield
    ctx.fillStyle = "#1e2430";
    ctx.beginPath();
    ctx.roundRect(-5.5, 9, 11, 4, 1);
    ctx.fill();

    // Headlights (White/Ice Blue)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-7, -16, 3, 2);
    ctx.fillRect(4, -16, 3, 2);

    // Taillights (Bright Red Line)
    ctx.fillStyle = "#ff1744";
    ctx.fillRect(-6.5, 17, 13, 1.5);

    ctx.restore();

    // Watermark badge
    ctx.fillStyle = "rgba(22, 18, 15, 0.85)";
    ctx.strokeStyle = "rgba(95, 82, 70, 0.8)";
    ctx.lineWidth = 1;
    const badgeW = 120;
    const badgeH = 20;
    const bx = dx + 8;
    const by = dy + dh - badgeH - 8;
    ctx.fillRect(bx, by, badgeW, badgeH);
    ctx.strokeRect(bx, by, badgeW, badgeH);

    ctx.fillStyle = "#f0e8dc";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Map: OpenStreetMap", bx + 6, by + badgeH / 2);

    ctx.restore();
  }
}
