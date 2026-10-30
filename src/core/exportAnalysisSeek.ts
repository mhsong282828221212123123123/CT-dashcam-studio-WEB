/** Seek for the coordinate-analysis pass. A timeout is a failure, never a ready frame. */
export async function seekAnalysisFrame(
  video: HTMLVideoElement, sourceSec: number, fps: number, cancelled: () => boolean
): Promise<void> {
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Video metadata is unavailable');
  const target = Math.max(0, Math.min(sourceSec, video.duration - 0.5 / Math.max(1, fps)));
  const ready = () => !video.seeking && video.readyState >= 2 && video.videoWidth > 0 && Math.abs(video.currentTime - target) <= 0.002;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (cancelled()) throw new Error('Analysis cancelled');
    if (ready()) return;
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          clearInterval(poll);
          video.removeEventListener('seeked', onReady);
          video.removeEventListener('loadeddata', onReady);
          video.removeEventListener('error', onError);
          error ? reject(error) : resolve();
        };
        const onReady = () => { if (ready()) finish(); };
        const onError = () => finish(new Error('Video decode failed during face analysis'));
        const timeout = setTimeout(() => finish(new Error('Timed out waiting for face-analysis frame')), 1500);
        const poll = setInterval(() => { if (cancelled()) finish(new Error('Analysis cancelled')); }, 40);
        video.addEventListener('seeked', onReady);
        video.addEventListener('loadeddata', onReady);
        video.addEventListener('error', onError);
        try { video.currentTime = target; } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
      });
      return;
    } catch (error) {
      if (cancelled() || attempt === 1) throw error;
    }
  }
}
