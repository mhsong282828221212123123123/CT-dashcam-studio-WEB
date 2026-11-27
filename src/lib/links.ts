import type { SupportedLang } from '@/i18n';

export const WEB_REPO = 'https://github.com/mhsong282828221212123123123/CT-dashcam-studio-WEB';
export const PC_REPO = 'https://github.com/mhsong282828221212123123123/CT-dashcam-studio';
export const NACS_MAP_URL = 'https://mhsong282828221212123123123.github.io/CT-NACS-MAP/';
export const FEEDBACK_URL = 'https://forms.gle/Lh1doyRZNAZ6cqRk9';

export const INTRO_SLUGS: Record<SupportedLang, string> = {
  'ko': 'kr',
  'en': 'en',
  'ja': 'jp',
  'zh-CN': 'zh-cn',
  'zh-TW': 'zh-tw',
  'de': 'de',
  'fr': 'fr',
  'es': 'es',
};

export const introUrl = (lang: SupportedLang, base = import.meta.env.BASE_URL): string => {
  const normalized = base.endsWith('/') ? base : `${base}/`;
  const siteRoot = normalized.replace(/preview\/pr-1\/$/, '');
  return `${siteRoot}intro/${INTRO_SLUGS[lang]}/`;
};
