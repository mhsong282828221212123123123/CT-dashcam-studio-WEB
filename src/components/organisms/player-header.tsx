import { Show } from '@jellybrick/react-solid-flow';
import { ArrowUpRight, CircleHelp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/atoms/button';
import { Swap } from '@/components/atoms/swap';
import { formatFolderGroup } from '@/core/clip-scanner';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { normalizeLang } from '@/i18n';
import { introUrl } from '@/lib/links';
import { cn } from '@/lib/utils';
import { openTutorial } from '@/studio/playback';
import { formatTimecode } from '@/studio/range';
import { useStudio } from '@/studio/store';

import { LayoutMenu } from './layout-menu';
import { StudioBrandLink } from './studio-brand-link';

const ClipTitle = ({ compact }: { compact: boolean }) => {
  const { t } = useTranslation();
  const clip = useStudio((state) => state.activeClip);
  const durationSec = useStudio((state) => state.durationSec);
  const titleClass = compact ? 'text-head3' : 'text-head2';
  return (
    <Show when={clip} fallback={<h1 className={cn('truncate', titleClass)}>CT Dashcam Studio</h1>}>
      {(clip) => (
        <div className="min-w-0">
          <h1 className={cn('truncate typo-number', titleClass)}>{clip.timestampStr}</h1>
          <p
            className={cn(
              'truncate text-muted-foreground',
              compact ? 'text-body' : 'text-subtitle',
            )}
          >
            {formatFolderGroup(clip.folder, []).displayTitle.split(' - ')[0]} ·{' '}
            {Object.keys(clip.cams).length}
            {t('tag_channels')} · {formatTimecode(durationSec)}
          </p>
        </div>
      )}
    </Show>
  );
};

export const PlayerHeader = ({ className }: { className?: string }) => {
  const { i18n, t } = useTranslation();
  const compact = useLayoutMode() !== 'desktop';
  const clipId = useStudio((state) => state.activeClip?.id);
  const introHref = introUrl(normalizeLang(i18n.language) ?? 'en');
  return (
    <header className={cn('flex min-w-0 items-center justify-between gap-4', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        <Show when={compact}>
          <StudioBrandLink logoClassName="size-7" />
        </Show>
        <Swap id={clipId ?? 'none'} className="min-w-0">
          <ClipTitle compact={compact} />
        </Swap>
        <Button
          variant="tonal"
          size={compact ? 'xs' : 'sm'}
          nativeButton={false}
          render={<a href={introHref} aria-label={t('intro_link')} />}
          title={t('intro_link')}
        >
          <span>{t('intro_link')}</span>
          <ArrowUpRight className="size-3.5" />
        </Button>
      </div>
      <div className="flex shrink-0 items-center">
        <LayoutMenu iconOnly={compact} />
        <Button
          variant="quiet"
          size={compact ? 'icon-sm' : 'icon'}
          aria-label={t('tutorial_open')}
          title={t('tutorial_open')}
          onClick={openTutorial}
        >
          <CircleHelp />
        </Button>
      </div>
    </header>
  );
};
