// Ported from core/decoder.py (RealTeslaSEIDecoder)

export interface TelemetryData {
  speed_kmh: number;
  steering_deg: number;
  accel_pct: number;
  brake_applied: boolean;
  brake_pct: number;
  ap_mode: "MANUAL" | "FSD ACTIVE" | "AUTOPILOT" | "TACC" | string;
  left_blinker: boolean;
  right_blinker: boolean;
  lat: number;
  lon: number;
  heading: number;
}

export const DEFAULT_TELEMETRY: TelemetryData = {
  speed_kmh: 0,
  steering_deg: 0,
  accel_pct: 0,
  brake_applied: false,
  brake_pct: 0,
  ap_mode: "MANUAL",
  left_blinker: false,
  right_blinker: false,
  lat: 0.0,
  lon: 0.0,
  heading: 0.0,
};

export interface AsyncFileHandle {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export class BlobFileHandle implements AsyncFileHandle {
  constructor(private blob: Blob) {
    this.size = blob.size;
  }
  size: number;
  async read(offset: number, length: number): Promise<Uint8Array> {
    const end = Math.min(this.size, offset + length);
    if (offset >= end) return new Uint8Array(0);
    const slice = this.blob.slice(offset, end);
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  }
}

class BufferedChunkReader {
  private file: AsyncFileHandle;
  private diskPos: number;
  private limitPos: number;
  private buffer: Uint8Array = new Uint8Array(0);
  private cursor: number = 0;
  private readonly chunkSize: number = 1024 * 1024 * 2; // 2MB read chunks

  constructor(file: AsyncFileHandle, startPos: number, limitPos: number) {
    this.file = file;
    this.diskPos = startPos;
    this.limitPos = limitPos;
  }

  private async fill(minRequired: number): Promise<boolean> {
    const available = this.buffer.length - this.cursor;
    if (available >= minRequired) return true;

    // Compact buffer if needed
    let remaining: Uint8Array;
    if (this.cursor > 0 && available > 0) {
      remaining = this.buffer.subarray(this.cursor);
    } else if (available === 0) {
      remaining = new Uint8Array(0);
    } else {
      remaining = this.buffer;
    }
    this.cursor = 0;

    const toRead = Math.min(
      Math.max(this.chunkSize, minRequired - remaining.length),
      this.limitPos - this.diskPos
    );

    if (toRead <= 0) {
      this.buffer = remaining;
      return remaining.length >= minRequired;
    }

    const chunk = await this.file.read(this.diskPos, toRead);
    this.diskPos += chunk.length;

    const newBuf = new Uint8Array(remaining.length + chunk.length);
    newBuf.set(remaining, 0);
    newBuf.set(chunk, remaining.length);
    this.buffer = newBuf;

    return this.buffer.length >= minRequired;
  }

  async readUint32(): Promise<number | null> {
    if (!(await this.fill(4))) return null;
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.cursor, 4);
    const val = view.getUint32(0, false);
    this.cursor += 4;
    return val;
  }

  async skip(count: number): Promise<boolean> {
    const available = this.buffer.length - this.cursor;
    if (count <= available) {
      this.cursor += count;
      return true;
    }

    const remainingToSkip = count - available;
    this.buffer = new Uint8Array(0);
    this.cursor = 0;

    if (this.diskPos + remainingToSkip > this.limitPos) {
      this.diskPos = this.limitPos;
      return false;
    }
    this.diskPos += remainingToSkip;
    return true;
  }

  async readExact(count: number): Promise<Uint8Array | null> {
    if (!(await this.fill(count))) return null;
    const slice = this.buffer.subarray(this.cursor, this.cursor + count);
    this.cursor += count;
    return slice;
  }
}

export class RealTeslaSEIDecoder {
  telemetryCache: Map<number, TelemetryData> = new Map();
  sortedKeys: number[] = [];
  hasSeiData = false;
  maxSpeedKmh = 0;

