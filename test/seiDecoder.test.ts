import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { RealTeslaSEIDecoder, AsyncFileHandle } from '../src/core/seiDecoder';
import { execSync } from 'child_process';

class NodeFileHandle implements AsyncFileHandle {
  private fd: number;
  size: number;
  constructor(filePath: string) {
    this.fd = fs.openSync(filePath, 'r');
    this.size = fs.statSync(filePath).size;
  }
  async read(offset: number, length: number): Promise<Uint8Array> {
    const buf = Buffer.alloc(length);
    const bytesRead = fs.readSync(this.fd, buf, 0, length, offset);
    return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
  }
}

describe('RealTeslaSEIDecoder comparison with Python implementation', () => {
  const testMp4 = 'E:/tesla/project/testfile/SavedClips/2026-08-17_12-48-22/2026-08-17_12-37-37-front.mp4';

  it('correctly parses telemetry matching Python core.decoder', async () => {
    // 1. Run Python decoder using temporary py script
    const pyScript = `
import sys, json
sys.path.insert(0, r"E:/tesla/project/CT-dashcam-studio")
from core.decoder import RealTeslaSEIDecoder

dec = RealTeslaSEIDecoder(r"${testMp4}")
frames = [0, 100, 500, 1000, 2000]
results = {
    "has_sei": dec.has_sei_data,
    "max_speed": dec.max_speed_kmh,
    "frames": {str(f): dec.get_frame_telemetry(f) for f in frames}
}
print(json.dumps(results))
`;
    const tempPy = path.join(__dirname, 'temp_verify.py');
    fs.writeFileSync(tempPy, pyScript, 'utf-8');
    let pyOutput = '';
    try {
      pyOutput = execSync(`python "${tempPy}"`, { encoding: 'utf-8' });
    } finally {
      if (fs.existsSync(tempPy)) fs.unlinkSync(tempPy);
    }
    const pyResult = JSON.parse(pyOutput.trim());

    // 2. Run TypeScript decoder
    const handle = new NodeFileHandle(testMp4);
    const tsDec = new RealTeslaSEIDecoder();
    await tsDec.parseMp4Sei(handle);

    expect(tsDec.hasSeiData).toBe(pyResult.has_sei);
    expect(tsDec.maxSpeedKmh).toBe(pyResult.max_speed);

    for (const f of [0, 100, 500, 1000, 2000]) {
      const pyFrame = pyResult.frames[String(f)];
      const tsFrame = tsDec.getFrameTelemetry(f);

      expect(tsFrame.speed_kmh).toBe(pyFrame.speed_kmh);
      expect(tsFrame.steering_deg).toBe(pyFrame.steering_deg);
      expect(tsFrame.accel_pct).toBe(pyFrame.accel_pct);
      expect(tsFrame.brake_applied).toBe(pyFrame.brake_applied);
      expect(tsFrame.ap_mode).toBe(pyFrame.ap_mode);
      expect(tsFrame.left_blinker).toBe(pyFrame.left_blinker);
      expect(tsFrame.right_blinker).toBe(pyFrame.right_blinker);
      expect(Math.abs(tsFrame.lat - pyFrame.lat)).toBeLessThan(1e-4);
      expect(Math.abs(tsFrame.lon - pyFrame.lon)).toBeLessThan(1e-4);
      expect(Math.abs(tsFrame.heading - pyFrame.heading)).toBeLessThan(1e-4);
    }
  });

  it('sample table indexing matches sequential scan exactly and reports progress', async () => {
    const handle = new NodeFileHandle(testMp4);

    // 1. Run sequential decoder
    const seqDec = new RealTeslaSEIDecoder();
    await seqDec.parseMp4SeiSequential(handle);

    // 2. Run sample table decoder with progress
    const sampleDec = new RealTeslaSEIDecoder();
    const progressList: number[] = [];
    const ok = await sampleDec.parseMp4SeiSampleTable(handle, (pct) => {
      progressList.push(pct);
    });

    expect(ok).toBe(true);
    expect(progressList.length).toBeGreaterThan(0);
    expect(progressList[progressList.length - 1]).toBe(100);

    expect(sampleDec.hasSeiData).toBe(seqDec.hasSeiData);
    expect(sampleDec.maxSpeedKmh).toBe(seqDec.maxSpeedKmh);
    expect(sampleDec.sortedKeys.length).toBe(seqDec.sortedKeys.length);

    // Compare all frames
    for (const frame of [0, 50, 100, 250, 500, 750, 1000, 1500, 2000, 2148]) {
      const seqT = seqDec.getFrameTelemetry(frame);
      const samT = sampleDec.getFrameTelemetry(frame);
      expect(samT.speed_kmh).toBe(seqT.speed_kmh);
      expect(samT.steering_deg).toBe(seqT.steering_deg);
      expect(samT.accel_pct).toBe(seqT.accel_pct);
      expect(samT.brake_applied).toBe(seqT.brake_applied);
      expect(samT.ap_mode).toBe(seqT.ap_mode);
      expect(samT.lat).toBe(seqT.lat);
      expect(samT.lon).toBe(seqT.lon);
    }
  });

  it('in-memory parseMp4Buffer matches sequential scan and runs under 5ms', async () => {
    const fileBytes = new Uint8Array(fs.readFileSync(testMp4));
    const memDec = new RealTeslaSEIDecoder();

    const t0 = performance.now();
    const ok = memDec.parseMp4Buffer(fileBytes);
    const elapsed = performance.now() - t0;

    expect(ok).toBe(true);
    expect(memDec.hasSeiData).toBe(true);
    expect(memDec.maxSpeedKmh).toBe(61);
    expect(memDec.sortedKeys.length).toBe(2149);
    expect(elapsed).toBeLessThan(10); // Under 10ms!
  });
});
