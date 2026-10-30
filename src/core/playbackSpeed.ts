export function clampPlaybackSpeed(value: number): number {
  return Number.isFinite(value) ? Math.min(4, Math.max(0.5, value)) : 1;
}
