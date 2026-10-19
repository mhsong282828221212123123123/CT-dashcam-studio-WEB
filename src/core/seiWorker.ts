// Web Worker for off-thread SEI telemetry parsing
import { RealTeslaSEIDecoder, BlobFileHandle, TelemetryData } from './seiDecoder';

export interface SeiWorkerRequest {
  type: 'parse';
  clipId: string;
  generation: number;
  file: File;
}

export interface SeiWorkerProgress {
  type: 'progress';
  clipId: string;
  generation: number;
  pct: number;
  parsedFrames: number;
  totalFrames: number;
}

export interface SeiWorkerComplete {
  type: 'complete';
  clipId: string;
  generation: number;
  entries: [number, TelemetryData][];
  maxSpeedKmh: number;
  hasSeiData: boolean;
}

export interface SeiWorkerError {
  type: 'error';
  clipId: string;
  generation: number;
  error: string;
}

export type SeiWorkerResponse = SeiWorkerProgress | SeiWorkerComplete | SeiWorkerError;

self.onmessage = async (e: MessageEvent<SeiWorkerRequest>) => {
  const data = e.data;
  if (!data || data.type !== 'parse') return;

  const { clipId, generation, file } = data;
  try {
    const decoder = new RealTeslaSEIDecoder();
    const handle = new BlobFileHandle(file);

    await decoder.parseMp4Sei(handle, (pct, parsedFrames, totalFrames) => {
      const msg: SeiWorkerProgress = {
        type: 'progress',
        clipId,
        generation,
        pct,
        parsedFrames,
        totalFrames,
      };
      self.postMessage(msg);
    });

    const completeMsg: SeiWorkerComplete = {
      type: 'complete',
      clipId,
      generation,
      entries: Array.from(decoder.telemetryCache.entries()),
      maxSpeedKmh: decoder.maxSpeedKmh,
      hasSeiData: decoder.hasSeiData,
    };
    self.postMessage(completeMsg);
  } catch (err: any) {
    const errMsg: SeiWorkerError = {
      type: 'error',
      clipId,
      generation,
      error: err?.message || String(err),
    };
    self.postMessage(errMsg);
  }
};
