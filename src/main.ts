// Main Application Entrypoint for CT Dashcam Studio Web
import { RealTeslaSEIDecoder, BlobFileHandle, TelemetryData } from './core/seiDecoder';
import { groupFilesIntoClips, scanFileSystemDirectory, FolderGroup, ClipItem } from './core/clipScanner';
import { OverlayRenderer, RenderOptions, DEFAULT_RENDER_OPTIONS, DEFAULT_TELEMETRY_ORDER, COL_WIDTH_BASE } from './core/renderer';
import { detectDeviceCapabilities, CapabilityPolicy } from './core/capability';
import { WebCodecsExporter, ExportClipSegment } from './core/exporter';
import { RESOLUTIONS, CameraKey } from './core/constants';

export interface RangePoint {
  clipId: string;
  folder: string;
  timestampRaw: string;
  timestampStr: string;
  sec: number;
  absTimeMs: number;
}

export function parseClipTimeMs(timestampRaw: string): number {
  const parts = timestampRaw.split('_');
  if (parts.length === 2) {
    const [y, m, d] = parts[0].split('-').map(Number);
    const [hh, mm, ss] = parts[1].split('-').map(Number);
    return new Date(y, m - 1, d, hh, mm, ss).getTime();
  }
  return 0;
}

class CTDashcamStudioApp {
  private policy: CapabilityPolicy | null = null;
  private folderGroups: FolderGroup[] = [];
  private activeClip: ClipItem | null = null;
  private clipDecoders: Map<string, RealTeslaSEIDecoder> = new Map();

  // Playback state
  private isPlaying = false;
  private currentTimeSec = 0;
  private durationSec = 60.0;
  private fps = 36.0;
  private options: RenderOptions = { ...DEFAULT_RENDER_OPTIONS };

  // Video elements pool
  private videoPool: Partial<Record<CameraKey, HTMLVideoElement>> = {};
  private videoContainer: HTMLElement;
  private canvas: HTMLCanvasElement;

  // In / Out multi-clip range
  startPoint: RangePoint | null = null;
  endPoint: RangePoint | null = null;

  get inPointSec(): number | null {
    if (!this.startPoint || !this.activeClip) return null;
    return this.startPoint.clipId === this.activeClip.id ? this.startPoint.sec : null;
  }
  get outPointSec(): number | null {
    if (!this.endPoint || !this.activeClip) return null;
    return this.endPoint.clipId === this.activeClip.id ? this.endPoint.sec : null;
  }

  // Layout history for double-click toggle
  private prevLayoutBeforeSingle: RenderOptions['layout'] = '기본 (1:3 세로배치)';

  // Telemetry dragging state
  private isDraggingTelemetry = false;
  private draggingColKey: string | null = null;
  private dragStartX = 0;

  // Exporter
  private exporter = new WebCodecsExporter();
  private isExporting = false;

  // View Mode ('auto' | 'mobile' | 'desktop')
  private viewMode: 'auto' | 'mobile' | 'desktop' = 'auto';
  private isLandscapeDrawerOpen = false;

  constructor() {
    this.canvas = document.getElementById('player-canvas') as HTMLCanvasElement;
    this.videoContainer = document.getElementById('hidden-video-container') as HTMLElement;

    this.loadSavedSettings();
    this.initViewMode();
    this.initCapabilities();
    this.setupEventListeners();
    this.setupShortcuts();
    this.setupCanvasInteractions();
    this.startRenderLoop();

    (window as any).app = this;
    console.log('[App] CT Dashcam Studio Web initialized');
  }

  private loadSavedSettings() {
    try {
      const savedOrder = localStorage.getItem('ct_telemetry_order');
      if (savedOrder) {
        this.options.telemetryOrder = JSON.parse(savedOrder);
      }
      const savedLayout = localStorage.getItem('ct_layout');
      if (savedLayout) {
        this.options.layout = savedLayout as any;
      }
    } catch {
      // fallback
    }
  }

  private isMobileDevice(): boolean {
    const ua = navigator.userAgent || '';
    const isTouch = navigator.maxTouchPoints > 0;
    const isMobileUa = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isSmallScreen = window.innerWidth <= 850;
    return isMobileUa || (isTouch && isSmallScreen) || isSmallScreen;
  }

