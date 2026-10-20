// Ported & adapted from core/exporter.py (ExportWorker) using WebCodecs + mp4-muxer
import * as Mp4Muxer from 'mp4-muxer';
import { OverlayRenderer, RenderOptions } from './renderer';
import { RealTeslaSEIDecoder, TelemetryData } from './seiDecoder';
import { RESOLUTIONS, CameraKey } from './constants';
import { ClipItem, ensureClipFiles } from './clipScanner';

// Background-safe event loop yield helper that prevents Chromium 1000ms timer throttling in hidden tabs
function fastYield(): Promise<void> {
  if (typeof (globalThis as any).scheduler?.yield === 'function') {
    return (globalThis as any).scheduler.yield();
  }
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(null);
  });
}

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

  private getActiveCamKeys(options: RenderOptions): CameraKey[] {
    if (options.layout === '단일 카메라') {
      return [options.single_cam || 'front'];
    }
    const keys: CameraKey[] = ['front', 'back', 'left_repeater', 'right_repeater'];
    if (options.pillar_pip) {
      keys.push('left_pillar', 'right_pillar');
    }
    return keys;
  }

  cancel(): void {
    this.isCancelled = true;
  }

  async exportMultiClip(config: MultiClipExportConfig): Promise<Blob> {
    this.isCancelled = false;
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 850px), (pointer: coarse)').matches;
    const resConfig = RESOLUTIONS[config.resolutionName] || RESOLUTIONS["FHD (1920x1080) - 권장 표준"];
    const [targetW, targetH] = resConfig.size;

    // Bitrate selection: Full original high bitrates on PC (35/50 Mbps), capped on mobile to avoid decoder strain
    const baseBitrate = resConfig.bitrate_mbps;
    const effectiveBitrateMbps = isMobile
      ? Math.min(baseBitrate, targetW >= 2560 ? 28.0 : targetW >= 1920 ? 16.0 : 8.0)
      : baseBitrate;
    const bitrateBps = Math.round(effectiveBitrateMbps * 1_000_000);

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
          // Pass chunk intact with its original PTS timestamp.
          // Constrained Baseline Profile strictly prohibits B-frames, ensuring 1:1 input/output order and DTS = PTS.
          muxer.addVideoChunk(chunk, meta);
        },
        error: (e) => {
          console.error("VideoEncoder error:", e);
        },
      });

      // Codec profile & level:
      // - PC: standard avc1.640028 (High Profile Level 4.0) or avc1.640032 (High Profile Level 5.0 for QHD)
      // - Mobile: Constrained Baseline Profile (avc1.42E0xx) to strictly prevent Samsung Exynos/Snapdragon
      //   MediaCodec from generating B-frames which cause 1-3-2-4-6-5 PTS/DTS temporal jitter in Samsung Gallery.
      let avcLevel = 'avc1.640028';
      if (isMobile) {
        avcLevel = targetW >= 2560 ? 'avc1.42E032'
          : targetW >= 1920 ? 'avc1.42E029'
          : 'avc1.42E01f';
      } else if (targetW >= 2560) {
        avcLevel = 'avc1.640032';
      }

      const encoderConfig: VideoEncoderConfig = {
        codec: avcLevel,
        width: targetW,
        height: targetH,
        bitrate: bitrateBps,
        framerate: config.targetFps,
      };

      if (isMobile) {
        // Enforce realtime latencyMode on mobile to prevent B-frame temporal reordering jitter in Samsung Gallery
        encoderConfig.latencyMode = 'realtime';
      }

      if (typeof VideoEncoder.isConfigSupported === 'function') {
        try {
          const check = await VideoEncoder.isConfigSupported(encoderConfig);
          const defaultFallback = isMobile ? 'avc1.420028' : 'avc1.640028';
          if (!check.supported && avcLevel !== defaultFallback) {
            console.warn(`[Exporter] ${avcLevel} not supported, falling back to ${defaultFallback}`);
            encoderConfig.codec = defaultFallback;
          }
        } catch {
          // Keep chosen level if check throws
        }
      }

      videoEncoder.configure(encoderConfig);

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
        await ensureClipFiles(segment.clip);
        const segVideos: Partial<Record<CameraKey, HTMLVideoElement>> = {};
        const objectUrls: string[] = [];
        const activeCamKeys = this.getActiveCamKeys(config.options);
        const camKeys = (Object.keys(segment.clip.cams) as CameraKey[]).filter((k) =>
          activeCamKeys.includes(k)
        );

        const hiddenContainer = document.getElementById('hidden-video-container');

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
          // On mobile, DOM attachment prevents iOS/Samsung background playback freeze.
          // On PC, in-memory decoding avoids Chromium offscreen/occlusion throttling for maximum speed.
          if (isMobile && hiddenContainer) {
            hiddenContainer.appendChild(v);
          }
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

        // Track frame mediaTime and snapshots to prevent backward temporal jitter (1-3-2-4-6-5) on mobile
        const lastMediaTimes: Partial<Record<CameraKey, number>> = {};
        const lastValidSnapshots: Partial<Record<CameraKey, HTMLCanvasElement>> = {};
        const isBackwardsFlags: Partial<Record<CameraKey, boolean>> = {};

        while (currentSourceSec <= segment.endSec && !this.isCancelled) {
          // Sync all camera videos to currentSourceSec
          await Promise.all(
            videoKeys.map((k) => {
              const v = segVideos[k];
              if (!v) return Promise.resolve();
              return new Promise<void>((resolve) => {
                // Add 0.001s (1ms) epsilon on mobile to avoid floating point boundary rounding down to previous frame
                const targetSeekTime = isMobile
                  ? Math.min(v.duration && v.duration > 0 ? v.duration - 0.0005 : currentSourceSec + 0.001, currentSourceSec + 0.001)
                  : currentSourceSec;

                if (Math.abs(v.currentTime - targetSeekTime) < 0.0001) {
                  resolve();
                  return;
                }

                let settled = false;
                let timeoutId: any = null;
                let rvfcId: number | null = null;
                let isBackwards = false;

                const prevMediaTime = lastMediaTimes[k] ?? -1;
                const startTime = Date.now();

                const finish = () => {
                  if (settled) return;
                  settled = true;
                  if (timeoutId) clearTimeout(timeoutId);
                  if (rvfcId !== null && typeof (v as any).cancelVideoFrameCallback === 'function') {
                    (v as any).cancelVideoFrameCallback(rvfcId);
                  }
                  v.removeEventListener('seeked', onSeeked);
                  isBackwardsFlags[k] = isBackwards;
                  resolve();
                };

                // 150ms timeout fallback on mobile (prevents hangs if seek/rVFC is dropped), 400ms on PC
                timeoutId = setTimeout(() => {
                  finish();
                }, isMobile ? 150 : 400);

                if (!isMobile) {
                  // On PC: resolve immediately upon seeked to maximize decoding throughput!
                  const onSeeked = () => finish();
                  v.addEventListener('seeked', onSeeked, { once: true });
                  v.currentTime = targetSeekTime;
                  return;
                }

                // Mobile path: requestVideoFrameCallback + backward frame guard
                const checkFrame = (_now: number, metadata: any) => {
                  if (settled) return;
                  const mediaTime = metadata?.mediaTime;
                  if (typeof mediaTime === 'number') {
                    // Check if this frame is equal to or older than the previous frame (backward temporal jitter)
                    if (prevMediaTime >= 0 && mediaTime <= prevMediaTime + 0.0005) {
                      isBackwards = true;
                      const elapsed = Date.now() - startTime;
                      // If within 150ms window, re-request rVFC to wait for the forward frame
                      if (elapsed < 130 && typeof (v as any).requestVideoFrameCallback === 'function') {
                        rvfcId = (v as any).requestVideoFrameCallback(checkFrame);
                        return;
                      }
                      // Window expired, retain backward flag to use previous valid frame snapshot
                      finish();
                      return;
                    }
                    // Valid forward frame confirmed!
                    isBackwards = false;
                    lastMediaTimes[k] = mediaTime;
                  }
                  finish();
                };

                const onSeeked = () => {
                  if (settled) return;
                  if (typeof (v as any).requestVideoFrameCallback === 'function' && !document.hidden) {
                    rvfcId = (v as any).requestVideoFrameCallback(checkFrame);
                  } else if (document.hidden) {
                    // On mobile background tab: resolve via microtask
                    queueMicrotask(finish);
                  } else {
                    // Fallback if rVFC is not available
                    requestAnimationFrame(() => {
                      requestAnimationFrame(finish);
                    });
                  }
                };

                v.addEventListener('seeked', onSeeked, { once: true });
                v.currentTime = targetSeekTime;
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

          // Prepare render frames: if a backward frame was detected, hold the previous valid frame snapshot
          const renderFrames: Partial<Record<CameraKey, CanvasImageSource | null>> = {};
          for (const k of videoKeys) {
            const v = segVideos[k];
            if (!v) continue;
            if (isMobile && isBackwardsFlags[k] && lastValidSnapshots[k]) {
              renderFrames[k] = lastValidSnapshots[k]!;
            } else {
              renderFrames[k] = v;
              if (isMobile && v.videoWidth > 0 && v.videoHeight > 0) {
                let snap = lastValidSnapshots[k];
                if (!snap || snap.width !== v.videoWidth || snap.height !== v.videoHeight) {
                  snap = document.createElement('canvas');
                  snap.width = v.videoWidth;
                  snap.height = v.videoHeight;
                  lastValidSnapshots[k] = snap;
                }
                const sCtx = snap.getContext('2d');
                if (sCtx) {
                  sCtx.drawImage(v, 0, 0);
                }
              }
            }
          }

          // Render overlay onto offscreen export canvas
          OverlayRenderer.render(
            exportCanvas,
            renderFrames,
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

          // Yield event loop without triggering background timer throttling in hidden tabs
          if (outputFrameCount % 4 === 0) {
            await fastYield();
          }
        }

        // Cleanup this segment's video URLs and remove elements from hidden container
        for (const url of objectUrls) {
          URL.revokeObjectURL(url);
        }
        for (const k of videoKeys) {
          if (segVideos[k]) {
            segVideos[k]!.src = '';
            segVideos[k]!.remove();
            delete segVideos[k];
          }
          delete lastValidSnapshots[k];
          delete lastMediaTimes[k];
          delete isBackwardsFlags[k];
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
