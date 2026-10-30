// Ported & adapted from core/exporter.py (ExportWorker) using WebCodecs + mp4-muxer
import * as Mp4Muxer from 'mp4-muxer';
import { OverlayRenderer, RenderOptions } from './renderer';
import { RealTeslaSEIDecoder, TelemetryData } from './seiDecoder';
import { RESOLUTIONS, CameraKey } from './constants';
import { ClipItem, ensureClipFiles } from './clipScanner';
import type { ExportFrameProcessor } from './facePrivacy';
import { i18n } from './i18n';

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
  /** Optional per-frame processor (experimental face mosaic). Awaited for every output frame. */
  frameProcessor?: ExportFrameProcessor;
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

  private seekVideoOnce(v: HTMLVideoElement, timeSec: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const targetSec = timeSec <= 0 ? 0.001 : timeSec;
      if (Math.abs(v.currentTime - targetSec) < 0.02 && v.readyState >= 2) {
        resolve();
        return;
      }
      let settled = false;
      let timer: any = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        v.removeEventListener('seeked', onReady);
        v.removeEventListener('loadeddata', onReady);
        v.removeEventListener('canplay', onReady);
        resolve();
      };
      const onReady = () => {
        if (v.readyState >= 2) {
          finish();
        }
      };
      timer = setTimeout(finish, 800);
      v.addEventListener('seeked', onReady);
      v.addEventListener('loadeddata', onReady);
      v.addEventListener('canplay', onReady);
      try {
        v.currentTime = targetSec;
      } catch {
        finish();
      }
    });
  }

  private async warmupSegmentVideos(
    segVideos: Partial<Record<CameraKey, HTMLVideoElement>>,
    startSec: number,
    _isIOS: boolean
  ): Promise<void> {
    const videos = Object.values(segVideos).filter((v): v is HTMLVideoElement => Boolean(v));
    if (videos.length === 0) return;

    // 1. Wait for metadata on all active segment videos
    await Promise.all(
      videos.map(
        (v) =>
          new Promise<void>((resolve) => {
            if (v.readyState >= 1 && v.videoWidth > 0) {
              resolve();
              return;
            }
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              v.removeEventListener('loadedmetadata', done);
              v.removeEventListener('error', done);
              resolve();
            };
            const t = setTimeout(done, 2500);
            v.addEventListener('loadedmetadata', () => {
              clearTimeout(t);
              done();
            }, { once: true });
            v.addEventListener('error', () => {
              clearTimeout(t);
              done();
            }, { once: true });
          })
      )
    );

    // Helper: Verify on an offscreen 16x16 probe canvas that ctx.drawImage(v) actually paints decoded video pixels
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = 16;
    probeCanvas.height = 16;
    const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });

    const isVideoPaintingValidFrame = (v: HTMLVideoElement): boolean => {
      if (v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0 || !probeCtx) {
        return false;
      }
      try {
        probeCtx.clearRect(0, 0, 16, 16);
        probeCtx.drawImage(v, 0, 0, 16, 16);
        const data = probeCtx.getImageData(0, 0, 16, 16).data;
        // If drawImage failed to copy any texture, alpha (data[3]) remains 0
        if (data[3] === 0) return false;
        // Check that the texture is not an uninitialized all-black [0,0,0,255] CVPixelBuffer
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 2 || data[i + 1] > 2 || data[i + 2] > 2) {
            return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    };

    const waitSeeked = (v: HTMLVideoElement, targetTime: number, timeoutMs = 800): Promise<void> => {
      return new Promise<void>((resolve) => {
        let settled = false;
        let timer: any = null;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          v.removeEventListener('seeked', onSeeked);
          resolve();
        };
        const onSeeked = () => {
          if (typeof (v as any).requestVideoFrameCallback === 'function') {
            const rvfcTimer = setTimeout(finish, 60);
            (v as any).requestVideoFrameCallback(() => {
              clearTimeout(rvfcTimer);
              finish();
            });
          } else {
            finish();
          }
        };
        timer = setTimeout(finish, timeoutMs);
        v.addEventListener('seeked', onSeeked, { once: true });
        try {
          const clamped = v.duration > 0 ? Math.min(v.duration, targetTime) : targetTime;
          v.currentTime = clamped;
        } catch {
          finish();
        }
      });
    };

    // 2. Prime hardware decoder (play -> decode 1st frame -> pause -> seek to startSec -> verify pixels on probeCanvas)
    const initTargetSec = startSec <= 0 ? 0.01 : startSec;

    await Promise.all(
      videos.map(async (v) => {
        try {
          v.muted = true;
          v.playsInline = true;
          v.playbackRate = 1.0;

          // Step A: Play briefly to force iOS WebKit AVPlayerItemVideoOutput / VideoToolbox allocation
          if (startSec > 0.05) {
            try {
              v.currentTime = Math.max(0, startSec - 0.04);
            } catch {}
          }

          await new Promise<void>((resolve) => {
            let done = false;
            const finishPrime = () => {
              if (done) return;
              done = true;
              v.removeEventListener('playing', onPlaying);
              v.removeEventListener('timeupdate', finishPrime);
              resolve();
            };
            const onPlaying = () => {
              if (typeof (v as any).requestVideoFrameCallback === 'function') {
                const t = setTimeout(finishPrime, 120);
                (v as any).requestVideoFrameCallback(() => {
                  clearTimeout(t);
                  finishPrime();
                });
              } else {
                setTimeout(finishPrime, 90);
              }
            };
            const timeout = setTimeout(finishPrime, 450);
            v.addEventListener('playing', onPlaying, { once: true });
            v.addEventListener('timeupdate', () => {
              clearTimeout(timeout);
              finishPrime();
            }, { once: true });
            v.play().catch(() => {
              clearTimeout(timeout);
              finishPrime();
            });
          });

          try {
            v.pause();
          } catch {}

          // Step B: Seek to exact target startSec
          await waitSeeked(v, initTargetSec, 900);

          // Step C: Verify that ctx.drawImage(v) actually paints decoded non-black pixels before starting export
          const deadline = performance.now() + 1800;
          let attempt = 0;
          while (!isVideoPaintingValidFrame(v) && performance.now() < deadline && !this.isCancelled) {
            attempt++;
            if (attempt % 2 === 1) {
              // Nudge currentTime by 1 frame (+0.035s) and back to force AVFoundation frame decode
              const nudgeSec = initTargetSec + 0.035 * attempt;
              await waitSeeked(v, nudgeSec, 350);
              if (isVideoPaintingValidFrame(v)) {
                await waitSeeked(v, initTargetSec, 350);
                break;
              }
            } else {
              // Brief play-pause pulse to wake decoder output
              try {
                await v.play();
                await new Promise((r) => setTimeout(r, 60));
                v.pause();
              } catch {}
              await waitSeeked(v, initTargetSec, 350);
            }
          }
        } catch {}
      })
    );
  }

  /**
   * Android-exclusive Pause-free Continuous Streaming + Dynamic Soft-Sync Mode:
   * 1. Continuous low-speed forward playback (baseRate = 0.5x) with zero per-frame pause, avoiding MediaCodec restart stalls.
   * 2. Synchronous canvas rendering & encoding immediately upon frame arrival via requestVideoFrameCallback.
   * 3. For 1x exports: captures every newly presented master frame (> lastTime + 0.01) with true real-time PTS (zero 3:2 pulldown judder).
   * 4. For secondary cameras: zero seek calls; dynamically modulates playbackRate (P-Controller) to seamlessly lock sync.
   * 5. Conditional backpressure only if hardware encoder queue exceeds 4.
   */
  private async exportSegmentStreamingAndroid(
    segment: ExportClipSegment,
    segVideos: Partial<Record<CameraKey, HTMLVideoElement>>,
    videoKeys: CameraKey[],
    decoder: RealTeslaSEIDecoder | null,
    exportCanvas: HTMLCanvasElement,
    videoEncoder: VideoEncoder,
    config: MultiClipExportConfig,
    totalSourceSec: number,
    cumulativeCompletedSec: number,
    segIdx: number,
    onFrameEncoded: () => void,
    getOutputFrameCount: () => number,
    getLastOutputTimestampMicros: () => number,
    setLastOutputTimestampMicros: (t: number) => void
  ): Promise<void> {
    const activeVideos = videoKeys
      .map((k) => segVideos[k])
      .filter((v): v is HTMLVideoElement => Boolean(v));
    const masterVideo = segVideos['front'] || activeVideos[0];
    if (!masterVideo) return;

    // 1. 세그먼트 시작점으로 최초 1회만 정밀 시크
    await Promise.all(
      activeVideos.map((v) => this.seekVideoOnce(v, segment.startSec))
    );

    // 2. 기본 저속 배속 설정 (baseRate = 0.5: 캔버스 합성 및 인코딩이 1프레임 시간 내에 안정적으로 끝나는 속도)
    const baseRate = 0.5;
    for (const v of activeVideos) {
      v.muted = true;
      v.playsInline = true;
      v.playbackRate = baseRate;
    }

    // 3. 모든 활성 비디오 연속 재생 시작 (매 프레임 pause 절대 하지 않고 연속 스트리밍 유지)
    await Promise.all(activeVideos.map((v) => v.play().catch(() => {})));

    const isOneX = config.exportSpeed === 1.0;
    const stepSec = (1.0 / config.targetFps) * config.exportSpeed;
    let nextTargetSourceSec = segment.startSec;
    let lastCapturedMediaTime = -1;
    let lastFrameWallTime = performance.now();

    while (!this.isCancelled) {
      // 브라우저 백그라운드 정책 등으로 일시정지되었을 경우 안전 재개 (백프레셔 상태가 아닐 때)
      if (masterVideo.paused && videoEncoder.encodeQueueSize <= 4) {
        for (const v of activeVideos) {
          if (v.paused) v.play().catch(() => {});
        }
      }

      // requestVideoFrameCallback을 통해 GPU 하드웨어 디코더가 새 프레임을 렌더할 때까지 대기
      const frameMeta = await new Promise<{ mediaTime: number }>((resolve) => {
        let settled = false;
        let timeoutId: any = null;

        const onFrame = (_now: number, metadata: any) => {
          if (settled) return;
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          resolve({ mediaTime: metadata?.mediaTime ?? masterVideo.currentTime });
        };

        timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({ mediaTime: masterVideo.currentTime });
        }, 400);

        if (typeof (masterVideo as any).requestVideoFrameCallback === 'function') {
          (masterVideo as any).requestVideoFrameCallback(onFrame);
        } else {
          setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve({ mediaTime: masterVideo.currentTime });
          }, 35);
        }
      });

      if (this.isCancelled) break;

      const mediaTime = frameMeta.mediaTime;

      // 영상 종료 조건 확인: 비디오가 끝났고 더 이상 새 프레임이 없으면 종료
      if (masterVideo.ended && mediaTime <= lastCapturedMediaTime) {
        break;
      }
      if (mediaTime >= segment.endSec + 0.1) {
        break;
      }

      // 직전 캡처 시간과 동일하면 새 비디오 프레임이 디코딩될 때까지 대기
      if (mediaTime <= lastCapturedMediaTime) {
        if (performance.now() - lastFrameWallTime > 5000) {
          console.warn('[Android Exporter] Video stalled for > 5s, ending segment');
          break;
        }
        continue;
      }
      lastFrameWallTime = performance.now();

      // 세그먼트 시작점 이전 프레임 또는 디코딩 미완료 프레임 무시 (블랙스크린 방지)
      if (mediaTime < segment.startSec - 0.03 || masterVideo.readyState < 2 || masterVideo.videoWidth === 0) {
        continue;
      }

      // 4. 프레임 캡처 여부 판별:
      // - 1배속: 마스터 비디오에서 새 프레임이 올라올 때마다(> lastCapturedMediaTime + 0.01) 모두 캡처하여 풀다운 저더 0%
      // - 배속: nextTargetSourceSec 간격으로 건너뛰며 캡처
      const shouldCapture = isOneX
        ? (mediaTime > lastCapturedMediaTime + 0.01)
        : (mediaTime >= nextTargetSourceSec - 0.005);

      if (shouldCapture) {
        lastCapturedMediaTime = mediaTime;
        if (!isOneX) {
          nextTargetSourceSec += stepSec;
        }

        // 5. 보조 카메라 시크 금지 -> playbackRate 비례 제어 (Soft Sync)
        for (const v of activeVideos) {
          if (v !== masterVideo) {
            const diff = masterVideo.currentTime - v.currentTime;
            if (Math.abs(diff) > 0.5) {
              // 0.5초 이상 완전히 벌어졌을 때만 예외적으로 시크
              v.currentTime = masterVideo.currentTime;
            } else {
              // diff > 0이면 보조 카메라가 느리므로 가속, diff < 0이면 감속
              const adjustedRate = Math.max(0.2, Math.min(1.0, baseRate + diff * 1.5));
              v.playbackRate = adjustedRate;
            }
          }
        }

        // 6. Canvas 렌더링
        const currentFrameIdx = Math.round(mediaTime * config.sourceFps);
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

        const timestampText = `${segment.baseTimeStr} (+${mediaTime.toFixed(1)}s)`;

        const renderFrames = config.frameProcessor
          ? await config.frameProcessor.processExport(segVideos)
          : segVideos;

        OverlayRenderer.render(
          exportCanvas,
          renderFrames,
          telemetry,
          timestampText,
          mediaTime,
          currentFrameIdx,
          config.sourceFps,
          config.options
        );

        // 7. 출력 타임스탬프 계산 및 VideoEncoder 인코딩
        const count = getOutputFrameCount();
        let timestampMicros: number;
        if (isOneX) {
          const relSec = Math.max(0, mediaTime - segment.startSec);
          timestampMicros = Math.round((cumulativeCompletedSec + relSec) * 1_000_000);
        } else {
          timestampMicros = Math.round((count * 1_000_000) / config.targetFps);
        }
        if (count === 0 && cumulativeCompletedSec === 0) {
          timestampMicros = 0;
        }

        const prevTimestamp = getLastOutputTimestampMicros();
        if (timestampMicros <= prevTimestamp) {
          timestampMicros = prevTimestamp + 1000;
        }
        setLastOutputTimestampMicros(timestampMicros);

        const durationMicros = Math.round(1_000_000 / config.targetFps);
        const keyIntervalFrames = Math.max(1, Math.round(config.targetFps * 4));
        const isKeyFrame = count === 0 || count % keyIntervalFrames === 0;

        const frame = new VideoFrame(exportCanvas, {
          timestamp: timestampMicros,
          duration: durationMicros,
        });

        videoEncoder.encode(frame, { keyFrame: isKeyFrame });
        frame.close();

        onFrameEncoded();

        // 8. 진행도(Progress) 계산: 실제 처리된 원본 영상 시간 기반으로 부드럽게 0% ~ 99% 증가
        const segDuration = Math.max(0.01, segment.endSec - segment.startSec);
        const segElapsed = Math.max(0, Math.min(segDuration, mediaTime - segment.startSec));
        const overallElapsedSec = cumulativeCompletedSec + segElapsed;
        const progressPct = Math.min(99, Math.round((overallElapsedSec / totalSourceSec) * 100));
        config.onProgress(progressPct, segIdx + 1, config.segments.length);

        // 9. 조건부 백프레셔: 하드웨어 인코더 큐가 4 초과일 때만 일시적으로 pause 후 큐가 1 이하로 빠지면 재생 재개
        if (videoEncoder.encodeQueueSize > 4 && !this.isCancelled) {
          for (const v of activeVideos) {
            if (!v.paused) {
              try { v.pause(); } catch {}
            }
          }
          while (videoEncoder.encodeQueueSize > 1 && !this.isCancelled) {
            await new Promise((r) => setTimeout(r, 10));
          }
          if (!this.isCancelled) {
            for (const v of activeVideos) {
              v.play().catch(() => {});
            }
          }
        }
      }

      if (mediaTime >= segment.endSec || masterVideo.ended) {
        break;
      }
    }

    // 세그먼트 종료 시 모든 비디오 정지 및 배속 원복
    for (const v of activeVideos) {
      try {
        v.pause();
        v.playbackRate = 1.0;
      } catch {}
    }
  }

  async exportMultiClip(config: MultiClipExportConfig): Promise<Blob> {
    this.isCancelled = false;

    // Platform detection: Android (needs Samsung MediaCodec B-frame & buffer workarounds) vs iOS (native VideoToolbox)
    const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
    const isIOS = typeof navigator !== 'undefined' && (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
    const isMobile = isAndroid || isIOS || (typeof window !== 'undefined' && window.matchMedia('(max-width: 850px), (pointer: coarse), ((orientation: landscape) and (max-height: 600px))').matches);

    const resConfig = RESOLUTIONS[config.resolutionName] || RESOLUTIONS["FHD (1920x1080) - 권장 표준"];
    const [targetW, targetH] = resConfig.size;

    // Bitrate selection: matched to Python libx264 CRF 21~26 real-world compression ratios with FPS ratio scaling
    const baseBitrate = resConfig.bitrate_mbps;
    const fpsRatio = Math.pow(Math.max(1, config.targetFps) / 30.0, 0.45);
    const scaledBitrate = baseBitrate * fpsRatio;
    const effectiveBitrateMbps = isMobile
      ? Math.min(scaledBitrate, targetW >= 2560 ? 16.0 : targetW >= 1920 ? 10.0 : 5.5)
      : scaledBitrate;
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
      firstTimestampBehavior: 'offset',
    });

    let videoEncoder: VideoEncoder | null = null;
    let receivedChunkCount = 0;
    let encoderError: any = null;
    let decoderConfigSent = false;
    let safeDecoderConfigRef: any = null;

    try {
      // Codec profile & level:
      // - PC & iOS: standard High Profile avc1.640028 (Level 4.0) or avc1.640032 (Level 5.0 for QHD).
      //   Apple VideoToolbox on iOS handles High Profile natively with zero frame swap jitter and maximum hardware speed.
      // - Android (Galaxy): Constrained Baseline Profile (avc1.42E0xx) to strictly prevent Samsung Exynos/Snapdragon
      //   MediaCodec from generating B-frames which cause 1-3-2-4-6-5 PTS/DTS temporal jitter in Samsung Gallery.
      let avcLevel = 'avc1.640028';
      if (isAndroid) {
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
        bitrateMode: 'variable',
        framerate: config.targetFps,
        avc: { format: 'avc' },
      };

      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          receivedChunkCount++;

          if (!decoderConfigSent) {
            const raw = meta?.decoderConfig;
            const safeDecoderConfig = {
              codec: raw?.codec || encoderConfig.codec,
              codedWidth: raw?.codedWidth || targetW,
              codedHeight: raw?.codedHeight || targetH,
              ...(raw?.description ? { description: raw.description } : {}),
              colorSpace: {
                primaries: 'bt709',
                transfer: 'bt709',
                matrix: 'bt709',
                fullRange: false,
              },
            };
            safeDecoderConfigRef = safeDecoderConfig;
            muxer.addVideoChunk(chunk, { decoderConfig: safeDecoderConfig as any });
            if (raw?.description || receivedChunkCount >= 3) {
              decoderConfigSent = true;
            }
          } else {
            muxer.addVideoChunk(chunk);
          }
        },
        error: (e) => {
          console.error("VideoEncoder error:", e);
          encoderError = e;
        },
      });

      if (isAndroid) {
        // Enforce realtime latencyMode on Android to prevent B-frame temporal reordering jitter in Samsung Gallery
        encoderConfig.latencyMode = 'realtime';
      }

      if (typeof VideoEncoder.isConfigSupported === 'function') {
        try {
          let check = await VideoEncoder.isConfigSupported(encoderConfig);
          if (!check.supported && encoderConfig.bitrateMode) {
            delete encoderConfig.bitrateMode;
            check = await VideoEncoder.isConfigSupported(encoderConfig);
          }
          if (!check.supported && encoderConfig.latencyMode) {
            delete encoderConfig.latencyMode;
            check = await VideoEncoder.isConfigSupported(encoderConfig);
          }
          if (!check.supported) {
            encoderConfig.codec = targetW >= 2560 ? 'avc1.640032' : targetW >= 1920 ? 'avc1.640029' : 'avc1.640028';
            delete encoderConfig.latencyMode;
            check = await VideoEncoder.isConfigSupported(encoderConfig);
          }
          if (!check.supported) {
            encoderConfig.codec = 'avc1.42001f';
            check = await VideoEncoder.isConfigSupported(encoderConfig);
          }
          if (!check.supported && encoderConfig.avc) {
            delete encoderConfig.avc;
          }
        } catch (err) {
          console.warn('[Exporter] VideoEncoder.isConfigSupported check fallback:', err);
          delete encoderConfig.latencyMode;
          delete encoderConfig.bitrateMode;
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
      let cumulativeCompletedSec = 0;
      let lastOutputTimestampMicros = -1;

      for (let segIdx = 0; segIdx < config.segments.length; segIdx++) {
        if (this.isCancelled) break;
        const segment = config.segments[segIdx];

        // Prepare video elements for this clip's cameras
        await ensureClipFiles(segment.clip);
        const segVideos: Partial<Record<CameraKey, HTMLVideoElement>> = {};
        const objectUrls: string[] = [];
        try {
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
            v.setAttribute('playsinline', '');
            v.setAttribute('webkit-playsinline', '');
            v.preload = 'auto';
            v.style.width = '1px';
            v.style.height = '1px';
            v.style.opacity = '0.01';
            v.style.pointerEvents = 'none';
            if (hiddenContainer) {
              hiddenContainer.appendChild(v);
            }
            try {
              v.load();
            } catch {}
            segVideos[k] = v;
          }

        // Preload, prime hardware decoders, seek to segment.startSec, and verify actual canvas pixel output before encoding
        await this.warmupSegmentVideos(segVideos, segment.startSec, isIOS);

        // New clip: drop any tracker state carried over from the previous segment
        config.frameProcessor?.reset();
        // Fetch SEI decoder
        const decoder = await config.getClipDecoder(segment.clip);
        const videoKeys = Object.keys(segVideos) as CameraKey[];

        if (isAndroid) {
          // Android: Pause 없는 연속 저속 재생 + 동적 배속 싱크 (Soft Sync)
          await this.exportSegmentStreamingAndroid(
            segment,
            segVideos,
            videoKeys,
            decoder,
            exportCanvas,
            videoEncoder,
            config,
            totalSourceSec,
            cumulativeCompletedSec,
            segIdx,
            () => { outputFrameCount++; },
            () => outputFrameCount,
            () => lastOutputTimestampMicros,
            (t: number) => { lastOutputTimestampMicros = t; }
          );
        } else {
          // PC & iOS: Fast Step-Seek Mode (Apple VideoToolbox / NVENC at maximum hardware throughput)
          let currentSourceSec = segment.startSec;
          let isFirstSegmentFrame = true;

          while (currentSourceSec <= segment.endSec && !this.isCancelled) {
            if (isFirstSegmentFrame) {
              // Frame #0 is already pre-seeked and pixel-verified by warmupSegmentVideos
              isFirstSegmentFrame = false;
            } else {
              // Sync all camera videos to currentSourceSec and ensure frame data is decoded
              await Promise.all(
                videoKeys.map((k) => {
                  const v = segVideos[k];
                  if (!v) return Promise.resolve();
                  return new Promise<void>((resolve) => {
                    const targetSec = currentSourceSec <= 0 ? 0.01 : currentSourceSec;
                    if (Math.abs(v.currentTime - targetSec) < 0.002 && v.readyState >= 2 && v.videoWidth > 0) {
                      resolve();
                      return;
                    }

                    let settled = false;
                    let timeoutId: any = null;

                    const finish = () => {
                      if (settled) return;
                      settled = true;
                      if (timeoutId) clearTimeout(timeoutId);
                      v.removeEventListener('seeked', onSeeked);
                      v.removeEventListener('loadeddata', onSeeked);
                      v.removeEventListener('canplay', onSeeked);
                      resolve();
                    };

                    const onSeeked = () => {
                      if (v.readyState >= 2) {
                        finish();
                      }
                    };
                    timeoutId = setTimeout(finish, isMobile ? 800 : 400);
                    v.addEventListener('seeked', onSeeked);
                    v.addEventListener('loadeddata', onSeeked);
                    v.addEventListener('canplay', onSeeked);
                    try {
                      v.currentTime = v.duration > 0 ? Math.min(v.duration, targetSec) : targetSec;
                    } catch {
                      finish();
                    }
                  });
                })
              );
            }

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
            const renderFrames = config.frameProcessor
              ? await config.frameProcessor.processExport(segVideos)
              : segVideos;
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

            const keyIntervalFrames = Math.max(1, Math.round(config.targetFps * 4));
            const keyFrame = outputFrameCount === 0 || outputFrameCount % keyIntervalFrames === 0;
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
        }

        cumulativeCompletedSec += Math.max(0.01, segment.endSec - segment.startSec);
      } finally {
        // Cleanup this segment's video URLs and forcibly release hardware decoders
        for (const url of objectUrls) {
          URL.revokeObjectURL(url);
        }
        for (const k of Object.keys(segVideos) as CameraKey[]) {
          const v = segVideos[k];
          if (v) {
            v.pause();
            v.removeAttribute('src');
            v.load();
            v.remove();
            delete segVideos[k];
          }
        }
      }
    }

      if (this.isCancelled) {
        throw new Error(i18n.t('error_export_cancelled'));
      }

      if (outputFrameCount === 0) {
        throw new Error(i18n.t('error_no_frames'));
      }

      config.onProgress(100, config.segments.length, config.segments.length);

      await videoEncoder.flush();

      if (encoderError) {
        throw new Error(i18n.t('error_encoder', [String(encoderError.message || encoderError)]));
      }

      if (receivedChunkCount === 0) {
        throw new Error(i18n.t('error_no_chunks'));
      }

      // 2. muxer.finalize() 직전 내부 트랙 강제 패치 (최후의 안전장치)
      const defaultSafeConfig = {
        codec: encoderConfig.codec,
        codedWidth: targetW,
        codedHeight: targetH,
        description: new Uint8Array(),
        colorSpace: {
          primaries: 'bt709',
          transfer: 'bt709',
          matrix: 'bt709',
          fullRange: false,
        },
      };

      if (safeDecoderConfigRef) {
        if (!safeDecoderConfigRef.colorSpace) {
          safeDecoderConfigRef.colorSpace = {
            primaries: 'bt709',
            transfer: 'bt709',
            matrix: 'bt709',
            fullRange: false,
          };
        }
      }

      try {
        const mAny = muxer as any;
        const candidates = [
          mAny._videoTrack,
          mAny.videoTrack,
          mAny.track,
          mAny._track,
          mAny.tracks,
          mAny._tracks,
        ];
        for (const sym of Object.getOwnPropertySymbols(mAny)) {
          candidates.push(mAny[sym]);
        }
        for (const key of Object.getOwnPropertyNames(mAny)) {
          candidates.push(mAny[key]);
        }
        for (const item of candidates) {
          if (item && typeof item === 'object') {
            const track = item.info ? item : item.videoTrack || item._videoTrack;
            if (track && track.info) {
              if (!track.info.decoderConfig) {
                track.info.decoderConfig = safeDecoderConfigRef || defaultSafeConfig;
              } else if (!track.info.decoderConfig.colorSpace) {
                track.info.decoderConfig.colorSpace = {
                  primaries: 'bt709',
                  transfer: 'bt709',
                  matrix: 'bt709',
                  fullRange: false,
                };
              }
            }
          }
        }
      } catch (patchErr) {
        console.warn('[Exporter] Muxer internal track patch check:', patchErr);
      }

      muxer.finalize();

      const { buffer } = muxer.target;
      if (!buffer || buffer.byteLength === 0) {
        throw new Error(i18n.t('error_empty_output'));
      }
      return new Blob([buffer], { type: 'video/mp4' });
    } finally {
      if (videoEncoder && videoEncoder.state !== 'closed') {
        videoEncoder.close();
      }
    }
  }
}