  static stripEmulationPreventionBytes(data: Uint8Array): Uint8Array {
    const stripped: number[] = [];
    let zeroCount = 0;
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      if (zeroCount >= 2 && byte === 0x03) {
        zeroCount = 0;
        continue;
      }
      stripped.push(byte);
      zeroCount = byte === 0 ? zeroCount + 1 : 0;
    }
    return new Uint8Array(stripped);
  }

  static extractProtoPayload(nal: Uint8Array): Uint8Array | null {
    if (!nal || nal.length < 2) return null;
    for (let i = 3; i < nal.length - 1; i++) {
      const byte = nal[i];
      if (byte === 0x42) continue;
      if (byte === 0x69) {
        if (i > 2) {
          // slice from i+1 to end-1
          const sub = nal.subarray(i + 1, nal.length - 1);
          return RealTeslaSEIDecoder.stripEmulationPreventionBytes(sub);
        }
        break;
      }
      break;
    }
    return null;
  }

  static parseProtobufWire(payload: Uint8Array): TelemetryData | null {
    let pos = 0;
    const length = payload.length;
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

    let speed_mps = 0.0;
    let accel_pct = 0.0;
    let steering_deg = 0.0;
    let brake_applied = false;
    let autopilot_state = 0;
    let left_blinker = false;
    let right_blinker = false;
    let lat_deg = 0.0;
    let lon_deg = 0.0;
    let heading_deg = 0.0;

    while (pos < length) {
      try {
        let shift = 0;
        let tag = 0;
        while (true) {
          if (pos >= length) break;
          const b = payload[pos++];
          tag |= (b & 0x7f) << shift;
          if (!(b & 0x80)) break;
          shift += 7;
        }

        const fieldNumber = tag >>> 3;
        const wireType = tag & 0x07;

        if (wireType === 0) {
          // Varint
          let s = 0;
          let val = 0;
          while (true) {
            if (pos >= length) break;
            const b = payload[pos++];
            val |= (b & 0x7f) << s;
            if (!(b & 0x80)) break;
            s += 7;
          }

          if (fieldNumber === 7) left_blinker = Boolean(val);
          else if (fieldNumber === 8) right_blinker = Boolean(val);
          else if (fieldNumber === 9) brake_applied = Boolean(val);
          else if (fieldNumber === 10) autopilot_state = val;
        } else if (wireType === 5) {
          // 32-bit float little-endian
          if (pos + 4 > length) break;
          const valFloat = view.getFloat32(pos, true);
          pos += 4;
          if (fieldNumber === 4) speed_mps = valFloat;
          else if (fieldNumber === 5) accel_pct = valFloat;
          else if (fieldNumber === 6) steering_deg = valFloat;
        } else if (wireType === 1) {
          // 64-bit double little-endian
          if (pos + 8 > length) break;
          const valDouble = view.getFloat64(pos, true);
          pos += 8;
          if (fieldNumber === 11 && valDouble >= -90.0 && valDouble <= 90.0) {
            lat_deg = valDouble;
          } else if (fieldNumber === 12 && valDouble >= -180.0 && valDouble <= 180.0) {
            lon_deg = valDouble;
          } else if (fieldNumber === 13 && valDouble >= 0.0 && valDouble <= 360.0) {
            heading_deg = valDouble;
          }
        } else if (wireType === 2) {
          // Length-delimited
          let s = 0;
          let subLen = 0;
          while (true) {
            if (pos >= length) break;
            const b = payload[pos++];
            subLen |= (b & 0x7f) << s;
            if (!(b & 0x80)) break;
            s += 7;
          }
          pos += subLen;
        } else {
          pos += 1;
        }
      } catch {
        pos += 1;
      }
    }

    if (isNaN(speed_mps)) {
      speed_mps = 0.0;
    }

    const speed_kmh = Math.max(0, Math.round(speed_mps * 3.6));
    const apModes: Record<number, string> = {
      0: "MANUAL",
      1: "FSD ACTIVE",
      2: "AUTOPILOT",
      3: "TACC",
    };
    const ap_mode = (apModes[autopilot_state] || "MANUAL") as TelemetryData["ap_mode"];

    return {
      speed_kmh,
      steering_deg: Math.round(steering_deg),
      accel_pct: Math.min(100, Math.max(0, Math.round(accel_pct))),
      brake_applied,
      brake_pct: brake_applied ? 100 : 0,
      ap_mode,
      left_blinker,
      right_blinker,
      lat: lat_deg,
      lon: lon_deg,
      heading: heading_deg,
    };
  }

  static async findMdat(file: AsyncFileHandle): Promise<{ offset: number; size: number } | null> {
    let pos = 0;
    while (pos < file.size) {
      const readLen = Math.min(16, file.size - pos);
      if (readLen < 8) break;
      const chunk = await file.read(pos, readLen);
      if (chunk.length < 8) break;

      const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      const size32 = view.getUint32(0, false);
      const atomType = String.fromCharCode(chunk[4], chunk[5], chunk[6], chunk[7]);

      let headerSize = 8;
      let size = size32 - 8;

      if (size32 === 1) {
        if (chunk.length < 16) break;
        // 64-bit size
        const high = view.getUint32(8, false);
        const low = view.getUint32(12, false);
        const size64 = (BigInt(high) << 32n) | BigInt(low);
        size = Number(size64 - 16n);
        headerSize = 16;
      } else if (size32 === 0) {
        // extends to end of file
        size = file.size - (pos + 8);
      }

      if (atomType === "mdat") {
        return { offset: pos + headerSize, size };
      }

      pos += headerSize + Math.max(0, size);
    }
    return null;
  }

  async parseMp4Sei(file: AsyncFileHandle): Promise<void> {
    const mdat = await RealTeslaSEIDecoder.findMdat(file);
    if (!mdat) return;

    const mdatEnd = mdat.size > 0 ? mdat.offset + mdat.size : file.size;
    const reader = new BufferedChunkReader(file, mdat.offset, mdatEnd);

    let frameNo = 0;
    let lastValid: TelemetryData | null = null;

    while (true) {
      const nalSize = await reader.readUint32();
      if (nalSize === null) break;

      if (nalSize < 2) {
        if (!(await reader.skip(nalSize))) break;
        continue;
      }

      const nal = await reader.readExact(nalSize);
      if (!nal) break;

      const nalType = nal[0] & 0x1f;
      if (nalType === 6) {
        // NAL_ID_SEI
        const payload = RealTeslaSEIDecoder.extractProtoPayload(nal);
        if (payload) {
          const parsed = RealTeslaSEIDecoder.parseProtobufWire(payload);
          if (parsed) {
            lastValid = parsed;
            this.telemetryCache.set(frameNo, parsed);
            this.hasSeiData = true;
            if (parsed.speed_kmh > this.maxSpeedKmh) {
              this.maxSpeedKmh = parsed.speed_kmh;
            }
          } else if (lastValid) {
            this.telemetryCache.set(frameNo, { ...lastValid });
          }
        }
        frameNo++;
      }
    }

    this.sortedKeys = Array.from(this.telemetryCache.keys()).sort((a, b) => a - b);
  }

  getFrameTelemetry(frameIdx: number): TelemetryData {
    if (this.hasSeiData && this.telemetryCache.has(frameIdx)) {
      return this.telemetryCache.get(frameIdx)!;
    }

    if (this.hasSeiData && this.sortedKeys.length > 0) {
      const keys = this.sortedKeys;
      let low = 0;
      let high = keys.length - 1;

      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (keys[mid] === frameIdx) return this.telemetryCache.get(keys[mid])!;
        if (keys[mid] < frameIdx) low = mid + 1;
        else high = mid - 1;
      }

      const pos = low;
      let closestIdx = keys[0];
      if (pos >= keys.length) {
        closestIdx = keys[keys.length - 1];
      } else if (pos === 0) {
        closestIdx = keys[0];
      } else {
        const before = keys[pos - 1];
        const after = keys[pos];
        closestIdx = frameIdx - before <= after - frameIdx ? before : after;
      }
      return this.telemetryCache.get(closestIdx) || DEFAULT_TELEMETRY;
    }

    return DEFAULT_TELEMETRY;
  }

  static async quickCheckIsParking(file: AsyncFileHandle): Promise<boolean> {
    try {
      const mdat = await RealTeslaSEIDecoder.findMdat(file);
      if (!mdat) return false;

      const mdatLen = mdat.size > 0 ? mdat.size : file.size - mdat.offset;
      if (mdatLen <= 0) return true;

      const chunkSize = 65536;
      const sampleRatios = [0.0, 0.25, 0.5, 0.75, 0.9];
      const sampleOffsets = sampleRatios.map((r) => mdat.offset + Math.floor(mdatLen * r));

      let maxSpeed = 0;
      let hasGps = false;
      let foundSei = false;

      for (const sOff of sampleOffsets) {
        const buf = await file.read(sOff, chunkSize);
        if (!buf || buf.length === 0) continue;

        let pos = 0;
        const bufLen = buf.length;
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

        while (pos < bufLen - 4) {
          const nalSize = view.getUint32(pos, false);
          pos += 4;
          if (nalSize < 2 || pos + nalSize > bufLen) break;

          if ((buf[pos] & 0x1f) === 6) {
            const peek = buf.subarray(pos, pos + Math.min(nalSize, 256));
            const payload = RealTeslaSEIDecoder.extractProtoPayload(peek);
            if (payload) {
              const telemetry = RealTeslaSEIDecoder.parseProtobufWire(payload);
              if (telemetry) {
                foundSei = true;
                const spd = telemetry.speed_kmh;
                if (spd > maxSpeed) maxSpeed = spd;
                if (telemetry.lat !== 0 || telemetry.lon !== 0) hasGps = true;
                if (spd > 5 || telemetry.ap_mode !== "MANUAL") {
                  return false;
                }
              }
            }
          }
          pos += nalSize;
        }
      }

      if (!foundSei || !hasGps) return true;
      return maxSpeed <= 3;
    } catch {
      return false;
    }
  }
}
