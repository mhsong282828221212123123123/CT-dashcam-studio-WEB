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

  private seekVideoOnce(v: HTMLVideoElement, timeSec: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (Math.abs(v.currentTime - timeSec) < 0.03) {
        resolve();
        return;
      }
      let timer: any = null;
      const onSeeked = () => {
        if (timer) clearTimeout(timer);
        v.removeEventListener('seeked', onSeeked);
        resolve();
      };
      timer = setTimeout(() => {
        v.removeEventListener('seeked', onSeeked);
        resolve();
      }, 300);
      v.addEventListener('seeked', onSeeked, { once: true });
      v.currentTime = timeSec;
    });
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

      // 세그먼트 시작점 이전 프레임 무시
      if (mediaTime < segment.startSec - 0.03) {
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

        OverlayRenderer.render(
          exportCanvas,
          segVideos,
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

        const prevTimestamp = getLastOutputTimestampMicros();
        if (timestampMicros <= prevTimestamp) {
          timestampMicros = prevTimestamp + 1000;
        }
        setLastOutputTimestampMicros(timestampMicros);

        const durationMicros = Math.round(1_000_000 / config.targetFps);
        const isKeyFrame = count === 0 || count % Math.round(config.targetFps * 2) === 0;

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
    const isMobile = isAndroid || isIOS || (typeof window !== 'undefined' && window.matchMedia('(max-width: 850px), (pointer: coarse)').matches);

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
    let receivedChunkCount = 0;
    let encoderError: any = null;
    let hasDecoderConfig = false;

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
        framerate: config.targetFps,
        avc: { format: 'avc' },
      };

      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          receivedChunkCount++;

          let chunkMeta = meta;
          if (chunkMeta?.decoderConfig) {
            hasDecoderConfig = true;
            if (!chunkMeta.decoderConfig.colorSpace) {
              chunkMeta.decoderConfig.colorSpace = {};
            }
          } else if (!hasDecoderConfig) {
            // 안드로이드 하드웨어 인코더가 Annex-B 기본값 등으로 인해 decoderConfig를 누락할 경우
            // mp4-muxer가 null.colorSpace 참조 에러로 크래시하지 않도록 안전한 fallback 메타데이터 주입
            chunkMeta = {
              ...chunkMeta,
              decoderConfig: {
                codec: encoderConfig.codec,
                codedWidth: targetW,
                codedHeight: targetH,
                colorSpace: {},
                description: new Uint8Array(),
              },
            };
            hasDecoderConfig = true;
          }

          muxer.addVideoChunk(chunk, chunkMeta);
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

          while (currentSourceSec <= segment.endSec && !this.isCancelled) {
            // Sync all camera videos to currentSourceSec
            await Promise.all(
              videoKeys.map((k) => {
                const v = segVideos[k];
                if (!v) return Promise.resolve();
                return new Promise<void>((resolve) => {
                  if (Math.abs(v.currentTime - currentSourceSec) < 0.0001) {
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
                    resolve();
                  };

                  const onSeeked = () => finish();
                  timeoutId = setTimeout(finish, isMobile ? 800 : 400);
                  v.addEventListener('seeked', onSeeked, { once: true });
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

            const keyFrame = outputFrameCount === 0 || outputFrameCount % Math.round(config.targetFps * 2) === 0;
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
        }
      }

      if (this.isCancelled) {
        throw new Error("비디오 내보내기가 취소되었습니다.");
      }

      if (outputFrameCount === 0) {
        throw new Error("인코딩된 비디오 프레임이 없습니다. (0 frames captured)");
      }

      config.onProgress(100, config.segments.length, config.segments.length);

      await videoEncoder.flush();

      if (encoderError) {
        throw new Error(`VideoEncoder 오류: ${encoderError.message || encoderError}`);
      }

      if (receivedChunkCount === 0) {
        throw new Error("인코딩된 비디오 청크가 없습니다. (0 video chunks received)");
      }

      muxer.finalize();

      const { buffer } = muxer.target;
      if (!buffer || buffer.byteLength === 0) {
        throw new Error("생성된 비디오 파일 데이터가 비어 있습니다. (0 byte output)");
      }
      return new Blob([buffer], { type: 'video/mp4' });
    } finally {
      if (videoEncoder && videoEncoder.state !== 'closed') {
        videoEncoder.close();
      }
    }
  }
}
