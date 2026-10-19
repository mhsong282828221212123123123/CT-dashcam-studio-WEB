// Ported & adapted from core/exporter.py (ExportWorker) using WebCodecs + mp4-muxer
import * as Mp4Muxer from 'mp4-muxer';
import { OverlayRenderer, RenderOptions } from './renderer';
import { RealTeslaSEIDecoder, TelemetryData } from './seiDecoder';
import { RESOLUTIONS, CameraKey } from './constants';
import { ClipItem } from './clipScanner';

export interface ExportClipSegment {
  clip: ClipItem;
  startSec: number;
  endSec: number;
  baseTimeStr: string;
}

export interface MultiClipExportConfig {
  segments: ExportClipSegment[];
  getClipDecoder: (clip: ClipItem) => Promise<RealTeslaSEIDecoder | null>;
  sourceFps: number;
  targetFps: number;
  exportSpeed: number;
  resolutionName: keyof typeof RESOLUTIONS;
  options: RenderOptions;
  onProgress: (percent: number, currentSegmentIdx: number, totalSegments: number) => void;
}

export class WebCodecsExporter {
  private isCancelled = false;

  cancel(): void {
    this.isCancelled = true;
  }

  async exportMultiClip(config: MultiClipExportConfig): Promise<Blob> {
    this.isCancelled = false;
    const resConfig = RESOLUTIONS[config.resolutionName] || RESOLUTIONS["FHD (1920x1080) - 권장 표준"];
    const [targetW, targetH] = resConfig.size;
    const bitrateBps = Math.round(resConfig.bitrate_mbps * 1_000_000);

    // Render canvas setup
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetW;
    exportCanvas.height = targetH;

    // mp4-muxer setup
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: targetW,
        height: targetH,
      },
      fastStart: 'in-memory',
    });

    let videoEncoder: VideoEncoder | null = null;

    try {
      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta);
        },
        error: (e) => {
          console.error("VideoEncoder error:", e);
        },
      });

      // H.264 High Profile configuration
      videoEncoder.configure({
        codec: 'avc1.640028', // H.264 High profile Level 4.0
        width: targetW,
        height: targetH,
        bitrate: bitrateBps,
        framerate: config.targetFps,
      });

      const frameStepSec = (1.0 / config.targetFps) * config.exportSpeed;
      const totalSourceSec = config.segments.reduce(
        (sum, seg) => sum + Math.max(0.01, seg.endSec - seg.startSec),
        0
      );
      const totalFrames = Math.max(1, Math.ceil(totalSourceSec / frameStepSec));

      let outputFrameCount = 0;

      for (let segIdx = 0; segIdx < config.segments.length; segIdx++) {
        if (this.isCancelled) break;
        const segment = config.segments[segIdx];

        // Prepare video elements for this clip's cameras
        const segVideos: Partial<Record<CameraKey, HTMLVideoElement>> = {};
        const objectUrls: string[] = [];
        const camKeys = Object.keys(segment.clip.cams) as CameraKey[];

        for (const k of camKeys) {
          const file = segment.clip.cams[k];
          if (!file) continue;
          const url = URL.createObjectURL(file);
          objectUrls.push(url);

          const v = document.createElement('video');
          v.src = url;
          v.muted = true;
          v.playsInline = true;
          v.preload = 'auto';
          segVideos[k] = v;
        }

        // Wait for video metadata
        await Promise.all(
          Object.values(segVideos).map(
            (v) =>
              new Promise<void>((resolve) => {
                if (!v || v.readyState >= 1) resolve();
                else v.onloadedmetadata = () => resolve();
              })
          )
        );

        // Fetch SEI decoder
        const decoder = await config.getClipDecoder(segment.clip);

        let currentSourceSec = segment.startSec;
        const videoKeys = Object.keys(segVideos) as CameraKey[];

        while (currentSourceSec <= segment.endSec && !this.isCancelled) {
          // Sync all camera videos to currentSourceSec
          await Promise.all(
            videoKeys.map((k) => {
              const v = segVideos[k];
              if (!v) return Promise.resolve();
              return new Promise<void>((resolve) => {
                if (Math.abs(v.currentTime - currentSourceSec) < 0.03) {
                  resolve();
                  return;
                }
                const onSeeked = () => {
                  v.removeEventListener('seeked', onSeeked);
                  resolve();
                };
                v.addEventListener('seeked', onSeeked);
                v.currentTime = currentSourceSec;
              });
            })
          );

          const currentFrameIdx = Math.round(currentSourceSec * config.sourceFps);
          const telemetry: TelemetryData = decoder
            ? decoder.getFrameTelemetry(currentFrameIdx)
            : {
                speed_kmh: 0,
                steering_deg: 0,
                accel_pct: 0,
                brake_applied: false,
                brake_pct: 0,
                ap_mode: 'MANUAL',
                left_blinker: false,
                right_blinker: false,
                lat: 0,
                lon: 0,
                heading: 0,
              };

          const timestampText = `${segment.baseTimeStr} (+${currentSourceSec.toFixed(1)}s)`;

          // Render overlay onto offscreen export canvas
          OverlayRenderer.render(
            exportCanvas,
            segVideos,
            telemetry,
            timestampText,
            currentSourceSec,
            currentFrameIdx,
            config.sourceFps,
            config.options
          );

          // Feed to VideoEncoder
          const timestampMicros = Math.round((outputFrameCount * 1_000_000) / config.targetFps);
          const videoFrame = new VideoFrame(exportCanvas, {
            timestamp: timestampMicros,
            duration: Math.round(1_000_000 / config.targetFps),
          });

          const keyFrame = outputFrameCount % Math.round(config.targetFps * 2) === 0;
          videoEncoder.encode(videoFrame, { keyFrame });
          videoFrame.close();

          outputFrameCount++;
          currentSourceSec += frameStepSec;

          const progressPct = Math.min(100, Math.round((outputFrameCount / totalFrames) * 100));
          config.onProgress(progressPct, segIdx + 1, config.segments.length);

          // Yield event loop
          if (outputFrameCount % 4 === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        // Cleanup this segment's video URLs
        for (const url of objectUrls) {
          URL.revokeObjectURL(url);
        }
        for (const k of videoKeys) {
          if (segVideos[k]) {
            segVideos[k]!.src = '';
            delete segVideos[k];
          }
        }
      }

      if (this.isCancelled) {
        throw new Error("비디오 내보내기가 취소되었습니다.");
      }

      await videoEncoder.flush();
      muxer.finalize();

      const { buffer } = muxer.target;
      return new Blob([buffer], { type: 'video/mp4' });
    } finally {
      if (videoEncoder && videoEncoder.state !== 'closed') {
        videoEncoder.close();
      }
    }
  }
}
