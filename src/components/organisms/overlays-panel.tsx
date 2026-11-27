import { For, Show } from '@jellybrick/react-solid-flow';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ScrollArea } from '@/components/atoms/scroll-area';
import { OptionSelect } from '@/components/molecules/option-select';
import { PanelHeader } from '@/components/molecules/panel-header';
import { SliderField } from '@/components/molecules/slider-field';
import { SwitchRow } from '@/components/molecules/switch-row';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/molecules/tooltip';
import { TELEMETRY_STYLES } from '@/core/telemetry-style';
import { hasPillarCameras, setOption, useStudio } from '@/studio/store';

import { plainLabel } from './panel-tabs';

import type { RenderOptions } from '@/core/renderer';

type OverlayKey = keyof Pick<
  RenderOptions,
  | 'timestamp'
  | 'steering'
  | 'speed'
  | 'pedal'
  | 'fsd'
  | 'pillar_pip'
  | 'turn_signal'
  | 'map'
  | 'qr'
  | 'rear_crop'
  | 'rear_correction'
>;

const OVERLAY_KEYS: OverlayKey[] = [
  'timestamp',
  'speed',
  'steering',
  'pedal',
  'turn_signal',
  'fsd',
  'map',
  'pillar_pip',
  'rear_crop',
  'rear_correction',
  'qr',
];

const ImageAdjust = () => {
  const { t } = useTranslation();
  const brightness = useStudio((state) => state.options.brightness);
  const contrast = Math.round(useStudio((state) => state.options.contrast) * 100);
  return (
    <div className="flex flex-col gap-5">
      <SliderField
        label={t('slider_brightness_label')}
        resetTitle={t('tip_restore_bright')}
        min={-80}
        max={80}
        value={brightness}
        valueText={String(brightness)}
        onValueChange={(value) => setOption('brightness', value)}
        onReset={() => setOption('brightness', 0)}
      />
      <SliderField
        label={t('slider_contrast_label')}
        resetTitle={t('tip_restore_contrast')}
        min={50}
        max={200}
        value={contrast}
        valueText={`${contrast}%`}
        onValueChange={(value) => setOption('contrast', value / 100)}
        onReset={() => setOption('contrast', 1)}
      />
    </div>
  );
};

export const OverlaysPanel = () => {
  const { t } = useTranslation();
  const options = useStudio((state) => state.options);
  const activeClip = useStudio((state) => state.activeClip);
  const [crying, setCrying] = useState(false);
  const emotionRef = useRef<HTMLSpanElement>(null);
  const pillars = hasPillarCameras(activeClip);
  const pipAvailable = pillars && options.layout !== 'single';

  const onQrChange = (checked: boolean) => {
    setOption('qr', checked);
    const emotion = emotionRef.current;
    emotion?.getAnimations().forEach((animation) => animation.cancel());
    if (checked || !emotion) {
      setCrying(false);
      return;
    }
    setCrying(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = emotion.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 1 }]
        : [
            { transform: 'scale(1)' },
            { transform: 'scale(3)', offset: 0.35 },
            { transform: 'scale(1)' },
          ],
      { duration: 1000, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
    );
    animation.onfinish = () => setCrying(false);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title={t('drawer_overlays')} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 px-3 pb-2">
          <span className="text-subtitle">{t('hud_style')}</span>
          <OptionSelect
            label={t('hud_style')}
            value={options.telemetryStyle ?? 'classic'}
            options={TELEMETRY_STYLES.map((value) => ({ value, label: t(`hud_style_${value}`) }))}
            onValueChange={(value) => setOption('telemetryStyle', value)}
          />
        </div>
        <SwitchRow
          label={t('hud_new_mode_labels')}
          description={t('hud_new_mode_labels_description')}
          title={t('hud_new_mode_labels_description')}
          checked={options.newDriveModeLabels ?? false}
          onCheckedChange={(checked) => setOption('newDriveModeLabels', checked)}
        />
        <div className="flex flex-col">
          <For each={OVERLAY_KEYS}>
            {(key) => (
              <Show
                key={key}
                when={key === 'qr'}
                fallback={
                  key === 'pillar_pip' && !pillars ? (
                    <Tooltip>
                      <TooltipTrigger render={<div className="cursor-not-allowed" />}>
                        <SwitchRow
                          label={plainLabel(t('chk_pillar_pip'))}
                          description={t('pillar_cam_na')}
                          checked={options.pillar_pip}
                          disabled
                          onCheckedChange={(checked) => setOption('pillar_pip', checked)}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="right">{t('pillar_cam_na')}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <SwitchRow
                      label={plainLabel(t(`chk_${key}`))}
                      checked={options[key]}
                      disabled={key === 'pillar_pip' && !pipAvailable}
                      onCheckedChange={(checked) => setOption(key, checked)}
                    />
                  )
                }
              >
                <SwitchRow
                  label={
                    <>
                      {plainLabel(t('chk_qr').replace(/\s*🥺$/u, ''))}
                      <span ref={emotionRef} aria-hidden className="inline-block">
                        {crying ? '😭' : '🥺'}
                      </span>
                    </>
                  }
                  title={t('tip_qr_keep')}
                  description={t('tip_qr_keep')}
                  checked={options.qr}
                  onCheckedChange={onQrChange}
                />
              </Show>
            )}
          </For>
        </div>
        <h3 className="px-3 pt-8 pb-4 text-title text-muted-foreground">{t('group_adjust')}</h3>
        <div className="pb-6">
          <ImageAdjust />
        </div>
      </ScrollArea>
    </section>
  );
};
