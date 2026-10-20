// Ported & designed for browser capability gating (High / Mid / Low)
import { i18n } from './i18n';

export type DeviceTier = 'High' | 'Mid' | 'Low';

export interface DeviceSpecs {
  concurrency: number;
  memory: number;
  hasWebGPU: boolean;
  hasWebCodecs: boolean;
  reason: string;
}

export interface CapabilityPolicy {
  tier: DeviceTier;
  hasWebGPU: boolean;
  hasWebCodecs: boolean;
  maxSimultaneousCams: number;
  exportSupported: boolean;
  maxExportResolution: 'QHD (2560x1440) - 최고화질' | 'FHD (1920x1080) - 권장 표준' | 'HD (1280x720) - 용량 절감' | 'Compact (960x540) - 모바일용';
  summary: string;
  specs: DeviceSpecs;
}

export const POLICIES: Record<DeviceTier, Omit<CapabilityPolicy, 'specs'>> = {
  High: {
    tier: 'High',
    hasWebGPU: true,
    hasWebCodecs: true,
    maxSimultaneousCams: 4,
    exportSupported: true,
    maxExportResolution: 'FHD (1920x1080) - 권장 표준',
    summary: '데스크톱 고성능 모드: 4채널 동시 풀프레임 재생 및 고속 하드웨어 비디오 내보내기 지원',
  },
  Mid: {
    tier: 'Mid',
    hasWebGPU: false,
    hasWebCodecs: true,
    maxSimultaneousCams: 3,
    exportSupported: true,
    maxExportResolution: 'HD (1280x720) - 용량 절감',
    summary: '표준 모드: 1:3 분할 재생 및 HD 내보내기 지원',
  },
  Low: {
    tier: 'Low',
    hasWebGPU: false,
    hasWebCodecs: false,
    maxSimultaneousCams: 1,
    exportSupported: false,
    maxExportResolution: 'Compact (960x540) - 모바일용',
    summary: '절전/저사양 모드: 단일 카메라 재생에 최적화됨',
  },
};

export function getDeviceTierReason(specs: { concurrency: number; memory: number; hasWebGPU: boolean; hasWebCodecs: boolean }): string {
  const { concurrency, memory, hasWebGPU, hasWebCodecs } = specs;
  if ((hasWebGPU || concurrency >= 8) && memory >= 6) {
    const accel = hasWebGPU ? i18n.t('tier_accel_webgpu') : i18n.t('tier_accel_multithread');
    return i18n.t('tier_reason_high', { concurrency, memory, accel });
  } else if (concurrency <= 2 || memory <= 2 || (!hasWebCodecs && !hasWebGPU)) {
    return i18n.t('tier_reason_low', { concurrency, memory });
  } else {
    return i18n.t('tier_reason_mid', { concurrency, memory });
  }
}

export async function detectDeviceCapabilities(): Promise<CapabilityPolicy> {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const win = typeof window !== 'undefined' ? window : null;

  const hasWebGPU = Boolean(nav && 'gpu' in nav && (nav as any).gpu);
  const hasWebCodecs = Boolean(win && 'VideoEncoder' in win && 'VideoDecoder' in win);

  const concurrency = (nav && nav.hardwareConcurrency) || 4;
  const memory = (nav && (nav as any).deviceMemory) || 4; // in GB

  let tier: DeviceTier = 'Mid';

  if ((hasWebGPU || concurrency >= 8) && memory >= 6) {
    tier = 'High';
  } else if (concurrency <= 2 || memory <= 2 || (!hasWebCodecs && !hasWebGPU)) {
    tier = 'Low';
  } else {
    tier = 'Mid';
  }

  const reason = getDeviceTierReason({ concurrency, memory, hasWebGPU, hasWebCodecs });

  const basePolicy = POLICIES[tier];
  const policy: CapabilityPolicy = {
    ...basePolicy,
    hasWebGPU,
    hasWebCodecs,
    exportSupported: hasWebCodecs,
    specs: {
      concurrency,
      memory,
      hasWebGPU,
      hasWebCodecs,
      reason,
    },
  };

  return policy;
}
