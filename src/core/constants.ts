// Ported from core/constants.py

export const APP_VERSION = "1.2.5";
export const GITHUB_REPO = "mhsong282828221212123123123/CT-dashcam-studio";

export interface ResolutionConfig {
  size: [number, number];
  bitrate_mbps: number;
}

export const RESOLUTIONS: Record<string, ResolutionConfig> = {
  "QHD (2560x1440) - 최고화질": { size: [2560, 1440], bitrate_mbps: 28.0 },
  "FHD (1920x1080) - 권장 표준": { size: [1920, 1080], bitrate_mbps: 16.0 },
  "HD (1280x720) - 용량 절감": { size: [1280, 720], bitrate_mbps: 8.0 },
  "Compact (960x540) - 모바일용": { size: [960, 540], bitrate_mbps: 4.0 },
};

export interface SensitivityPreset {
  pixel_diff: number;
  min_area: number;
}

export const SENSITIVITY_LEVELS: Record<string, SensitivityPreset> = {
  "낮음": { pixel_diff: 35, min_area: 800 },
  "보통": { pixel_diff: 25, min_area: 400 },
  "높음": { pixel_diff: 15, min_area: 150 },
  "매우높음": { pixel_diff: 10, min_area: 50 },
};

export type CameraKey = 'front' | 'back' | 'left_repeater' | 'right_repeater' | 'left_pillar' | 'right_pillar';

export const CAMERA_LABELS: Record<CameraKey, string> = {
  front: "전방 (Front)",
  back: "후방 (Back)",
  left_repeater: "좌측 펜더 (Left)",
  right_repeater: "우측 펜더 (Right)",
  left_pillar: "좌측 B필러 (Left Pillar)",
  right_pillar: "우측 B필러 (Right Pillar)",
};
