import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { BlobFileHandle, DEFAULT_TELEMETRY, RealTeslaSEIDecoder } from '../src/core/seiDecoder';

it.each([24,30])('reads real %sfps MP4 sample timestamps through both decoder paths',async fps=>{
  const bytes=readFileSync(new URL(`./fixtures/timing-${fps}fps.mp4`,import.meta.url));
  const fast=new RealTeslaSEIDecoder();fast.parseMp4Buffer(bytes);
  const streaming=new RealTeslaSEIDecoder();
  await streaming.parseMp4SeiSampleTable(new BlobFileHandle(new Blob([bytes])));
  for(const decoder of [fast,streaming]) {
    expect(decoder.sampleTimesSec?.length).toBe(fps);
    expect(decoder.getFrameIndexAtTime(.5)).toBe(fps/2);
    expect(decoder.getFrameIndexAtTime(0)).toBe(0);
    decoder.telemetryCache.set(fps/2,{...DEFAULT_TELEMETRY,speed_kmh:fps});
    decoder.hasSeiData=true;
    expect(decoder.getFrameTelemetry(decoder.getFrameIndexAtTime(.5)).speed_kmh).toBe(fps);
  }
});
