// ISO BMFF sample timestamps, in the HTML video's local presentation timeline.
// No preceding clip duration or wall-clock gap participates in this mapping.
export function parseVideoSampleTimes(data: Uint8Array): Float64Array | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    type Box = { type: string; start: number; end: number };
    const boxes = (start: number, end: number): Box[] => {
      const result: Box[] = [];
      for (let p = start; p + 8 <= end;) {
        let size = view.getUint32(p);
        let header = 8;
        if (size === 1) { size = Number(view.getBigUint64(p + 8)); header = 16; }
        if (size === 0) size = end - p;
        if (!Number.isSafeInteger(size) || size < header || p + size > end) throw new Error('Invalid MP4 box');
        const type = String.fromCharCode(...data.subarray(p + 4, p + 8));
        result.push({ type, start: p + header, end: p + size });
        p += size;
      }
      return result;
    };
    const child = (box: Box, type: string) => boxes(box.start, box.end).find(b => b.type === type);
    const need = (box: Box | undefined): Box => { if (!box) throw new Error('Missing timing box'); return box; };
    const readScale = (box: Box) => {
      const version = view.getUint8(box.start);
      if (version > 1) throw new Error('Unsupported time header');
      const scale = view.getUint32(box.start + (version === 1 ? 20 : 12));
      if (!scale) throw new Error('Invalid timescale');
      return scale;
    };
    // Callers pass the moov payload, not the media data.
    const movie: Box = { type: 'moov', start: 0, end: data.length };
    const track = boxes(0, data.length).find(box => {
      if (box.type !== 'trak') return false;
      const media = child(box, 'mdia');
      const handler = media && child(media, 'hdlr');
      return handler && String.fromCharCode(...data.subarray(handler.start + 8, handler.start + 12)) === 'vide';
    });
    const media = need(child(need(track), 'mdia'));
    const scale = readScale(need(child(media, 'mdhd')));
    const table = need(child(need(child(media, 'minf')), 'stbl'));
    const stts = need(child(table, 'stts'));
    const runs = view.getUint32(stts.start + 4);
    if (stts.start + 8 + runs * 8 > stts.end) return null;
    let count = 0;
    for (let i = 0; i < runs; i++) count += view.getUint32(stts.start + 8 + i * 8);
    if (count <= 0 || count > 500000) return null;
    const times = new Float64Array(count);
    let index = 0, ticks = 0;
    for (let i = 0; i < runs; i++) {
      const n = view.getUint32(stts.start + 8 + i * 8);
      const delta = view.getUint32(stts.start + 12 + i * 8);
      if (!delta) return null;
      for (let j = 0; j < n; j++) { times[index++] = ticks / scale; ticks += delta; }
    }
    const ctts = child(table, 'ctts');
    if (ctts) {
      const version = view.getUint8(ctts.start);
      const entries = view.getUint32(ctts.start + 4);
      if (version > 1 || ctts.start + 8 + entries * 8 > ctts.end) return null;
      index = 0;
      for (let i = 0; i < entries; i++) {
        const n = view.getUint32(ctts.start + 8 + i * 8);
        const offset = version === 1 ? view.getInt32(ctts.start + 12 + i * 8) : view.getUint32(ctts.start + 12 + i * 8);
        if (index + n > count) return null;
        for (let j = 0; j < n; j++) times[index++] += offset / scale;
      }
      if (index !== count) return null;
    }
    const edits = child(need(track), 'edts');
    const elst = edits && child(edits, 'elst');
    if (elst) {
      const movieScale = readScale(need(child(movie, 'mvhd')));
      const version = view.getUint8(elst.start);
      const entries = view.getUint32(elst.start + 4);
      const width = version === 1 ? 20 : 12;
      if (version > 1 || elst.start + 8 + entries * width > elst.end) return null;
      let emptySeconds = 0, mediaStart: number | null = null;
      for (let i = 0; i < entries; i++) {
        const p = elst.start + 8 + i * width;
        const length = version === 1 ? Number(view.getBigUint64(p)) : view.getUint32(p);
        const time = version === 1 ? Number(view.getBigInt64(p + 8)) : view.getInt32(p + 4);
        const rate = view.getUint32(p + width - 4);
        if (rate !== 0x10000 || mediaStart !== null) return null;
        if (time === -1) emptySeconds += length / movieScale;
        else if (time >= 0) mediaStart = time / scale;
        else return null;
      }
      if (mediaStart === null) return null;
      for (let i = 0; i < count; i++) times[i] += emptySeconds - mediaStart;
    }
    return times;
  } catch { return null; }
}
