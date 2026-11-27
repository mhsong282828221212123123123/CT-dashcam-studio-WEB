import { For } from '@jellybrick/react-solid-flow';
import { ChevronDown, LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/atoms/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/molecules/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/molecules/tooltip';
import { CAMERA_KEYS } from '@/core/constants';
import { chooseCamera, chooseLayout, isPillar, LAYOUTS } from '@/studio/layout-choices';
import { hasPillarCameras, useStudio } from '@/studio/store';

export const LayoutMenu = ({ iconOnly = false }: { iconOnly?: boolean }) => {
  const { t } = useTranslation();
  const layout = useStudio((state) => state.options.layout);
  const singleCam = useStudio((state) => state.options.single_cam);
  const pillars = hasPillarCameras(useStudio((state) => state.activeClip));
  const current = LAYOUTS.find((item) => item.value === layout);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="quiet"
            size={iconOnly ? 'icon-sm' : 'sm'}
            aria-label={t('label_layout_short')}
          />
        }
      >
        <LayoutGrid />
        {!iconOnly && current && t(current.key)}
        {!iconOnly && <ChevronDown className="size-3.5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('label_layout_short')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={layout} onValueChange={chooseLayout}>
            <For each={LAYOUTS}>
              {({ value, key }) => (
                <DropdownMenuRadioItem key={value} value={value} title={t(key)}>
                  {t(key)}
                </DropdownMenuRadioItem>
              )}
            </For>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('cam_select_title')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={layout === 'single' ? singleCam : null}
            onValueChange={chooseCamera}
          >
            <For each={CAMERA_KEYS}>
              {(camera) => {
                const item = (
                  <DropdownMenuRadioItem
                    key={camera}
                    value={camera}
                    disabled={isPillar(camera) && !pillars}
                  >
                    {t(`cam_${camera}`)}
                  </DropdownMenuRadioItem>
                );
                if (isPillar(camera) && !pillars) {
                  return (
                    <Tooltip key={camera}>
                      <TooltipTrigger render={<div className="cursor-not-allowed" />}>
                        {item}
                      </TooltipTrigger>
                      <TooltipContent side="left">{t('pillar_cam_na')}</TooltipContent>
                    </Tooltip>
                  );
                }
                return item;
              }}
            </For>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
