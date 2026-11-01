import { describe, expect, it } from 'vitest';
import { parseVideoSampleTimes } from '../src/core/sampleTiming';
import { RealTeslaSEIDecoder, DEFAULT_TELEMETRY } from '../src/core/seiDecoder';

const bytes = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
  let offset=0; for (const p of parts) { out.set(p,offset); offset+=p.length; } return out;
};
const u32 = (...values: number[]) => {
  const out = new Uint8Array(values.length*4), view=new DataView(out.buffer);
  values.forEach((n,i)=>view.setUint32(i*4,n)); return out;
};
const atom = (type: string, ...parts: Uint8Array[]) => {
  const payload=bytes(...parts); return bytes(u32(payload.length+8),new TextEncoder().encode(type),payload);
};
function movie({runs=[[4,250]], offsets, edits, audioFirst=false, version=0}: {
  runs?: number[][]; offsets?: number[][]; edits?: number[][]; audioFirst?: boolean; version?: number;
}={}) {
  const header = version===1 ? bytes(u32(0x1000000,0,0,0,0,1000),new Uint8Array(8)) : u32(0,0,0,1000,10000);
  const table=atom('stbl',atom('stts',u32(0,runs.length,...runs.flat())),
    ...(offsets ? [atom('ctts',u32(0x1000000,offsets.length,...offsets.flat()))] : []));
  const track=(type: string)=>atom('trak',
    ...(edits ? [atom('edts',atom('elst',u32(0,edits.length,...edits.flatMap(([length,start])=>[length,start,0x10000]))))] : []),
    atom('mdia',atom('hdlr',u32(0,0),new TextEncoder().encode(type)),atom('mdhd',header),atom('minf',table)));
  return bytes(atom('mvhd',u32(0,0,0,1000,10000)),...(audioFirst?[track('soun')]:[]),track('vide'));
}

describe('per-clip MP4 presentation time mapping',()=>{
  it('reads the video track rather than an earlier audio track',()=>{
    expect(Array.from(parseVideoSampleTimes(movie({audioFirst:true}))!)).toEqual([0,.25,.5,.75]);
  });
  it('uses each clip local time instead of fixed 36fps or accumulated output time',()=>{
    const a=new RealTeslaSEIDecoder(), b=new RealTeslaSEIDecoder();
    a.setSampleTimes(parseVideoSampleTimes(movie({runs:[[30,100]]})));
    b.setSampleTimes(parseVideoSampleTimes(movie({runs:[[60,50]]})));
    expect(a.getFrameIndexAtTime(1)).toBe(10);
    expect(b.getFrameIndexAtTime(0)).toBe(0);
    expect(b.getFrameIndexAtTime(1)).toBe(20);
    a.telemetryCache.set(10,{...DEFAULT_TELEMETRY,speed_kmh:50});
    b.telemetryCache.set(20,{...DEFAULT_TELEMETRY,speed_kmh:100});
    a.hasSeiData=b.hasSeiData=true;
    expect(a.getFrameTelemetry(a.getFrameIndexAtTime(1)).speed_kmh).toBe(50);
    expect(b.getFrameTelemetry(b.getFrameIndexAtTime(1)).speed_kmh).toBe(100);
  });
  it('supports variable frame spacing and selects the displayed frame, not the next frame',()=>{
    const d=new RealTeslaSEIDecoder();
    d.setSampleTimes(parseVideoSampleTimes(movie({runs:[[2,100],[2,500]]})));
    expect(Array.from(d.sampleTimesSec!)).toEqual([0,.1,.2,.7]);
    expect(d.getFrameIndexAtTime(.65)).toBe(2);
    expect(d.getFrameIndexAtTime(.7)).toBe(3);
    expect(d.getFrameIndexAtTime(5)).toBe(3);
  });
  it('maps composition order back to original sample indices',()=>{
    const d=new RealTeslaSEIDecoder();
    d.setSampleTimes(parseVideoSampleTimes(movie({runs:[[3,100]],offsets:[[1,0],[1,100],[1,-100]]})));
    expect(d.getFrameIndexAtTime(.1)).toBe(2);
    expect(d.getFrameIndexAtTime(.2)).toBe(1);
  });
  it('accounts for media start offsets and empty edits',()=>{
    expect(Array.from(parseVideoSampleTimes(movie({edits:[[100,-1],[900,250]]}))!)).toEqual([-.15,.1,.35,.6]);
  });
  it('supports version 1 media time headers',()=>{
    expect(Array.from(parseVideoSampleTimes(movie({version:1}))!)).toEqual([0,.25,.5,.75]);
  });
  it('preserves timing through worker structured-clone reconstruction',()=>{
    const times=parseVideoSampleTimes(movie());
    const d=new RealTeslaSEIDecoder();d.setSampleTimes(structuredClone(times));
    expect(d.getFrameIndexAtTime(.5)).toBe(2);
  });
  it('rejects corrupt or excessive timing tables without crashing the decoder',()=>{
    expect(parseVideoSampleTimes(new Uint8Array(9))).toBeNull();
    expect(parseVideoSampleTimes(movie({runs:[[500001,1]]}))).toBeNull();
    expect(parseVideoSampleTimes(movie({runs:[[5,0]]}))).toBeNull();
    const d=new RealTeslaSEIDecoder();d.setSampleTimes(null);
    expect(d.getFrameIndexAtTime(.5)).toBe(18);
  });
});
