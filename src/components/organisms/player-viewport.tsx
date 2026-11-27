import { For, Show } from '@jellybrick/react-solid-flow';
import { useGesture } from '@use-gesture/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Fade } from '@/components/atoms/fade';
import { Spinner } from '@/components/atoms/spinner';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/molecules/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/molecules/tooltip';
import { CAMERA_KEYS } from '@/core/constants';
import { cn } from '@/lib/utils';
import {
  dragTelemetryColumn,
  hitTestTelemetryColumn,
  setDraggingColumn,
  toCanvasPoint,
  zoomCameraAt,
} from '@/studio/canvas-gestures';
import { chooseCamera, chooseLayout, isPillar, LAYOUTS } from '@/studio/layout-choices';
import { loadDroppedItems } from '@/studio/loading';
import { attachCanvas } from '@/studio/playback';
import { resetRange, setInPoint, setOutPoint } from '@/studio/range';
import { getStudio, hasPillarCameras, setTelemetryOrder, useStudio } from '@/studio/store';

import type { DragEvent } from 'react';

const SeiBadge = () => {
  const { t } = useTranslation();
  const progress = useStudio((state) => state.seiProgress);
  if (!progress) return null;
  const text =
    progress.parsedFrames !== undefined && progress.totalFrames !== undefined
      ? t('sei_analyzing_frames', {
          0: progress.pct,
          1: progress.parsedFrames,
          2: progress.totalFrames,
        })
      : t('sei_analyzing', { 0: progress.pct });
  return (
    <span className="pointer-events-none absolute top-4 left-4 flex items-center gap-2 rounded-full bg-glass px-3 py-1.5 text-body backdrop-blur-large typo-number">
      <Spinner aria-hidden className="text-attention" />
      {text}
    </span>
  );
};

const EmptyStage = () => {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-head1 text-muted-foreground">{t('preview_empty_title')}</h2>
      <p className="max-w-sm text-head3 font-normal text-faint-foreground">
        {t('preview_empty_description')}
      </p>
    </div>
  );
};

const StageMenu = () => {
  const { t } = useTranslation();
  const layout = useStudio((state) => state.options.layout);
  const singleCam = useStudio((state) => state.options.single_cam);
  const pillars = hasPillarCameras(useStudio((state) => state.activeClip));
  return (
    <ContextMenuContent>
      <ContextMenuGroup>
        <ContextMenuLabel>{t('label_layout_short')}</ContextMenuLabel>
        <ContextMenuRadioGroup value={layout} onValueChange={chooseLayout}>
          <For each={LAYOUTS}>
            {({ value, key }) => (
              <ContextMenuRadioItem key={value} value={value}>
                {t(key)}
              </ContextMenuRadioItem>
            )}
          </For>
        </ContextMenuRadioGroup>
      </ContextMenuGroup>
      <ContextMenuSub>
        <ContextMenuSubTrigger>{t('cam_select_title')}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup
            value={layout === 'single' ? singleCam : null}
            onValueChange={chooseCamera}
          >
            <For each={CAMERA_KEYS}>
              {(camera) => {
                const item = (
                  <ContextMenuRadioItem
                    key={camera}
                    value={camera}
                    disabled={isPillar(camera) && !pillars}
                  >
                    {t(`cam_${camera}`)}
                  </ContextMenuRadioItem>
                );
                if (isPillar(camera) && !pillars) {
                  return (
                    <Tooltip key={camera}>
                      <TooltipTrigger render={<div className="cursor-not-allowed" />}>
                        {item}
                      </TooltipTrigger>
                      <TooltipContent side="right">{t('pillar_cam_na')}</TooltipContent>
                    </Tooltip>
                  );
                }
                return item;
              }}
            </For>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={setInPoint}>
        {t('ctx_set_in')}
        <ContextMenuShortcut>I</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={setOutPoint}>
        {t('ctx_set_out')}
        <ContextMenuShortcut>O</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={resetRange}>{t('ctx_reset_range')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => setTelemetryOrder(null)}>
        {t('ctx_reset_telemetry')}
      </ContextMenuItem>
    </ContextMenuContent>
  );
};

export const PlayerViewport = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const empty = useStudio((state) => state.activeClip === null);
  const [dropping, setDropping] = useState(false);
  const [cursor, setCursor] = useState<'default' | 'grab' | 'grabbing'>('default');
  const lastTap = useRef({ time: 0, x: 0, y: 0 });

  const bind = useGesture<{ drag: PointerEvent }>({
    onDragStart: ({ xy: [x, y] }) => {
      const point = toCanvasPoint(x, y);
      const column = point && hitTestTelemetryColumn(point.cx, point.cy);
      if (!column) return;
      setDraggingColumn(column);
      setCursor('grabbing');
    },
    onDrag: ({ first, last, xy: [x, y] }) => {
      if (first || last || !getStudio().options.draggingCol) return;
      const point = toCanvasPoint(x, y);
      if (point) dragTelemetryColumn(point.cx, point.cy);
    },
    onDragEnd: ({ event, xy: [x, y] }) => {
      if (getStudio().options.draggingCol) {
        setDraggingColumn(null);
        setCursor('default');
      }
      if (event.pointerType !== 'touch') return;
      const now = performance.now();
      const previous = lastTap.current;
      if (now - previous.time < 350 && Math.hypot(x - previous.x, y - previous.y) < 30) {
        zoomCameraAt(x, y);
        lastTap.current = { time: 0, x: 0, y: 0 };
        return;
      }
      lastTap.current = { time: now, x, y };
    },
    onPointerMove: ({ event }) => {
      if (getStudio().options.draggingCol) return;
      const point = toCanvasPoint(event.clientX, event.clientY);
      setCursor(point && hitTestTelemetryColumn(point.cx, point.cy) ? 'grab' : 'default');
    },
  });
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropping(false);
    loadDroppedItems(event.dataTransfer.items).catch(reportError);
  };

  return (
    <ContextMenu disabled={empty}>
      <ContextMenuTrigger
        className={cn(
          'relative flex min-h-0 items-center justify-center overflow-hidden',
          empty ? 'bg-stage' : 'bg-black',
          className,
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        <canvas
          ref={attachCanvas}
          width={1920}
          height={1080}
          style={{ cursor }}
          className={cn('size-full touch-none object-contain', empty && 'invisible')}
          {...bind()}
          onDoubleClick={(event) => zoomCameraAt(event.clientX, event.clientY)}
        />
        <Show when={empty}>
          <EmptyStage />
        </Show>
        <Fade
          show={dropping}
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/25 text-head2"
        >
          {t('drop_overlay_text')}
        </Fade>
        <SeiBadge />
      </ContextMenuTrigger>
      <StageMenu />
    </ContextMenu>
  );
};