  private initViewMode() {
    const saved = localStorage.getItem('ct_view_mode') as 'auto' | 'mobile' | 'desktop' | null;
    this.viewMode = saved || 'auto';
    this.applyViewMode();

    // 1. Mobile top bar toggle button
    document.getElementById('btn-toggle-view-mode')?.addEventListener('click', () => {
      this.toggleViewMode();
    });

    // 2. Floating toggle button (shown in PC mode on mobile device)
    document.getElementById('btn-floating-view-mode')?.addEventListener('click', () => {
      this.toggleViewMode();
    });

    // 3. Mobile tab buttons switching
    const tabBtns = document.querySelectorAll('.mobile-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (!targetTab) return;
        tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
        const sections = document.querySelectorAll('.mobile-tab-section');
        sections.forEach((sec) => {
          sec.classList.toggle('active', sec.getAttribute('data-mobile-tab') === targetTab);
        });
      });
    });

    // 4. Landscape drawer button
    const btnDrawer = document.getElementById('btn-landscape-drawer');
    const sidebar = document.getElementById('sidebar-panel');
    btnDrawer?.addEventListener('click', () => {
      this.isLandscapeDrawerOpen = !this.isLandscapeDrawerOpen;
      sidebar?.classList.toggle('landscape-drawer-open', this.isLandscapeDrawerOpen);
      if (btnDrawer) btnDrawer.textContent = this.isLandscapeDrawerOpen ? '✕ 닫기' : '🎬 클립 목록';
    });

    // Close drawer when selecting a clip in landscape
    document.getElementById('clips-tree')?.addEventListener('click', () => {
      if (this.isLandscapeDrawerOpen) {
        this.isLandscapeDrawerOpen = false;
        sidebar?.classList.remove('landscape-drawer-open');
        if (btnDrawer) btnDrawer.textContent = '🎬 클립 목록';
      }
    });

    window.addEventListener('resize', () => {
      if (this.viewMode === 'auto') {
        this.applyViewMode();
      }
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.applyViewMode(), 150);
    });
  }

  private applyViewMode() {
    const isMobile = this.viewMode === 'auto' ? this.isMobileDevice() : this.viewMode === 'mobile';
    const body = document.body;
    const btnToggle = document.getElementById('btn-toggle-view-mode');
    const btnFloating = document.getElementById('btn-floating-view-mode');

    if (isMobile) {
      body.classList.add('view-mobile');
      body.classList.remove('view-desktop');
      if (btnToggle) btnToggle.textContent = '🖥️ PC버전';
      if (btnFloating) btnFloating.style.display = 'none';
    } else {
      body.classList.add('view-desktop');
      body.classList.remove('view-mobile');
      if (btnToggle) btnToggle.textContent = '📱 모바일';
      if (btnFloating) {
        btnFloating.style.display = this.isMobileDevice() ? 'flex' : 'none';
      }
    }
    this.updatePlayButton();
  }

  private toggleViewMode() {
    const isCurrentlyMobile = this.viewMode === 'auto' ? this.isMobileDevice() : this.viewMode === 'mobile';
    this.viewMode = isCurrentlyMobile ? 'desktop' : 'mobile';
    localStorage.setItem('ct_view_mode', this.viewMode);
    this.applyViewMode();
  }

  private async initCapabilities() {
    this.policy = await detectDeviceCapabilities();
    const tierBadge = document.getElementById('tier-badge');
    const mobileTierBadge = document.getElementById('mobile-tier-badge');
    const tooltipTier = document.getElementById('tooltip-current-tier');
    const tooltipReason = document.getElementById('tooltip-reason');
    const modalTier = document.getElementById('modal-current-tier');
    const modalTierReason = document.getElementById('modal-tier-reason');

    const tierLower = this.policy.tier.toLowerCase();
    if (tierBadge) {
      tierBadge.textContent = `${this.policy.tier} Tier`;
      tierBadge.className = `tier-pill ${tierLower}`;
    }
    if (mobileTierBadge) {
      mobileTierBadge.textContent = `${this.policy.tier} Tier`;
      mobileTierBadge.className = `tier-pill-mobile ${tierLower}`;
    }
    if (tooltipTier) {
      tooltipTier.textContent = `${this.policy.tier} Tier`;
      tooltipTier.className = `tooltip-badge ${tierLower}`;
    }
    if (tooltipReason) {
      tooltipReason.textContent = this.policy.specs.reason;
    }
    if (modalTier) {
      modalTier.textContent = `${this.policy.tier} Tier`;
      modalTier.className = `tooltip-badge ${tierLower}`;
    }
    if (modalTierReason) {
      modalTierReason.textContent = this.policy.specs.reason;
    }

    // Check secure context / WebCodecs availability
    const warningEl = document.getElementById('webcodecs-warning');
    if (warningEl) {
      if (typeof VideoEncoder === 'undefined' || !window.isSecureContext) {
        warningEl.style.display = 'block';
      } else {
        warningEl.style.display = 'none';
      }
    }
  }

  private setupEventListeners() {
    // Tier Guide Modal (Mobile tap / Desktop click)
    const tierModal = document.getElementById('tier-modal');
    const openTierModal = () => {
      if (tierModal) tierModal.style.display = 'flex';
    };
    const closeTierModal = () => {
      if (tierModal) tierModal.style.display = 'none';
    };
    document.getElementById('mobile-tier-badge')?.addEventListener('click', openTierModal);
    document.getElementById('tier-badge')?.addEventListener('click', openTierModal);
    document.getElementById('btn-close-tier')?.addEventListener('click', closeTierModal);
    document.getElementById('btn-confirm-tier')?.addEventListener('click', closeTierModal);
    tierModal?.addEventListener('click', (e) => {
      if (e.target === tierModal) closeTierModal();
    });
    // 1. Open Folder Button & Fallback Input
    const btnOpenFolder = document.getElementById('btn-open-folder');
    const fallbackInput = document.getElementById('fallback-file-input') as HTMLInputElement;

    btnOpenFolder?.addEventListener('click', async () => {
      if ('showDirectoryPicker' in window) {
        try {
          const dirHandle = await (window as any).showDirectoryPicker();
          const files = await scanFileSystemDirectory(dirHandle);
          this.loadFiles(files);
        } catch (e: any) {
          if (e.name !== 'AbortError') {
            fallbackInput.click();
          }
        }
      } else {
        fallbackInput.click();
      }
    });

    fallbackInput?.addEventListener('change', () => {
      if (fallbackInput.files && fallbackInput.files.length > 0) {
        this.loadFiles(Array.from(fallbackInput.files));
      }
    });

    // Drag and Drop Folder
    const dropArea = document.querySelector('.canvas-container') as HTMLElement;
    const dropOverlay = document.getElementById('drop-overlay');

    dropArea?.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dropOverlay) dropOverlay.style.display = 'flex';
    });

    dropArea?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      if (dropOverlay) dropOverlay.style.display = 'none';
    });

    dropArea?.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (dropOverlay) dropOverlay.style.display = 'none';

      if (e.dataTransfer && e.dataTransfer.items) {
        const files: File[] = [];
        const items = Array.from(e.dataTransfer.items);

        for (const item of items) {
          const entry = (item as any).webkitGetAsEntry?.();
          if (entry) {
            await this.traverseEntry(entry, '', files);
          } else {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }

        if (files.length > 0) {
          this.loadFiles(files);
        }
      }
    });

    // 2. Overlay Checkboxes
    const chkKeys: (keyof RenderOptions)[] = [
      'timestamp', 'steering', 'speed', 'pedal',
      'fsd', 'pillar_pip', 'turn_signal', 'map'
    ];

    chkKeys.forEach((key) => {
      const elId = key === 'pillar_pip' ? 'chk-pillar-pip' : `chk-${key.replace('_', '-')}`;
      const chk = document.getElementById(elId) as HTMLInputElement;
      if (chk) {
        chk.checked = Boolean(this.options[key]);
        chk.addEventListener('change', () => {
          (this.options as any)[key] = chk.checked;
        });
      }
    });

    this.updatePillarPipState();

    // 3. Layout Segmented Buttons
    const layoutBtns = document.querySelectorAll('.btn-layout');
    const singlePopup = document.getElementById('single-cam-popup');

    layoutBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetLayout = btn.getAttribute('data-layout') as RenderOptions['layout'];
        if (targetLayout === '단일 카메라') {
          // Toggle floating popup
          if (singlePopup) {
            singlePopup.style.display = singlePopup.style.display === 'none' ? 'block' : 'none';
          }
        } else {
          if (singlePopup) singlePopup.style.display = 'none';
          this.setLayoutMode(targetLayout);
        }
      });
    });

    // Single Camera Option Buttons in Popup
    document.querySelectorAll('.btn-cam-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-cam-option').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const camKey = btn.getAttribute('data-cam') as CameraKey;
        this.options.single_cam = camKey;
        if (singlePopup) singlePopup.style.display = 'none';
        this.setLayoutMode('단일 카메라');
      });
    });

    // Close single camera popup on outside click
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#single-cam-popup') && !target.closest('#btn-layout-single')) {
        if (singlePopup) singlePopup.style.display = 'none';
      }
    });

    // 4. Export Settings Changes
    document.getElementById('export-resolution')?.addEventListener('change', () => this.updateEstimatedSize());
    document.getElementById('export-speed-select')?.addEventListener('change', () => {
      const speedVal = parseFloat((document.getElementById('export-speed-select') as HTMLSelectElement).value);
      this.options.exportSpeed = speedVal;
      this.updateEstimatedSize();
    });
    document.getElementById('export-fps-select')?.addEventListener('change', () => this.updateEstimatedSize());

    // 5. Main Export Button
    document.getElementById('btn-export')?.addEventListener('click', () => {
      if (this.isExporting) {
        this.exporter.cancel();
      } else {
        this.startExport();
      }
    });

    // 6. Timeline Scrubber Click & Drag (Pointer Events for Touch & Mouse)
    const track = document.getElementById('timeline-track');
    let isScrubbing = false;

    const handleScrub = (clientX: number) => {
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const posRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.seekTo(posRatio * this.durationSec);
    };

    track?.addEventListener('pointerdown', (e: PointerEvent) => {
      isScrubbing = true;
      try {
        track.setPointerCapture(e.pointerId);
      } catch {}
      handleScrub(e.clientX);
    });

    track?.addEventListener('pointermove', (e: PointerEvent) => {
      if (isScrubbing) handleScrub(e.clientX);
    });

    const stopScrub = (e: PointerEvent) => {
      if (isScrubbing) {
        isScrubbing = false;
        try {
          track?.releasePointerCapture(e.pointerId);
        } catch {}
      }
    };

    track?.addEventListener('pointerup', stopScrub);
    track?.addEventListener('pointercancel', stopScrub);

    // 7. In / Out Point Buttons
    document.getElementById('btn-set-in')?.addEventListener('click', () => {
      this.setInPoint();
    });

    document.getElementById('btn-set-out')?.addEventListener('click', () => {
      this.setOutPoint();
    });

    document.getElementById('btn-reset-range')?.addEventListener('click', () => {
      this.resetRange();
    });

    // 8. Transport Playback Buttons
    document.getElementById('btn-prev-clip')?.addEventListener('click', () => this.prevClip());
    document.getElementById('btn-play')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('btn-next-clip')?.addEventListener('click', () => this.nextClip());

    // 9. Speed Slider
    const speedSlider = document.getElementById('slider-preview-speed') as HTMLInputElement;
    const speedValBadge = document.getElementById('lbl-preview-speed-val');
    const speedTag = document.getElementById('lbl-speed-tag');

    speedSlider?.addEventListener('input', () => {
      const idx = parseInt(speedSlider.value);
      const speeds = [0.5, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 8.0];
      const spd = speeds[idx - 1] || 1.0;
      this.options.playbackSpeed = spd;
      if (speedValBadge) speedValBadge.textContent = `${spd.toFixed(1)}x`;
      this.applyPlaybackSpeed();
    });

    // Double-click to reset speed to 1.0x
    const resetSpeed = () => {
      if (speedSlider) speedSlider.value = '2';
      this.options.playbackSpeed = 1.0;
      if (speedValBadge) speedValBadge.textContent = '1.0x';
      this.applyPlaybackSpeed();
    };
    speedTag?.addEventListener('dblclick', resetSpeed);
    speedValBadge?.addEventListener('dblclick', resetSpeed);

    // 10. Brightness & Contrast Sliders (Synced between main and mobile tabs)
    const brSlider = document.getElementById('slider-brightness') as HTMLInputElement;
    const brSliderSub = document.getElementById('slider-brightness-sub') as HTMLInputElement;
    const brSubVal = document.getElementById('lbl-brightness-sub-val');
    const brTag = document.getElementById('lbl-brightness-tag');
    const brSubTag = document.getElementById('lbl-brightness-sub-tag');

    const setBrightness = (val: number) => {
      this.options.brightness = val;
      if (brSlider) brSlider.value = String(val);
      if (brSliderSub) brSliderSub.value = String(val);
      if (brSubVal) brSubVal.textContent = String(val);
    };

    brSlider?.addEventListener('input', () => setBrightness(parseInt(brSlider.value)));
    brSliderSub?.addEventListener('input', () => setBrightness(parseInt(brSliderSub.value)));
    brTag?.addEventListener('dblclick', () => setBrightness(0));
    brSubTag?.addEventListener('dblclick', () => setBrightness(0));

    const ctSlider = document.getElementById('slider-contrast') as HTMLInputElement;
    const ctSliderSub = document.getElementById('slider-contrast-sub') as HTMLInputElement;
    const ctSubVal = document.getElementById('lbl-contrast-sub-val');
    const ctTag = document.getElementById('lbl-contrast-tag');
    const ctSubTag = document.getElementById('lbl-contrast-sub-tag');

    const setContrast = (val: number) => {
      this.options.contrast = val / 100.0;
      if (ctSlider) ctSlider.value = String(val);
      if (ctSliderSub) ctSliderSub.value = String(val);
      if (ctSubVal) ctSubVal.textContent = `${val}%`;
    };

    ctSlider?.addEventListener('input', () => setContrast(parseInt(ctSlider.value)));
    ctSliderSub?.addEventListener('input', () => setContrast(parseInt(ctSliderSub.value)));
    ctTag?.addEventListener('dblclick', () => setContrast(100));
    ctSubTag?.addEventListener('dblclick', () => setContrast(100));

    // 11. Hotkey Guide Modal
    const hotkeyModal = document.getElementById('hotkey-modal');
    document.getElementById('btn-hotkey-guide')?.addEventListener('click', () => {
      if (hotkeyModal) hotkeyModal.style.display = 'flex';
    });
    document.getElementById('btn-close-hotkey')?.addEventListener('click', () => {
      if (hotkeyModal) hotkeyModal.style.display = 'none';
    });
    document.getElementById('btn-confirm-hotkey')?.addEventListener('click', () => {
      if (hotkeyModal) hotkeyModal.style.display = 'none';
    });
  }

  private getCanvasCoordinatesFromPoint(clientX: number, clientY: number): { cx: number; cy: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const canvasRatio = this.canvas.width / this.canvas.height;
    const elemRatio = rect.width / rect.height;

    let contentW = rect.width;
    let contentH = rect.height;
    let offX = 0;
    let offY = 0;

    if (elemRatio > canvasRatio + 1e-4) {
      contentW = rect.height * canvasRatio;
      offX = (rect.width - contentW) / 2;
    } else if (elemRatio < canvasRatio - 1e-4) {
      contentH = rect.width / canvasRatio;
      offY = (rect.height - contentH) / 2;
    }

    const mouseX = clientX - rect.left - offX;
    const mouseY = clientY - rect.top - offY;

    if (mouseX < 0 || mouseX > contentW || mouseY < 0 || mouseY > contentH) {
      return null;
    }

    const cx = (mouseX / contentW) * this.canvas.width;
    const cy = (mouseY / contentH) * this.canvas.height;
    return { cx, cy };
  }

  private getCanvasCoordinates(e: MouseEvent): { cx: number; cy: number } | null {
    return this.getCanvasCoordinatesFromPoint(e.clientX, e.clientY);
  }

  private hitTestTelemetryCol(cx: number, cy: number): string | null {
    const scale = this.canvas.width / 1920.0;
    const { colBoxMap, offsetX, frontH, bottomH } = OverlayRenderer.computeTelemetryLayout(this.options, this.canvas.width, this.canvas.height);
    if (bottomH <= 0 || cy < frontH) return null;

    const pad = 12 * scale;
    for (const [k, [x1, w]] of Object.entries(colBoxMap)) {
      const absX1 = offsetX + x1 - pad;
      const absX2 = offsetX + x1 + w + pad;
      if (cx >= absX1 && cx <= absX2) {
        return k;
      }
    }
    return null;
  }

  private updateTelemetryDrag(cx: number): boolean {
    if (!this.draggingColKey) return false;
    const { colBoxMap, offsetX, bottomH } = OverlayRenderer.computeTelemetryLayout(this.options, this.canvas.width, this.canvas.height);
    if (bottomH <= 0 || !colBoxMap[this.draggingColKey]) return false;

    const currentOrder = [...(this.options.telemetryOrder || DEFAULT_TELEMETRY_ORDER)];
    const activeKeys = currentOrder.filter((k) => k in colBoxMap);
    if (!activeKeys.includes(this.draggingColKey) || activeKeys.length < 2) return false;

    const curIdx = activeKeys.indexOf(this.draggingColKey);
    let targetKey: string | null = null;

    if (curIdx > 0) {
      const leftKey = activeKeys[curIdx - 1];
      const [lx1, lw] = colBoxMap[leftKey];
      if (cx < offsetX + lx1 + lw * 0.55) {
        targetKey = leftKey;
      }
    }
    if (!targetKey && curIdx < activeKeys.length - 1) {
      const rightKey = activeKeys[curIdx + 1];
      const [rx1, rw] = colBoxMap[rightKey];
      if (cx > offsetX + rx1 + rw * 0.45) {
        targetKey = rightKey;
      }
    }

    if (targetKey) {
      const idxA = currentOrder.indexOf(this.draggingColKey);
      const idxB = currentOrder.indexOf(targetKey);
      if (idxA >= 0 && idxB >= 0) {
        currentOrder[idxA] = targetKey;
        currentOrder[idxB] = this.draggingColKey;
        this.options.telemetryOrder = currentOrder;
        localStorage.setItem('ct_telemetry_order', JSON.stringify(currentOrder));
        return true;
      }
    }
    return false;
  }

  private handleCanvasSlotZoom(clientX: number, clientY: number) {
    const coords = this.getCanvasCoordinatesFromPoint(clientX, clientY);
    if (!coords) return;
    const { cx, cy } = coords;

    const scale = this.canvas.width / 1920.0;
    const hasBottomHud = this.options.map || this.options.timestamp || this.options.speed || this.options.fsd || this.options.turn_signal || this.options.steering || this.options.pedal;
    const bottomH = hasBottomHud ? Math.round(180 * scale) : 0;
    const frontH = this.canvas.height - bottomH;

    // If clicked inside HUD bottom bar, reset telemetry order
    if (cy >= frontH) {
      this.options.telemetryOrder = [...DEFAULT_TELEMETRY_ORDER];
      localStorage.removeItem('ct_telemetry_order');
      return;
    }

    // If already in single camera mode, restore previous layout
    if (this.options.layout === '단일 카메라') {
      this.setLayoutMode(this.prevLayoutBeforeSingle || '기본 (1:3 세로배치)');
      return;
    }

    this.prevLayoutBeforeSingle = this.options.layout;
    let targetCam: CameraKey | null = null;
    const is2x2 = this.options.layout === '2x2 분할 (전후/좌우)';

    // 1. Check Pillar PIP hits if active
    if (this.options.pillar_pip) {
      const pw = Math.round((is2x2 ? 236 : 320) * scale);
      const ph = Math.round((is2x2 ? 132 : 180) * scale);
      const lpX = Math.round(8 * scale);
      const lpY = frontH - ph - Math.round(8 * scale);
      const frontW = is2x2 ? this.canvas.width : this.canvas.width - Math.round(480 * scale);
      const rpX = frontW - pw - Math.round(8 * scale);
      const rpY = frontH - ph - Math.round(8 * scale);

      if (cx >= lpX && cx <= lpX + pw && cy >= lpY && cy <= lpY + ph) {
        targetCam = 'left_pillar';
      } else if (cx >= rpX && cx <= rpX + pw && cy >= rpY && cy <= rpY + ph) {
        targetCam = 'right_pillar';
      }
    }

    // 2. Check main camera slots
    if (!targetCam) {
      if (is2x2) {
        const halfW = this.canvas.width / 2;
        const halfH = frontH / 2;
        if (cx < halfW) {
          targetCam = cy < halfH ? 'front' : 'back';
        } else {
          targetCam = cy < halfH ? 'left_repeater' : 'right_repeater';
        }
      } else {
        // 1:3 layout
        const subW = Math.round(480 * scale);
        const frontW = this.canvas.width - subW;
        if (cx < frontW) {
          targetCam = 'front';
        } else {
          const slotIdx = Math.min(2, Math.max(0, Math.floor(cy / (frontH / 3.0))));
          targetCam = (['back', 'left_repeater', 'right_repeater'] as CameraKey[])[slotIdx];
        }
      }
    }

    if (this.activeClip && targetCam) {
      const availCams = this.activeClip.cams;
      if (!availCams[targetCam]) {
        return;
      }
    }

    if (targetCam) {
      this.options.single_cam = targetCam;
      document.querySelectorAll('.btn-cam-option').forEach((b) => {
        if (b.getAttribute('data-cam') === targetCam) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      this.setLayoutMode('단일 카메라');
    }
  }

  private setupCanvasInteractions() {
    // 1. Double click on camera slot: Toggle Single Camera Fullscreen
    this.canvas.addEventListener('dblclick', (e) => {
      this.handleCanvasSlotZoom(e.clientX, e.clientY);
    });

    // 1-1. Mobile Touch Double-Tap detection
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    this.canvas.addEventListener('touchend', (e: TouchEvent) => {
      if (e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const now = performance.now();
        const dist = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);
        if (now - lastTapTime < 350 && dist < 30) {
          this.handleCanvasSlotZoom(touch.clientX, touch.clientY);
          lastTapTime = 0;
          return;
        }
        lastTapTime = now;
        lastTapX = touch.clientX;
        lastTapY = touch.clientY;
      }
    });

    // 2. Mouse / Touch drag inside HUD bar to reorder telemetry columns (Pointer Events)
    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      const coords = this.getCanvasCoordinatesFromPoint(e.clientX, e.clientY);
      if (!coords) return;
      const hitKey = this.hitTestTelemetryCol(coords.cx, coords.cy);
      if (hitKey) {
        this.isDraggingTelemetry = true;
        this.draggingColKey = hitKey;
        this.options.draggingCol = hitKey;
        this.canvas.style.cursor = 'grabbing';
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {}
      }
    });

    this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
      const coords = this.getCanvasCoordinatesFromPoint(e.clientX, e.clientY);
      if (!coords) {
        if (!this.isDraggingTelemetry) this.canvas.style.cursor = 'default';
        return;
      }
      if (this.isDraggingTelemetry) {
        this.canvas.style.cursor = 'grabbing';
        this.updateTelemetryDrag(coords.cx);
      } else {
        const hitKey = this.hitTestTelemetryCol(coords.cx, coords.cy);
        this.canvas.style.cursor = hitKey ? 'grab' : 'default';
      }
    });

    const stopTelemetryDrag = (e: PointerEvent) => {
      if (this.isDraggingTelemetry) {
        this.isDraggingTelemetry = false;
        this.draggingColKey = null;
        this.options.draggingCol = null;
        this.canvas.style.cursor = 'default';
        try {
          this.canvas.releasePointerCapture(e.pointerId);
        } catch {}
      }
    };

    this.canvas.addEventListener('pointerup', stopTelemetryDrag);
    this.canvas.addEventListener('pointercancel', stopTelemetryDrag);
  }

  private setLayoutMode(mode: RenderOptions['layout']) {
    this.options.layout = mode;
    localStorage.setItem('ct_layout', mode);

    document.querySelectorAll('.btn-layout').forEach((btn) => {
      if (btn.getAttribute('data-layout') === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    this.updatePillarPipState();
  }

  private updatePillarPipState() {
    const chkPip = document.getElementById('chk-pillar-pip') as HTMLInputElement;
    if (!chkPip) return;
    const hasPillars = Boolean(
      this.activeClip && (this.activeClip.cams.left_pillar || this.activeClip.cams.right_pillar)
    );
    const isMulticam = this.options.layout === '기본 (1:3 세로배치)' || this.options.layout === '2x2 분할 (전후/좌우)';
    const canEnable = hasPillars && isMulticam;

    chkPip.disabled = !canEnable;
    if (!canEnable) {
      chkPip.checked = false;
      this.options.pillar_pip = false;
    } else {
      chkPip.checked = true;
      this.options.pillar_pip = true;
    }
  }

  private async traverseEntry(entry: any, currentPath: string, files: File[]) {
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file((file: File) => {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: currentPath ? `${currentPath}/${file.name}` : file.name,
            writable: false,
          });
          files.push(file);
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries = await new Promise<any[]>((resolve) => {
        dirReader.readEntries((res: any[]) => resolve(res));
      });
      const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      for (const child of entries) {
        await this.traverseEntry(child, nextPath, files);
      }
    }
  }

  private setupShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.seekRelative(e.shiftKey ? -5.0 : -1.0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.seekRelative(e.shiftKey ? 5.0 : 1.0);
          break;
        case 'Home':
          e.preventDefault();
          this.seekTo(0);
          break;
        case 'BracketLeft':
          e.preventDefault();
          this.prevClip();
          break;
        case 'BracketRight':
          e.preventDefault();
          this.nextClip();
          break;
        case 'KeyI':
          e.preventDefault();
          this.setInPoint();
          break;
        case 'KeyO':
          e.preventDefault();
          this.setOutPoint();
          break;
        case 'F1':
        case 'Slash':
          if (e.key === '?' || e.code === 'F1') {
            e.preventDefault();
            const modal = document.getElementById('hotkey-modal');
            if (modal) modal.style.display = 'flex';
          }
          break;
      }
    });
  }

  loadFiles(files: File[]) {
    console.log('[App] loadFiles called with', files.length, 'files');
    this.folderGroups = groupFilesIntoClips(files);
    console.log('[App] Parsed folderGroups count:', this.folderGroups.length);
    this.renderClipsTree();

    // Select first clip if available
    if (this.folderGroups.length > 0 && this.folderGroups[0].clips.length > 0) {
      this.selectClip(this.folderGroups[0].clips[0]);
    }

    // Background parking/driving determination
    this.determineClipsParkingStatus();
  }

  private async determineClipsParkingStatus() {
    for (const group of this.folderGroups) {
      for (const clip of group.clips) {
        if (clip.isParking !== undefined) continue;
        const frontFile = clip.cams.front;
        if (frontFile) {
          const handle = new BlobFileHandle(frontFile);
          const isParking = await RealTeslaSEIDecoder.quickCheckIsParking(handle);
          clip.isParking = isParking;

          // Update UI row badge
          const tagEl = document.getElementById(`tag-${clip.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
          if (tagEl) {
            tagEl.className = `clip-type-tag ${isParking ? 'parking' : 'driving'}`;
            tagEl.textContent = `[${isParking ? '주차' : '주행'}] ${Object.keys(clip.cams).length}채널`;
          }
        }
      }
    }
  }

  private renderClipsTree() {
    const container = document.getElementById('clips-tree');
    if (!container) return;
    container.innerHTML = '';

    if (this.folderGroups.length === 0) {
      container.innerHTML = '<div class="empty-state">유효한 TeslaCam 클립을 찾을 수 없습니다.</div>';
      return;
    }

    this.folderGroups.forEach((group) => {
      const folderDiv = document.createElement('div');
      folderDiv.className = 'folder-node';

      const folderHeader = document.createElement('div');
      folderHeader.className = 'folder-header';
      folderHeader.innerHTML = `<span>📁</span> <span>${group.folderName} (${group.clips.length})</span>`;

      const clipsContainer = document.createElement('div');
      clipsContainer.className = 'folder-clips';

      group.clips.forEach((clip) => {
        const clipDiv = document.createElement('div');
        clipDiv.className = `clip-node ${this.activeClip?.id === clip.id ? 'active' : ''}`;
        clipDiv.id = `clip-item-${clip.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

        const camCount = Object.keys(clip.cams).length;
        const isParking = clip.isParking ?? (clip.folder.includes('Sentry') || clip.folder.includes('Parking'));
        const tagClass = isParking ? 'parking' : 'driving';
        const tagText = `[${isParking ? '주차' : '주행'}] ${camCount}채널`;

        clipDiv.innerHTML = `
          <span>🎬 ${clip.timestampStr}</span>
          <span id="tag-${clip.id.replace(/[^a-zA-Z0-9_-]/g, '_')}" class="clip-type-tag ${tagClass}">${tagText}</span>
        `;

        clipDiv.addEventListener('click', () => {
          this.selectClip(clip);
        });

        clipsContainer.appendChild(clipDiv);
      });

      folderDiv.appendChild(folderHeader);
      folderDiv.appendChild(clipsContainer);
      container.appendChild(folderDiv);
    });
  }

  async selectClip(clip: ClipItem) {
    this.activeClip = clip;
    this.isPlaying = false;
    this.currentTimeSec = 0;

    this.updateRangeUI();
    this.updateEstimatedSize();
    this.updatePillarPipState();

    // Update active row in explorer table
    document.querySelectorAll('.clip-node').forEach((el) => el.classList.remove('active'));
    const activeEl = document.getElementById(`clip-item-${clip.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (activeEl) activeEl.classList.add('active');

    // Setup Video Elements
    this.videoContainer.innerHTML = '';
    this.videoPool = {};

    const camKeys = Object.keys(clip.cams) as CameraKey[];
    for (const key of camKeys) {
      const file = clip.cams[key];
      if (!file) continue;

      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      this.videoContainer.appendChild(video);
      this.videoPool[key] = video;
    }

    // Get duration from master video
    const masterVideo = this.videoPool.front || Object.values(this.videoPool)[0];
    if (masterVideo) {
      await new Promise<void>((resolve) => {
        if (masterVideo.readyState >= 1) resolve();
        else masterVideo.onloadedmetadata = () => resolve();
      });
      this.durationSec = masterVideo.duration || 60.0;
    }

    // Parse SEI data from front camera
    if (clip.cams.front && !this.clipDecoders.has(clip.id)) {
      const decoder = new RealTeslaSEIDecoder();
      const handle = new BlobFileHandle(clip.cams.front);
      await decoder.parseMp4Sei(handle);
      this.clipDecoders.set(clip.id, decoder);
    }

    this.seekTo(0);
    this.updatePlayButton();
  }

  private togglePlay() {
    this.isPlaying = !this.isPlaying;
    const masterVideo = this.videoPool.front || Object.values(this.videoPool)[0];

    if (this.isPlaying) {
      if (masterVideo && masterVideo.ended) {
        this.seekTo(0);
      }
      Object.values(this.videoPool).forEach((v) => {
        if (v) v.play().catch(() => {});
      });
    } else {
      Object.values(this.videoPool).forEach((v) => {
        if (v) v.pause();
      });
    }
    this.updatePlayButton();
  }

  private seekTo(targetSec: number) {
    this.currentTimeSec = Math.max(0, Math.min(this.durationSec, targetSec));
    Object.values(this.videoPool).forEach((v) => {
      if (v) v.currentTime = this.currentTimeSec;
    });
    this.updateTimelineUI();
  }

  private seekRelative(deltaSec: number) {
    this.seekTo(this.currentTimeSec + deltaSec);
  }

  private prevClip() {
    if (!this.activeClip) return;
    const allClips = this.folderGroups.flatMap((g) => g.clips);
    const idx = allClips.findIndex((c) => c.id === this.activeClip!.id);
    if (idx > 0) {
      this.selectClip(allClips[idx - 1]);
    }
  }

  private nextClip(auto = false) {
    if (!this.activeClip) return;
    const allClips = this.folderGroups.flatMap((g) => g.clips);
    const idx = allClips.findIndex((c) => c.id === this.activeClip!.id);
    if (idx >= 0 && idx < allClips.length - 1) {
      this.selectClip(allClips[idx + 1]);
      if (auto) {
        setTimeout(() => this.togglePlay(), 100);
      }
    }
  }

  private applyPlaybackSpeed() {
    Object.values(this.videoPool).forEach((v) => {
      if (v) v.playbackRate = this.options.playbackSpeed;
    });
  }

  private startRenderLoop() {
    const loop = () => {
      const masterVideo = this.videoPool.front || Object.values(this.videoPool)[0];
      if (masterVideo && this.isPlaying) {
        this.currentTimeSec = masterVideo.currentTime;
        if (masterVideo.ended) {
          const chkAutoNext = document.getElementById('chk-auto-next') as HTMLInputElement;
          if (chkAutoNext && chkAutoNext.checked) {
            this.nextClip(true);
          } else {
            this.isPlaying = false;
            this.updatePlayButton();
          }
        }

        // Sync other cameras
        const keys = Object.keys(this.videoPool) as CameraKey[];
        for (const k of keys) {
          const v = this.videoPool[k];
          if (v && v !== masterVideo) {
            if (Math.abs(v.currentTime - masterVideo.currentTime) > 0.08) {
              v.currentTime = masterVideo.currentTime;
            }
          }
        }
        this.updateTimelineUI();
      }

      this.renderFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private renderFrame() {
    const currentFrameIdx = Math.round(this.currentTimeSec * this.fps);
    const decoder = this.activeClip ? this.clipDecoders.get(this.activeClip.id) : null;
    const telemetry = decoder ? decoder.getFrameTelemetry(currentFrameIdx) : {
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

    const baseDateStr = this.activeClip ? this.activeClip.timestampStr : '2026-10-07 00:00:00';

    OverlayRenderer.render(
      this.canvas,
      this.videoPool,
      telemetry,
      baseDateStr,
      this.currentTimeSec,
      currentFrameIdx,
      this.fps,
      this.options
    );
  }

  private updatePlayButton() {
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay) {
      const isMobile = this.viewMode === 'auto' ? this.isMobileDevice() : this.viewMode === 'mobile';
      if (this.isPlaying) {
        btnPlay.textContent = isMobile ? '⏸ 일시정지' : '⏸ 일시정지 (Space)';
        btnPlay.classList.add('playing');
      } else {
        btnPlay.textContent = isMobile ? '▶ 재생' : '▶ 재생 (Space)';
        btnPlay.classList.remove('playing');
      }
    }
  }

  private formatTimeHms(sec: number): string {
    const totalSec = Math.floor(sec);
    const h = Math.floor(totalSec / 3600);
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  private updateTimelineUI() {
    const progressBar = document.getElementById('timeline-progress');
    const thumb = document.getElementById('timeline-thumb');
    const timeDisplay = document.getElementById('time-display');

    const pct = this.durationSec > 0 ? (this.currentTimeSec / this.durationSec) * 100 : 0;
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (thumb) thumb.style.left = `${pct}%`;

    if (timeDisplay) {
      timeDisplay.textContent = `${this.formatTimeHms(this.currentTimeSec)} / ${this.formatTimeHms(this.durationSec)}`;
    }
  }

  setInPoint() {
    if (!this.activeClip) return;
    const baseMs = parseClipTimeMs(this.activeClip.timestampRaw);
    const currAbsMs = baseMs + this.currentTimeSec * 1000;

    if (this.endPoint) {
      if (currAbsMs >= this.endPoint.absTimeMs) {
        alert('시작점이 끝점보다 뒤이거나 같습니다.\n시간 순서가 올바르지 않습니다.');
        return;
      }
      const durSec = (this.endPoint.absTimeMs - currAbsMs) / 1000.0;
      if (durSec > 1800.0) {
        alert(`선택 구간이 ${(durSec / 60.0).toFixed(1)}분입니다.\n최대 내보내기 가능 길이는 30분(1,800초)입니다.`);
        return;
      }
    }

    this.startPoint = {
      clipId: this.activeClip.id,
      folder: this.activeClip.folder,
      timestampRaw: this.activeClip.timestampRaw,
      timestampStr: this.activeClip.timestampStr,
      sec: this.currentTimeSec,
      absTimeMs: currAbsMs,
    };

    this.updateRangeUI();
    this.updateEstimatedSize();
  }

  setOutPoint() {
    if (!this.activeClip) return;
    const baseMs = parseClipTimeMs(this.activeClip.timestampRaw);
    const currAbsMs = baseMs + this.currentTimeSec * 1000;

    if (this.startPoint) {
      if (currAbsMs <= this.startPoint.absTimeMs) {
        alert('끝점이 시작점보다 앞서거나 같습니다.\n시간 순서가 올바르지 않습니다.');
        return;
      }
      const durSec = (currAbsMs - this.startPoint.absTimeMs) / 1000.0;
      if (durSec > 1800.0) {
        alert(`선택 구간이 ${(durSec / 60.0).toFixed(1)}분입니다.\n최대 내보내기 가능 길이는 30분(1,800초)입니다.`);
        return;
      }
    }

    this.endPoint = {
      clipId: this.activeClip.id,
      folder: this.activeClip.folder,
      timestampRaw: this.activeClip.timestampRaw,
      timestampStr: this.activeClip.timestampStr,
      sec: this.currentTimeSec,
      absTimeMs: currAbsMs,
    };

    this.updateRangeUI();
    this.updateEstimatedSize();
  }

  resetRange() {
    this.startPoint = null;
    this.endPoint = null;
    this.updateRangeUI();
    this.updateEstimatedSize();
  }

  buildTargetClipChain(): ExportClipSegment[] {
    if (!this.activeClip) return [];

    if (!this.startPoint && !this.endPoint) {
      return [
        {
          clip: this.activeClip,
          startSec: 0,
          endSec: this.durationSec,
          baseTimeStr: this.activeClip.timestampStr,
        },
      ];
    }

    const allClips = this.folderGroups.flatMap((g) => g.clips);
    const sId = this.startPoint ? this.startPoint.clipId : this.activeClip.id;
    const eId = this.endPoint ? this.endPoint.clipId : this.activeClip.id;

    let startIdx = allClips.findIndex((c) => c.id === sId);
    let endIdx = allClips.findIndex((c) => c.id === eId);

    if (startIdx === -1 || endIdx === -1) {
      return [
        {
          clip: this.activeClip,
          startSec: 0,
          endSec: this.durationSec,
          baseTimeStr: this.activeClip.timestampStr,
        },
      ];
    }

    if (startIdx > endIdx) {
      const tmp = startIdx;
      startIdx = endIdx;
      endIdx = tmp;
    }

    const segments: ExportClipSegment[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const c = allClips[i];
      const cDur = c.durationSec || 60.0;
      let segStart = 0;
      let segEnd = cDur;

      if (i === startIdx && this.startPoint) {
        segStart = this.startPoint.sec;
      }
      if (i === endIdx && this.endPoint) {
        segEnd = this.endPoint.sec;
      }

      segStart = Math.max(0, Math.min(segStart, cDur));
      segEnd = Math.max(0, Math.min(segEnd, cDur));

      if (segStart < segEnd) {
        segments.push({
          clip: c,
          startSec: segStart,
          endSec: segEnd,
          baseTimeStr: c.timestampStr,
        });
      }
    }

    return segments;
  }

  updateRangeUI() {
    const rangeLayer = document.getElementById('timeline-range');
    const rangeText = document.getElementById('range-text');

    if (!this.activeClip) {
      if (rangeLayer) rangeLayer.style.display = 'none';
      if (rangeText) rangeText.textContent = '선택 구간: 미지정';
      return;
    }

    const curClipBaseMs = parseClipTimeMs(this.activeClip.timestampRaw);
    const curClipEndMs = curClipBaseMs + this.durationSec * 1000;

    let inSecForCurrent: number | null = null;
    let outSecForCurrent: number | null = null;

    if (this.startPoint && this.endPoint) {
      if (this.startPoint.clipId === this.activeClip.id && this.endPoint.clipId === this.activeClip.id) {
        inSecForCurrent = this.startPoint.sec;
        outSecForCurrent = this.endPoint.sec;
      } else if (this.startPoint.clipId === this.activeClip.id) {
        inSecForCurrent = this.startPoint.sec;
        outSecForCurrent = this.durationSec;
      } else if (this.endPoint.clipId === this.activeClip.id) {
        inSecForCurrent = 0;
        outSecForCurrent = this.endPoint.sec;
      } else if (curClipBaseMs >= this.startPoint.absTimeMs && curClipEndMs <= this.endPoint.absTimeMs) {
        inSecForCurrent = 0;
        outSecForCurrent = this.durationSec;
      }
    } else if (this.startPoint) {
      if (this.startPoint.clipId === this.activeClip.id) {
        inSecForCurrent = this.startPoint.sec;
        outSecForCurrent = this.durationSec;
      } else if (curClipBaseMs >= this.startPoint.absTimeMs) {
        inSecForCurrent = 0;
        outSecForCurrent = this.durationSec;
      }
    } else if (this.endPoint) {
      if (this.endPoint.clipId === this.activeClip.id) {
        inSecForCurrent = 0;
        outSecForCurrent = this.endPoint.sec;
      } else if (curClipEndMs <= this.endPoint.absTimeMs) {
        inSecForCurrent = 0;
        outSecForCurrent = this.durationSec;
      }
    }

    if (rangeLayer) {
      if (inSecForCurrent !== null && outSecForCurrent !== null && inSecForCurrent <= outSecForCurrent) {
        const inPct = Math.max(0, Math.min(100, (inSecForCurrent / this.durationSec) * 100));
        const outPct = Math.max(0, Math.min(100, (outSecForCurrent / this.durationSec) * 100));
        rangeLayer.style.display = 'block';
        rangeLayer.style.left = `${inPct}%`;
        rangeLayer.style.width = `${Math.max(0.2, outPct - inPct)}%`;
      } else {
        rangeLayer.style.display = 'none';
      }
    }

    // Update range info text
    const formatHms = (d: Date) => {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    };

    if (this.startPoint && this.endPoint) {
      const dur = ((this.endPoint.absTimeMs - this.startPoint.absTimeMs) / 1000).toFixed(1);
      const t1 = formatHms(new Date(this.startPoint.absTimeMs));
      const t2 = formatHms(new Date(this.endPoint.absTimeMs));
      const chain = this.buildTargetClipChain();
      const multiInfo = chain.length > 1 ? ` (${chain.length}개 파일 연속)` : '';
      if (rangeText) {
        rangeText.textContent = `구간: ${t1} ~ ${t2} (총 ${dur}초${multiInfo})`;
      }
    } else if (this.startPoint) {
      const t1 = formatHms(new Date(this.startPoint.absTimeMs));
      if (rangeText) rangeText.textContent = `시작점: ${t1} (끝점 선택 필요)`;
    } else if (this.endPoint) {
      const t2 = formatHms(new Date(this.endPoint.absTimeMs));
      if (rangeText) rangeText.textContent = `끝점: ${t2} (시작점 선택 필요)`;
    } else {
      if (rangeText) {
        rangeText.textContent = `선택 구간: 미지정 (전체 ${this.durationSec.toFixed(1)}초)`;
      }
    }

    // Update tree item highlights
    const allClips = this.folderGroups.flatMap((g) => g.clips);
    const sMs = this.startPoint ? this.startPoint.absTimeMs : (this.endPoint ? curClipBaseMs : null);
    const eMs = this.endPoint ? this.endPoint.absTimeMs : (this.startPoint ? curClipEndMs : null);

    allClips.forEach((c) => {
      const elId = `clip-item-${c.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const el = document.getElementById(elId);
      if (!el) return;
      if (sMs !== null && eMs !== null) {
        const cBase = parseClipTimeMs(c.timestampRaw);
        const cEnd = cBase + (c.durationSec || 60.0) * 1000;
        if (cBase < eMs && cEnd > sMs) {
          el.classList.add('in-range');
        } else {
          el.classList.remove('in-range');
        }
      } else {
        el.classList.remove('in-range');
      }
    });
  }

  private updateEstimatedSize() {
    const resSelect = document.getElementById('export-resolution') as HTMLSelectElement;
    const speedSelect = document.getElementById('export-speed-select') as HTMLSelectElement;
    const estLabel = document.getElementById('lbl-est-size');
    if (!resSelect || !estLabel) return;

    const resConfig = RESOLUTIONS[resSelect.value] || RESOLUTIONS['FHD (1920x1080) - 권장 표준'];
    const exportSpeed = parseFloat(speedSelect?.value || '1.0');

    let durationSec = this.durationSec;
    if (this.startPoint && this.endPoint) {
      durationSec = Math.max(0.1, (this.endPoint.absTimeMs - this.startPoint.absTimeMs) / 1000.0);
    } else {
      const chain = this.buildTargetClipChain();
      durationSec = chain.reduce((sum, seg) => sum + (seg.endSec - seg.startSec), 0);
    }

    // Bitrate calculation matching Python original
    const estMb = (resConfig.bitrate_mbps * 1_000_000 / 8 * durationSec) / (exportSpeed * 1024 * 1024);
    estLabel.textContent = `예상 크기: 약 ${estMb.toFixed(1)} MB`;
  }

  private async startExport() {
    if (!this.activeClip) return;

    if (typeof VideoEncoder === 'undefined') {
      alert('브라우저 보안 정책상 HTTP 환경(공유기 IP)에서는 WebCodecs 비디오 인코딩이 지원되지 않습니다.\nHTTPS(dev:https)로 접속하거나 데스크톱 로컬(localhost)에서 내보내기를 진행해 주세요.');
      return;
    }

    const resSelect = document.getElementById('export-resolution') as HTMLSelectElement;
    const speedSelect = document.getElementById('export-speed-select') as HTMLSelectElement;
    const fpsSelect = document.getElementById('export-fps-select') as HTMLSelectElement;
    const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
    const pbarContainer = document.getElementById('export-pbar-container');
    const pbarFill = document.getElementById('export-pbar-fill');
    const statusLabel = document.getElementById('export-status-label');

    const targetFps = fpsSelect ? parseInt(fpsSelect.value) || 36 : 36;
    const segments = this.buildTargetClipChain();
    if (segments.length === 0) {
      alert('내보낼 영상 구간이 없습니다.');
      return;
    }

    this.isExporting = true;
    if (btnExport) {
      btnExport.textContent = '⏹ 내보내기 취소';
      btnExport.classList.add('cancelling');
    }
    if (pbarContainer) pbarContainer.style.display = 'block';
    if (statusLabel) {
      statusLabel.style.display = 'block';
      statusLabel.textContent = `인코딩 준비 중... (총 ${segments.length}개 파일 구간)`;
    }
    if (pbarFill) pbarFill.style.width = '0%';

    try {
      const blob = await this.exporter.exportMultiClip({
        segments,
        getClipDecoder: async (clip: ClipItem) => {
          if (!this.clipDecoders.has(clip.id)) {
            if (clip.cams.front) {
              const decoder = new RealTeslaSEIDecoder();
              const handle = new BlobFileHandle(clip.cams.front);
              await decoder.parseMp4Sei(handle);
              this.clipDecoders.set(clip.id, decoder);
            }
          }
          return this.clipDecoders.get(clip.id) || null;
        },
        sourceFps: this.fps,
        targetFps,
        exportSpeed: parseFloat(speedSelect?.value || '1.0'),
        resolutionName: resSelect.value as any,
        options: this.options,
        onProgress: (pct, curSeg, totalSeg) => {
          if (statusLabel) {
            statusLabel.textContent = `인코딩 진행 중: ${pct}% [파일 ${curSeg}/${totalSeg}]`;
          }
          if (pbarFill) pbarFill.style.width = `${pct}%`;
        },
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = segments.length > 1
        ? `TeslaCam_${segments[0].clip.timestampRaw}_to_${segments[segments.length - 1].clip.timestampRaw}_export.mp4`
        : `TeslaCam_${segments[0].clip.timestampRaw}_export.mp4`;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      if (statusLabel) statusLabel.textContent = '비디오 렌더링이 성공적으로 완료되었습니다!';
    } catch (e: any) {
      if (statusLabel) statusLabel.textContent = `오류 발생: ${e.message}`;
    } finally {
      this.isExporting = false;
      if (btnExport) {
        btnExport.textContent = '선택 구간 내보내기 (MP4)';
        btnExport.classList.remove('cancelling');
      }
      setTimeout(() => {
        if (!this.isExporting && statusLabel && statusLabel.textContent?.includes('완료')) {
          if (pbarContainer) pbarContainer.style.display = 'none';
          if (statusLabel) statusLabel.style.display = 'none';
        }
      }, 4000);
    }
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new CTDashcamStudioApp();
});
