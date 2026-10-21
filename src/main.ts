// Main Application Entrypoint for CT Dashcam Studio Web
import { RealTeslaSEIDecoder, BlobFileHandle, TelemetryData } from './core/seiDecoder';
import {
  groupFilesIntoClips,
  scanFileSystemDirectory,
  formatFolderGroup,
  FolderGroup,
  ClipItem,
  ScannedFileItem,
  getClipFile,
  ensureClipFiles,
  CAM_REGEX,
  yieldToCompositor,
} from './core/clipScanner';
import { SeiWorkerResponse } from './core/seiWorker';
import { OverlayRenderer, RenderOptions, DEFAULT_RENDER_OPTIONS, DEFAULT_TELEMETRY_ORDER, COL_WIDTH_BASE } from './core/renderer';
import { detectDeviceCapabilities, CapabilityPolicy, getDeviceTierReason } from './core/capability';
import { WebCodecsExporter, ExportClipSegment } from './core/exporter';
import { RESOLUTIONS, CameraKey } from './core/constants';
import { i18n, SupportedLang, isIOSOrAndroid, isIOS } from './core/i18n';

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
    const [hh, mm, ss] = parts[1].replace(/:/g, '-').split('-').map(Number);
    return new Date(y, m - 1, d, hh, mm, ss).getTime();
  }
  return 0;
}

// Early capture of PWA beforeinstallprompt event for Desktop & Mobile
let globalDeferredPrompt: any = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalDeferredPrompt = e;
  });
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
  private currentVideoUrls: string[] = [];
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

  // Clip Map for O(1) lookup
  private clipMap: Map<string, ClipItem> = new Map();

  private loadGeneration = 0;
  private isSelectingClip = false;

  // Background SEI telemetry worker & generation token
  private seiWorker: Worker | null = null;
  private currentClipGeneration = 0;

  // Mobile portrait bottom sheet state
  private isExplorerExpanded = false;

  constructor() {
    this.canvas = document.getElementById('player-canvas') as HTMLCanvasElement;
    this.videoContainer = document.getElementById('hidden-video-container') as HTMLElement;

    this.loadSavedSettings();
    i18n.applyDOM();
    this.initViewMode();
    this.initCapabilities();
    this.initClipsTreeEventDelegation();
    this.setupEventListeners();
    this.initPWAInstall();
    this.updateFpsOptions();
    this.setupShortcuts();
    this.setupCanvasInteractions();
    this.initSeiWorker();
    this.startRenderLoop();
    this.initDevBadge();

    i18n.onChange(() => {
      this.updatePlayButton();
      this.applyViewMode();
      this.renderClipsTree();
      this.updateRangeUI();
      this.updateFpsOptions(false);
      this.updateEstimatedSize();
      this.updateTierDisplay();
    });

    (window as any).app = this;
    console.log('[App] CT Dashcam Studio Web initialized');
  }

  private initDevBadge() {
    const isDevDeployment = typeof window !== 'undefined' && (
      window.location.pathname.includes('/dev/') ||
      (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL?.includes('/dev/'))
    );
    if (isDevDeployment) {
      document.querySelectorAll('.footer-brand, .brand-title').forEach((el) => {
        if (!el.querySelector('.badge-dev-pill')) {
          const badge = document.createElement('span');
          badge.className = 'badge-dev-pill';
          badge.textContent = 'DEV';
          el.appendChild(badge);
        }
      });
    }
  }

  private initSeiWorker() {
    try {
      if (typeof Worker !== 'undefined') {
        this.seiWorker = new Worker(new URL('./core/seiWorker.ts', import.meta.url), { type: 'module' });
        this.seiWorker.onmessage = (e: MessageEvent<SeiWorkerResponse>) => {
          this.handleSeiWorkerMessage(e.data);
        };
        this.seiWorker.onerror = (err) => {
          console.warn('[App] seiWorker error, falling back to main-thread async decoder:', err);
          this.seiWorker = null;
        };
      }
    } catch (e) {
      console.warn('[App] Could not initialize seiWorker, using main-thread fallback:', e);
      this.seiWorker = null;
    }
  }

  private handleSeiWorkerMessage(msg: SeiWorkerResponse) {
    if (msg.generation !== this.currentClipGeneration) return;

    if (msg.type === 'progress') {
      this.showSeiProgress(msg.pct, msg.parsedFrames, msg.totalFrames);
    } else if (msg.type === 'complete') {
      const decoder = new RealTeslaSEIDecoder();
      decoder.telemetryCache = new Map(msg.entries);
      decoder.sortedKeys = Array.from(decoder.telemetryCache.keys()).sort((a, b) => a - b);
      decoder.maxSpeedKmh = msg.maxSpeedKmh;
      decoder.hasSeiData = msg.hasSeiData;

      this.clipDecoders.set(msg.clipId, decoder);
      this.hideSeiProgress();

      // Trigger redraw of telemetry overlays if paused
      if (!this.isPlaying) {
        this.renderFrame();
      }
    } else if (msg.type === 'error') {
      console.warn('[App] seiWorker error for clip', msg.clipId, msg.error);
      this.hideSeiProgress();
    }
  }

  showLoadProgress(title: string, countText: string, pct: number, indeterminate = false) {
    const banner = document.getElementById('load-progress-banner');
    const titleEl = document.getElementById('load-progress-title');
    const countEl = document.getElementById('load-progress-count');
    const fillEl = document.getElementById('load-progress-fill');
    if (!banner || !titleEl || !countEl || !fillEl) return;

    banner.style.display = 'flex';
    titleEl.textContent = title;
    countEl.textContent = countText;

    if (indeterminate) {
      fillEl.classList.add('indeterminate');
      fillEl.style.width = '35%';
    } else {
      fillEl.classList.remove('indeterminate');
      fillEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }
  }

  hideLoadProgress() {
    const banner = document.getElementById('load-progress-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  showSeiProgress(pct: number, parsedFrames?: number, totalFrames?: number) {
    const badge = document.getElementById('sei-progress-badge');
    const textEl = document.getElementById('sei-progress-text');
    if (!badge || !textEl) return;

    badge.style.display = 'flex';
    if (parsedFrames !== undefined && totalFrames !== undefined) {
      textEl.textContent = i18n.t('sei_analyzing_frames', [pct, parsedFrames, totalFrames]);
    } else {
      textEl.textContent = i18n.t('sei_analyzing', [pct]);
    }
  }

  hideSeiProgress() {
    const badge = document.getElementById('sei-progress-badge');
    if (badge) {
      badge.style.display = 'none';
    }
  }

  showToast(message: string, durationMs = 6000) {
    let toast = document.getElementById('app-toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast-notification';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span class="toast-icon">⚠️</span><span class="toast-message">${message}</span><button class="toast-close" type="button" aria-label="닫기">✕</button>`;
    toast.querySelector('.toast-close')?.addEventListener('click', () => {
      if (toast) toast.style.display = 'none';
    });
    toast.style.display = 'flex';

    if ((toast as any)._timeout) {
      clearTimeout((toast as any)._timeout);
    }
    (toast as any)._timeout = setTimeout(() => {
      if (toast) toast.style.display = 'none';
    }, durationMs);
  }

  private loadSavedSettings() {
    try {
      // 앱 실행 시 이전 레이아웃 잔여값을 정리하여 항상 기본 레이아웃으로 시작
      localStorage.removeItem('ct_layout');
      const savedOrder = localStorage.getItem('ct_telemetry_order');
      if (savedOrder) {
        this.options.telemetryOrder = JSON.parse(savedOrder);
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

  private isMobilePortrait(): boolean {
    if (document.body.classList.contains('view-desktop')) return false;
    const isPortrait = window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
    return this.isMobileDevice() && isPortrait;
  }

  toggleExplorerSheet(force?: boolean) {
    if (!this.isMobilePortrait()) {
      document.body.classList.remove('explorer-expanded');
      const backdrop = document.getElementById('mobile-sheet-backdrop');
      if (backdrop) backdrop.style.display = 'none';
      this.isExplorerExpanded = false;
      return;
    }

    const shouldExpand = force !== undefined ? force : !this.isExplorerExpanded;
    this.isExplorerExpanded = shouldExpand;
    document.body.classList.toggle('explorer-expanded', shouldExpand);
    const backdrop = document.getElementById('mobile-sheet-backdrop');
    if (backdrop) backdrop.style.display = shouldExpand ? 'block' : 'none';

    if (shouldExpand) {
      requestAnimationFrame(() => {
        if (this.activeClip) {
          const activeEl = document.getElementById(`clip-item-${this.activeClip.safeId}`);
          activeEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    }
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

    // 3. Mobile & Drawer tab buttons switching
    let currentMobileTab = 'clips';
    const updateActiveTab = (targetTab: string) => {
      currentMobileTab = targetTab;
      document.querySelectorAll('.mobile-tab-btn, .drawer-tab-btn').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-tab') === targetTab);
      });
      document.querySelectorAll('.mobile-tab-section').forEach((sec) => {
        sec.classList.toggle('active', sec.getAttribute('data-mobile-tab') === targetTab);
      });
      if (targetTab !== 'clips') {
        this.toggleExplorerSheet(false);
      }
    };

    document.querySelectorAll('.mobile-tab-btn, .drawer-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (!targetTab) return;
        if (targetTab === 'clips') {
          if (currentMobileTab === 'clips') {
            this.toggleExplorerSheet();
          } else {
            updateActiveTab(targetTab);
            this.toggleExplorerSheet(true);
          }
        } else {
          updateActiveTab(targetTab);
        }
      });
    });

    // 3-1. Mobile bottom sheet header & backdrop controls
    const btnCloseSheet = document.getElementById('btn-close-explorer-sheet');
    const sheetBackdrop = document.getElementById('mobile-sheet-backdrop');
    const explorerHeader = document.querySelector('.explorer-header') as HTMLElement | null;
    const dragHandle = document.querySelector('.explorer-drag-handle') as HTMLElement | null;

    btnCloseSheet?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleExplorerSheet(false);
    });

    sheetBackdrop?.addEventListener('click', () => {
      this.toggleExplorerSheet(false);
    });

    explorerHeader?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('#btn-close-explorer-sheet')) return;
      if (!this.isExplorerExpanded && this.isMobilePortrait()) {
        this.toggleExplorerSheet(true);
      }
    });

    dragHandle?.addEventListener('click', () => {
      if (this.isMobilePortrait()) {
        this.toggleExplorerSheet(!this.isExplorerExpanded);
      }
    });

    // Vertical swipe gestures for sheet
    let sheetTouchStartY = 0;
    const onSheetTouchStart = (e: Event) => {
      const te = e as TouchEvent;
      if (te.touches && te.touches.length === 1) sheetTouchStartY = te.touches[0].clientY;
    };
    const onSheetTouchEnd = (e: Event) => {
      const te = e as TouchEvent;
      if (te.changedTouches && te.changedTouches.length === 1 && this.isMobilePortrait()) {
        const deltaY = te.changedTouches[0].clientY - sheetTouchStartY;
        if (deltaY < -25 && !this.isExplorerExpanded) {
          this.toggleExplorerSheet(true);
        } else if (deltaY > 25 && this.isExplorerExpanded) {
          this.toggleExplorerSheet(false);
        }
      }
    };
    explorerHeader?.addEventListener('touchstart', onSheetTouchStart as any, { passive: true });
    explorerHeader?.addEventListener('touchend', onSheetTouchEnd as any, { passive: true });
    dragHandle?.addEventListener('touchstart', onSheetTouchStart as any, { passive: true });
    dragHandle?.addEventListener('touchend', onSheetTouchEnd as any, { passive: true });

    // 4. Landscape Drawer controls: open, close, backdrop, swipe-to-close
    const btnDrawer = document.getElementById('btn-landscape-drawer');
    const btnCloseDrawer = document.getElementById('btn-close-drawer');
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    const sidebar = document.getElementById('sidebar-panel');

    const openDrawer = () => {
      this.isLandscapeDrawerOpen = true;
      if (sidebar) {
        sidebar.style.transform = '';
        sidebar.classList.add('landscape-drawer-open');
      }
      if (backdrop) backdrop.style.display = 'block';
      if (btnDrawer) btnDrawer.textContent = i18n.t('btn_close');
    };

    const closeDrawer = () => {
      this.isLandscapeDrawerOpen = false;
      if (sidebar) {
        sidebar.style.transform = '';
        sidebar.classList.remove('landscape-drawer-open');
      }
      if (backdrop) backdrop.style.display = 'none';
      if (btnDrawer) btnDrawer.textContent = i18n.t('btn_drawer_menu');
    };

    btnDrawer?.addEventListener('click', () => {
      if (this.isLandscapeDrawerOpen) closeDrawer();
      else openDrawer();
    });

    btnCloseDrawer?.addEventListener('click', () => closeDrawer());
    backdrop?.addEventListener('click', () => closeDrawer());

    // Close drawer when selecting a clip in landscape
    document.getElementById('clips-tree')?.addEventListener('click', () => {
      if (this.isLandscapeDrawerOpen) closeDrawer();
    });

    // Swipe-to-close touch gesture on sidebar drawer
    let touchStartX = 0;
    let touchStartY = 0;
    let isDrawerSwiping = false;

    sidebar?.addEventListener('touchstart', (e: TouchEvent) => {
      if (this.isLandscapeDrawerOpen && e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isDrawerSwiping = true;
      }
    }, { passive: true });

    sidebar?.addEventListener('touchmove', (e: TouchEvent) => {
      if (!isDrawerSwiping || !this.isLandscapeDrawerOpen || e.touches.length !== 1) return;
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = currentX - touchStartX;
      const deltaY = currentY - touchStartY;

      // Only handle horizontal swipe left (negative deltaX)
      if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < 0 && sidebar) {
        sidebar.style.transition = 'none';
        sidebar.style.transform = `translateX(${deltaX}px)`;
      }
    }, { passive: true });

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isDrawerSwiping || !this.isLandscapeDrawerOpen) return;
      isDrawerSwiping = false;
      if (sidebar) sidebar.style.transition = '';
      const currentX = e.changedTouches[0]?.clientX || touchStartX;
      const deltaX = currentX - touchStartX;

      if (deltaX < -40) {
        // Swiped left by more than 40px -> close drawer!
        closeDrawer();
      } else {
        // Snap back open
        if (sidebar) sidebar.style.transform = '';
      }
    };

    sidebar?.addEventListener('touchend', handleTouchEnd);
    sidebar?.addEventListener('touchcancel', handleTouchEnd);

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
    const btnOpenFolder = document.getElementById('btn-open-folder-text') || document.getElementById('btn-open-folder');
    const btnOpenFiles = document.getElementById('btn-open-files-text') || document.getElementById('btn-open-files');

    if (btnOpenFolder) {
      const isMobileTarget = isIOSOrAndroid() || isMobile;
      btnOpenFolder.textContent = isMobileTarget ? i18n.t('btn_open_folder_mobile') : i18n.t('btn_open_folder');
    }
    if (btnOpenFiles) {
      btnOpenFiles.textContent = i18n.t('btn_open_files');
    }

    if (isMobile) {
      body.classList.add('view-mobile');
      body.classList.remove('view-desktop');
      if (btnToggle) btnToggle.textContent = i18n.t('btn_pc_mode');
      if (btnFloating) btnFloating.style.display = 'none';
    } else {
      body.classList.add('view-desktop');
      body.classList.remove('view-mobile');
      if (btnToggle) btnToggle.textContent = i18n.t('btn_mobile_mode');
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
    this.updateTierDisplay();

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

  private updateTierDisplay() {
    if (!this.policy) return;
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
    const localizedReason = getDeviceTierReason(this.policy.specs);
    if (tooltipReason) {
      tooltipReason.textContent = localizedReason;
    }
    if (modalTier) {
      modalTier.textContent = `${this.policy.tier} Tier`;
      modalTier.className = `tooltip-badge ${tierLower}`;
    }
    if (modalTierReason) {
      modalTierReason.textContent = localizedReason;
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
    // 1. Open Folder / Files Buttons
    const btnOpenFolder = document.getElementById('btn-open-folder');

    // Desktop Chromium with showDirectoryPicker support
    btnOpenFolder?.addEventListener('click', (e) => {
      if (this.canUseDirectoryPicker()) {
        e.preventDefault();
        e.stopPropagation();
        this.openWithDirectoryPicker();
      }
    });

    // Mount native transparent overlay inputs for direct touch/click
    this.mountFolderOverlayInput();
    this.mountFileOverlayInput();

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
          await this.loadFiles(files);
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
      this.updateFpsOptions(false);
      this.updateEstimatedSize();
    });
    document.getElementById('export-fps-select')?.addEventListener('change', () => this.updateEstimatedSize());
    const selectLanguage = document.getElementById('select-language') as HTMLSelectElement;
    if (selectLanguage) {
      selectLanguage.value = i18n.getLang();
      selectLanguage.addEventListener('change', (e) => {
        const targetLang = (e.target as HTMLSelectElement).value as SupportedLang;
        i18n.setLang(targetLang);
      });
    }

    // 5. Main Export Button
    document.getElementById('btn-export')?.addEventListener('click', () => {
      if (this.isExporting) {
        this.exporter.cancel();
      } else {
        this.startExport();
      }
    });

    // 6. Timeline Scrubber Click & Drag (Pointer Events for Touch & Mouse)
    const timelineRow = document.querySelector('.timeline-row') as HTMLElement | null;
    const track = document.getElementById('timeline-track');
    let isScrubbing = false;

    const handleScrub = (clientX: number) => {
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const posRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.seekTo(posRatio * this.durationSec);
    };

    const startScrub = (e: PointerEvent) => {
      if (this.isExporting) return;
      e.preventDefault();
      isScrubbing = true;
      try {
        track?.setPointerCapture(e.pointerId);
      } catch {}
      handleScrub(e.clientX);
    };

    const moveScrub = (e: PointerEvent) => {
      if (isScrubbing) {
        e.preventDefault();
        handleScrub(e.clientX);
      }
    };

    const stopScrub = (e: PointerEvent) => {
      if (isScrubbing) {
        isScrubbing = false;
        try {
          track?.releasePointerCapture(e.pointerId);
        } catch {}
      }
    };

    track?.addEventListener('pointerdown', startScrub);
    track?.addEventListener('pointermove', moveScrub);
    track?.addEventListener('pointerup', stopScrub);
    track?.addEventListener('pointercancel', stopScrub);

    timelineRow?.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.target !== track && !track?.contains(e.target as Node)) {
        startScrub(e);
      }
    });

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

    // 12. 앱 실행 시 기존 선택값 초기화 (PC, iOS, 안드로이드 공통)
    this.resetDefaultSelections();
  }

  private resetDefaultSelections() {
    // 1. 이전 세션 잔여 레이아웃 저장값 삭제
    try {
      localStorage.removeItem('ct_layout');
    } catch {}

    // 2. 레이아웃 버튼 및 렌더러 옵션 초기화 (기본 1:3)
    this.setLayoutMode('기본 (1:3 세로배치)');

    // 3. 단일 카메라 팝업 선택값 초기화 (기본 전방 카메라)
    document.querySelectorAll('.btn-cam-option').forEach((b) => {
      if (b.getAttribute('data-cam') === 'front') {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    this.options.single_cam = 'front';

    // 4. 오버레이 체크박스 초기화
    const chkKeys: (keyof RenderOptions)[] = [
      'timestamp', 'steering', 'speed', 'pedal',
      'fsd', 'pillar_pip', 'turn_signal', 'map'
    ];
    chkKeys.forEach((key) => {
      const elId = key === 'pillar_pip' ? 'chk-pillar-pip' : `chk-${key.replace('_', '-')}`;
      const chk = document.getElementById(elId) as HTMLInputElement | null;
      if (chk) {
        chk.checked = Boolean(DEFAULT_RENDER_OPTIONS[key]);
        (this.options as any)[key] = chk.checked;
      }
    });
    this.updatePillarPipState();

    // 5. 내보내기 설정 셀렉트박스 초기화
    const resSelect = document.getElementById('export-resolution') as HTMLSelectElement | null;
    if (resSelect) resSelect.value = 'FHD (1920x1080) - 권장 표준';
    const speedSelect = document.getElementById('export-speed-select') as HTMLSelectElement | null;
    if (speedSelect) {
      speedSelect.value = '1.0';
      this.options.exportSpeed = 1.0;
    }
    const fpsSelect = document.getElementById('export-fps-select') as HTMLSelectElement | null;
    if (fpsSelect) fpsSelect.value = '30';
    this.updateEstimatedSize();

    // 6. 재생 속도 슬라이더 및 태그 초기화 (1.0x)
    const speedSlider = document.getElementById('slider-preview-speed') as HTMLInputElement | null;
    if (speedSlider) speedSlider.value = '2';
    const speedValBadge = document.getElementById('lbl-preview-speed-val');
    if (speedValBadge) speedValBadge.textContent = '1.0x';
    this.options.playbackSpeed = 1.0;
    this.applyPlaybackSpeed();

    // 7. 밝기/대비 슬라이더 초기화
    const brSlider = document.getElementById('slider-brightness') as HTMLInputElement | null;
    const brSliderSub = document.getElementById('slider-brightness-sub') as HTMLInputElement | null;
    const brSubVal = document.getElementById('lbl-brightness-sub-val');
    if (brSlider) brSlider.value = '0';
    if (brSliderSub) brSliderSub.value = '0';
    if (brSubVal) brSubVal.textContent = '0';
    this.options.brightness = 0;

    const ctSlider = document.getElementById('slider-contrast') as HTMLInputElement | null;
    const ctSliderSub = document.getElementById('slider-contrast-sub') as HTMLInputElement | null;
    const ctSubVal = document.getElementById('lbl-contrast-sub-val');
    if (ctSlider) ctSlider.value = '100';
    if (ctSliderSub) ctSliderSub.value = '100';
    if (ctSubVal) ctSubVal.textContent = '100%';
    this.options.contrast = 1.0;

    // 8. 연속 재생 체크박스 초기화
    const chkAutoNext = document.getElementById('chk-auto-next') as HTMLInputElement | null;
    if (chkAutoNext) chkAutoNext.checked = false;
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

      if (this.isExporting && e.code !== 'Escape') {
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

  private cleanupPreviousResources() {
    // 1. 재생 즉시 중지 및 UI 동기화
    this.isPlaying = false;
    this.updatePlayButton();

    // 2. 비디오 엘리먼트 완전 정지 및 하드웨어 디코더 / 파일 디스크립터 반환
    if (this.videoPool) {
      Object.values(this.videoPool).forEach((v) => {
        if (v) {
          try {
            v.pause();
            v.removeAttribute('src');
            v.load(); // WebKit 내부의 미디어 디코더 인스턴스 강제 파괴
          } catch {}
        }
      });
      this.videoPool = {};
    }
    if (this.videoContainer) {
      this.videoContainer.innerHTML = '';
    }

    // 3. 생성되었던 모든 blob ObjectURL 해제 (메모리 누수 원천 차단)
    if (this.currentVideoUrls && this.currentVideoUrls.length > 0) {
      for (const url of this.currentVideoUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
      this.currentVideoUrls.length = 0;
    }

    // 4. 이전 클립의 File 참조 및 SEI 디코더 캐시 메모리 완전 해제
    this.activeClip = null;
    this.clipDecoders.clear();
    this.clipMap.clear();

    if (this.folderGroups && this.folderGroups.length > 0) {
      for (const group of this.folderGroups) {
        if (group.clips) {
          for (const clip of group.clips) {
            clip.cams = {};
            clip.camHandles = {};
          }
          group.clips.length = 0;
        }
      }
      this.folderGroups.length = 0;
    }

    // 5. 백그라운드 SEI Worker는 유지 (iOS Safari 안정성을 위해 Worker 재시작 없이 유지)

    // 6. 캔버스 프레임 버퍼 지우기
    if (this.canvas) {
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    // 7. 구간 선택 포인트 초기화
    this.startPoint = null;
    this.endPoint = null;
    this.updateRangeUI();

    // 8. 클립 트리 UI 초기화
    const tree = document.getElementById('clips-tree');
    if (tree) {
      tree.innerHTML = `<div class="empty-state">${i18n.t('empty_no_clips')}</div>`;
    }
  }

  private canUseDirectoryPicker(): boolean {
    if (typeof window === 'undefined') return false;
    const isIOSDevice = isIOS();
    const isAndroidDevice = /android/i.test(navigator.userAgent || '');
    if (isIOSDevice || isAndroidDevice) return false;
    return (
      'showDirectoryPicker' in window &&
      (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    );
  }

  private mountFolderOverlayInput(forceRecreate = false) {
    const container = document.getElementById('btn-open-folder');
    if (!container) return;

    // If input already exists, keep it unless force recreation is requested
    const existing = document.getElementById('active-folder-input');
    if (existing) {
      if (forceRecreate) {
        existing.remove();
      } else {
        return;
      }
    }

    // On desktop Chromium with showDirectoryPicker, do not mount overlay input
    if (this.canUseDirectoryPicker()) {
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'active-folder-input';
    input.className = 'native-overlay-input';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.setAttribute('multiple', '');
    input.setAttribute('accept', 'video/mp4,.mp4,.json');

    this.bindPickerLifecycle(input, 'folder');
    container.appendChild(input);
  }

  private mountFileOverlayInput(forceRecreate = false) {
    const container = document.getElementById('btn-open-files');
    if (!container) return;

    // If input already exists, keep it unless force recreation is requested
    const existing = document.getElementById('active-file-input');
    if (existing) {
      if (forceRecreate) {
        existing.remove();
      } else {
        return;
      }
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'active-file-input';
    input.className = 'native-overlay-input';
    input.setAttribute('multiple', '');
    input.setAttribute('accept', 'video/mp4,.mp4,.json');

    this.bindPickerLifecycle(input, 'files');
    container.appendChild(input);
  }

  private bindPickerLifecycle(input: HTMLInputElement, type: 'folder' | 'files') {
    // User selected files / folder
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);

      // Immediately recreate fresh input element for next pick without modifying value during click
      if (type === 'folder') {
        this.mountFolderOverlayInput(true);
      } else {
        this.mountFileOverlayInput(true);
      }

      if (files.length === 0) return;

      // 1) 즉시 진행도 배너 띄우기
      this.showLoadProgress(
        i18n.t('progress_grouping_clips'),
        `파일 목록 수신 완료 (${files.length}개), 분류 중...`,
        0,
        true
      );

      // 2) 1프레임 양보하여 시각적 피드백 보장
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

      // 3) 이전 세션 리소스 클린업
      this.cleanupPreviousResources();

      // 4) 파일 로드 및 그룹핑 파이프라인 시작
      try {
        await this.loadFiles(files);
      } catch (err) {
        console.error('[App] Failed to load files:', err);
        this.hideLoadProgress();
      }
    });

    input.addEventListener('cancel', () => {
      this.hideLoadProgress();
    });
  }

  private openWithDirectoryPicker() {
    (async () => {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        this.showLoadProgress(i18n.t('progress_searching_clips'), i18n.t('progress_searching_videos'), 0, true);
        const items = await scanFileSystemDirectory(dirHandle, (filesCount, dirsCount) => {
          this.showLoadProgress(i18n.t('progress_searching_clips'), i18n.t('progress_found_videos', [filesCount, dirsCount]), 0, true);
        });
        if (items && items.length > 0) {
          await this.loadFiles(items);
        } else {
          this.hideLoadProgress();
          this.showToast(i18n.t('empty_no_clips'));
        }
      } catch (e: any) {
        this.hideLoadProgress();
        if (e.name === 'AbortError') {
          return;
        }
        console.warn('showDirectoryPicker failed, falling back to input:', e);
        this.showToast(`폴더를 열 수 없습니다: ${e.message || e}`);
        this.mountFolderOverlayInput();
      }
    })();
  }

  async loadFiles(files: (File | ScannedFileItem)[] | FileList | ArrayLike<any>) {
    console.log('[App] loadFiles called with', files.length, 'files');
    if (!files || files.length === 0) return;

    this.cleanupPreviousResources();
    this.loadGeneration++;

    const totalCount = files.length;
    this.showLoadProgress(i18n.t('progress_grouping_clips'), i18n.t('progress_grouping_status', [0, totalCount, 0, 0]), 0, false);
    // 모바일(iOS 등)에서 0% 상태 진행도 배너가 화면에 페인트되도록 1프레임 양보
    await yieldToCompositor();

    this.folderGroups = await groupFilesIntoClips(files, (done, total, clipCount) => {
      const pct = Math.round((done / total) * 100);
      this.showLoadProgress(
        i18n.t('progress_grouping_clips'),
        i18n.t('progress_grouping_status', [done, total, pct, clipCount]),
        pct,
        false
      );
    });
    console.log('[App] Parsed folderGroups count:', this.folderGroups.length);

    // 3. Populate clipMap
    this.clipMap.clear();
    for (const group of this.folderGroups) {
      for (const clip of group.clips) {
        this.clipMap.set(clip.id, clip);
      }
    }

    // 4. Render tree with collapsible folders
    this.renderClipsTree();
    // 100% 완료 상태가 화면에 잠깐 그려진 후 배너를 숨김
    await yieldToCompositor();
    this.hideLoadProgress();

    if (this.folderGroups.length === 0) {
      this.showToast(i18n.t('empty_no_clips'));
      return;
    }

    // 5. On mobile portrait, expand bottom sheet so user sees clips
    if (this.isMobilePortrait()) {
      this.toggleExplorerSheet(true);
    }

    // 6. Select first clip if available on next animation frame
    if (this.folderGroups.length > 0 && this.folderGroups[0].clips.length > 0) {
      const firstGroup = this.folderGroups[0];
      const folderInfo = formatFolderGroup(firstGroup.folderName, firstGroup.clips);
      // 모바일(안드로이드/iOS)에서는 단일 폴더이거나 최근클립(recent)일 때 첫 클립 자동 선택
      const shouldAutoSelect = !this.isMobileDevice() || this.folderGroups.length === 1 || folderInfo.type === 'recent';
      if (shouldAutoSelect) {
        const firstClip = firstGroup.clips[0];
        requestAnimationFrame(() => {
          this.selectClip(firstClip);
        });
      }
    }
  }

  private isClipInRange(c: ClipItem): boolean {
    if (!this.activeClip) return false;
    const curClipBaseMs = parseClipTimeMs(this.activeClip.timestampRaw);
    const curClipEndMs = curClipBaseMs + this.durationSec * 1000;
    const sMs = this.startPoint ? this.startPoint.absTimeMs : (this.endPoint ? curClipBaseMs : null);
    const eMs = this.endPoint ? this.endPoint.absTimeMs : (this.startPoint ? curClipEndMs : null);
    if (sMs !== null && eMs !== null) {
      const cBase = parseClipTimeMs(c.timestampRaw);
      const cEnd = cBase + (c.durationSec || 60.0) * 1000;
      return cBase < eMs && cEnd > sMs;
    }
    return false;
  }

  private initClipsTreeEventDelegation() {
    const tree = document.getElementById('clips-tree');
    if (!tree) return;

    tree.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // 1. Folder Header Click -> Toggle collapse & lazy render
      const folderHeader = target.closest('.folder-header') as HTMLElement | null;
      if (folderHeader) {
        const folderNode = folderHeader.closest('.folder-node') as HTMLElement | null;
        if (!folderNode) return;
        const isCollapsed = folderNode.classList.toggle('collapsed');
        const arrow = folderNode.querySelector('.folder-arrow');
        if (arrow) arrow.textContent = isCollapsed ? '▶' : '▼';
        const clipsContainer = folderNode.querySelector('.folder-clips') as HTMLElement | null;
        if (clipsContainer && !isCollapsed) {
          const isRendered = clipsContainer.getAttribute('data-rendered') === 'true';
          if (!isRendered) {
            const groupIdx = parseInt(folderNode.getAttribute('data-group-idx') || '0', 10);
            this.renderFolderClips(groupIdx, clipsContainer);
          }
        }
        return;
      }

      // 2. Clip Node Click -> Select clip
      const clipNode = target.closest('.clip-node') as HTMLElement | null;
      if (clipNode) {
        const clipId = clipNode.getAttribute('data-clip-id');
        if (!clipId) return;
        const clip = this.clipMap.get(clipId);
        if (clip) {
          if (this.isMobilePortrait() && this.isExplorerExpanded) {
            this.toggleExplorerSheet(false);
          }
          this.selectClip(clip);
        }
        return;
      }
    });
  }

  private renderFolderClips(groupIndex: number, container: HTMLElement) {
    const group = this.folderGroups[groupIndex];
    if (!group || !group.clips) return;

    const htmlParts: string[] = [];
    for (const clip of group.clips) {
      const isActive = this.activeClip?.id === clip.id;
      const inRange = this.isClipInRange(clip);
      const camCount = Math.max(Object.keys(clip.cams).length, clip.camHandles ? Object.keys(clip.camHandles).length : 0);
      const tagText = `[${camCount}${i18n.t('tag_channels')}]`;

      let classes = 'clip-node';
      if (isActive) classes += ' active';
      if (inRange) classes += ' in-range';

      htmlParts.push(
        `<div class="${classes}" id="clip-item-${clip.safeId}" data-clip-id="${clip.id}">` +
          `<span>🎬 ${clip.timestampStr}</span>` +
          `<span class="clip-type-tag">${tagText}</span>` +
        `</div>`
      );
    }

    container.innerHTML = htmlParts.join('');
    container.setAttribute('data-rendered', 'true');
  }

  private renderClipsTree() {
    const container = document.getElementById('clips-tree');
    if (!container) return;
    container.innerHTML = '';

    if (this.folderGroups.length === 0) {
      container.innerHTML = `<div class="empty-state">${i18n.t('empty_no_clips')}</div>`;
      return;
    }

    const isMobile = this.isMobileDevice();
    const activeFolder = this.activeClip?.folder;
    const isSingleFolder = this.folderGroups.length === 1;
    const docFrag = document.createDocumentFragment();

    this.folderGroups.forEach((group, idx) => {
      const folderDiv = document.createElement('div');
      const folderInfo = formatFolderGroup(group.folderName, group.clips);

      // 모바일(안드로이드/iOS)에서는 단일 폴더이거나 최근클립(recent)일 때 최초 펼침.
      // 복수 폴더일 때 저장/센트리 클립은 메모리 절약을 위해 기본 접힘 상태 (터치 시 동적 렌더링).
      // 데스크톱(PC)에서는 첫 폴더 또는 활성 폴더 기본 열림.
      let isFolderOpen = false;
      if (isMobile) {
        if (isSingleFolder) {
          isFolderOpen = true;
        } else if (folderInfo.type === 'recent') {
          isFolderOpen = activeFolder ? group.folderName === activeFolder : idx === 0;
        } else {
          isFolderOpen = false;
        }
      } else {
        isFolderOpen = isSingleFolder || (activeFolder ? group.folderName === activeFolder || group.clips.some((c) => c.folder === activeFolder) : idx === 0);
      }

      folderDiv.className = `folder-node ${isFolderOpen ? '' : 'collapsed'}`;
      folderDiv.setAttribute('data-group-idx', String(idx));

      const folderHeader = document.createElement('div');
      folderHeader.className = `folder-header folder-type-${folderInfo.type}`;
      folderHeader.setAttribute('data-group-idx', String(idx));
      const titleText = folderInfo.displayTitle.includes('(')
        ? folderInfo.displayTitle
        : `${folderInfo.displayTitle} (${group.clips.length})`;
      folderHeader.innerHTML = `<span class="folder-arrow">${isFolderOpen ? '▼' : '▶'}</span> <span class="folder-icon">📁</span> <span class="folder-name">${titleText}</span>`;

      const clipsContainer = document.createElement('div');
      clipsContainer.className = 'folder-clips';
      clipsContainer.setAttribute('data-group-idx', String(idx));

      folderDiv.appendChild(folderHeader);
      folderDiv.appendChild(clipsContainer);
      docFrag.appendChild(folderDiv);

      if (isFolderOpen) {
        this.renderFolderClips(idx, clipsContainer);
      }
    });

    container.appendChild(docFrag);
  }

  async selectClip(clip: ClipItem) {
    this.isSelectingClip = true;
    const clipGen = ++this.currentClipGeneration;
    try {
      this.activeClip = clip;
      // Resolve files for this clip lazily
      await ensureClipFiles(clip);

      const hasPillars = Boolean(
        clip.cams.left_pillar ||
        clip.cams.right_pillar ||
        clip.camHandles?.left_pillar ||
        clip.camHandles?.right_pillar
      );
      this.fps = hasPillars ? 24.0 : 36.0;
      this.isPlaying = false;
      this.currentTimeSec = 0;

      this.updateFpsOptions();
      this.updateRangeUI();
      this.updateEstimatedSize();
      this.updatePillarPipState();

      // Update active row in explorer table
      document.querySelectorAll('.clip-node.active').forEach((el) => el.classList.remove('active'));
      const activeEl = document.getElementById(`clip-item-${clip.safeId}`);
      if (activeEl) activeEl.classList.add('active');

      // Setup Video Elements - cleanly detach old videos
      Object.values(this.videoPool).forEach((v) => {
        if (v) {
          try {
            v.pause();
            v.removeAttribute('src');
            v.load();
          } catch {}
        }
      });
      this.videoContainer.innerHTML = '';

      // Revoke previous URLs to prevent memory bloat
      if (this.currentVideoUrls && this.currentVideoUrls.length > 0) {
        this.currentVideoUrls.forEach((url) => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        });
      }
      this.currentVideoUrls = [];
      this.videoPool = {};

      const isIOSDevice = isIOS();
      const camKeys = Object.keys(clip.cams) as CameraKey[];
      for (const key of camKeys) {
        const file = clip.cams[key];
        if (!file) continue;

        const video = document.createElement('video');
        const url = URL.createObjectURL(file);
        this.currentVideoUrls.push(url);
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');

        // Master camera preloads 'auto', other cameras preload 'metadata' on iOS
        // On PC/Android (!isIOSDevice), all cameras preload 'auto' for Chromium lazy decoding wake-up
        const hasFront = Boolean(clip.cams.front);
        const isMaster = hasFront ? key === 'front' : key === camKeys[0];
        video.preload = isIOSDevice ? (isMaster ? 'auto' : 'metadata') : 'auto';

        video.addEventListener('error', (e) => {
          console.warn(`[Video Error] Camera ${key} failed to load:`, video.error, e);
        });

        // Repaint canvas immediately when any camera's first frame or seeked frame is ready while paused
        const onFrameReady = () => {
          if (!this.isPlaying && this.activeClip?.id === clip.id) {
            this.renderFrame();
          }
        };
        video.addEventListener('loadeddata', onFrameReady);
        video.addEventListener('canplay', onFrameReady);
        video.addEventListener('seeked', onFrameReady);

        if (!isIOSDevice) {
          // PC/Android: Micro-seek on metadata load so Chromium's video decoder wakes up and produces GPU texture
          const handleInitialSeek = () => {
            if (!this.isPlaying && video.currentTime < 0.002) {
              try {
                const master = this.videoPool.front || Object.values(this.videoPool)[0];
                const seekTarget = (master && master.currentTime > 0) ? master.currentTime : 0.001;
                video.currentTime = seekTarget;
              } catch {}
            }
          };
          if (video.readyState >= 1) {
            handleInitialSeek();
          } else {
            video.addEventListener('loadedmetadata', handleInitialSeek, { once: true });
          }
        }

        this.videoContainer.appendChild(video);
        this.videoPool[key] = video;
        try {
          video.load();
        } catch {}
      }

      // Non-blocking duration setup from master video (updates timeline & UI as soon as metadata arrives)
      const masterVideo = this.videoPool.front || Object.values(this.videoPool)[0];
      if (masterVideo) {
        const onMetadataLoaded = () => {
          if (clipGen !== this.currentClipGeneration) return;
          if (masterVideo.duration && !isNaN(masterVideo.duration) && masterVideo.duration > 0) {
            this.durationSec = masterVideo.duration;
            this.updateTimelineUI();
            this.updateRangeUI();
            if (!this.isPlaying && this.activeClip?.id === clip.id) {
              this.renderFrame();
            }
          }
        };

        if (masterVideo.readyState >= 1) {
          onMetadataLoaded();
        } else {
          masterVideo.addEventListener('loadedmetadata', onMetadataLoaded, { once: true });
        }

        masterVideo.addEventListener('ended', () => {
          this.handleMasterEnded();
        });
        masterVideo.addEventListener('pause', () => {
          if (!this.isPlaying) return;
          this.pauseAllVideos(false);
        });
      }

      this.currentTimeSec = 0;
      this.updateTimelineUI();
      this.updatePlayButton();
      // Render canvas immediately (zero-latency visual feedback for slot placeholders & HUD)
      this.renderFrame();

      // Start non-blocking background telemetry extraction
      this.startBackgroundTelemetry(clip, clipGen);
    } finally {
      this.isSelectingClip = false;
    }
  }

  private startBackgroundTelemetry(clip: ClipItem, clipGen: number) {
    if (this.clipDecoders.has(clip.id)) {
      this.hideSeiProgress();
      return;
    }

    const frontFile = clip.cams.front;
    if (!frontFile) {
      this.hideSeiProgress();
      return;
    }

    this.showSeiProgress(0);

    if (this.seiWorker) {
      this.seiWorker.postMessage({
        type: 'parse',
        clipId: clip.id,
        generation: clipGen,
        file: frontFile,
      });
    } else {
      (async () => {
        try {
          const decoder = new RealTeslaSEIDecoder();
          const handle = new BlobFileHandle(frontFile);
          await decoder.parseMp4Sei(handle, (pct, parsedFrames, totalFrames) => {
            if (this.currentClipGeneration === clipGen) {
              this.showSeiProgress(pct, parsedFrames, totalFrames);
            }
          });
          if (this.currentClipGeneration === clipGen) {
            this.clipDecoders.set(clip.id, decoder);
            this.hideSeiProgress();
            if (!this.isPlaying) {
              this.renderFrame();
            }
          }
        } catch (err) {
          console.warn('[App] Failed to parse SEI metadata for clip', clip.id, err);
          if (this.currentClipGeneration === clipGen) {
            this.hideSeiProgress();
          }
        }
      })();
    }
  }

  private pauseAllVideos(alignTimes = true) {
    this.isPlaying = false;
    const masterVideo = this.videoPool.front || Object.values(this.videoPool)[0];
    const targetTime = masterVideo ? masterVideo.currentTime : this.currentTimeSec;
    const baseSpeed = this.options.playbackSpeed || 1.0;

    // 1. 모든 비디오 즉시 동기 pause 및 playbackRate 원복
    Object.values(this.videoPool).forEach((v) => {
      if (v) {
        try {
          if (!v.paused) v.pause();
        } catch {}
        try {
          v.playbackRate = baseSpeed;
        } catch {}
      }
    });

    // 2. 정지 시점에 보조 카메라들의 시간을 마스터 비디오 시간에 정확히 정렬 (멈춘 상태에서 어긋나거나 뒤늦게 툭 튀는 현상 방지)
    if (alignTimes && masterVideo) {
      this.currentTimeSec = targetTime;
      Object.values(this.videoPool).forEach((v) => {
        if (v && v !== masterVideo) {
          try {
            // 보조 카메라가 이미 ended 상태인 경우 마지막 프레임을 유지하고, 그렇지 않으면 마스터 시간에 정렬
            if (!v.ended && Math.abs(v.currentTime - targetTime) > 0.02) {
              v.currentTime = Math.min(v.duration || targetTime, targetTime);
            }
          } catch {}
        }
      });
      this.updateTimelineUI();
    }

    this.updatePlayButton();
  }

  private handleMasterEnded() {
    // 1. 마스터 비디오 종료 즉시 모든 보조 카메라 동기 pause 및 배속 초기화
    this.pauseAllVideos(true);

    // 2. 자동 다음 클립(chk-auto-next) 체크 여부에 따른 분기
    const chkAutoNext = document.getElementById('chk-auto-next') as HTMLInputElement | null;
    if (chkAutoNext && chkAutoNext.checked) {
      this.nextClip(true);
    }
  }

  private togglePlay() {
    if (this.isExporting) return;
    this.isPlaying = !this.isPlaying;
    const masterVideo = this.videoPool.front || Object.values(this.videoPool)[0];

    if (this.isPlaying) {
      if (masterVideo && (masterVideo.ended || (this.durationSec > 0 && masterVideo.currentTime >= this.durationSec - 0.04))) {
        this.seekTo(0);
      }
      this.applyPlaybackSpeed();
      // Upgrade any metadata preload to auto for smooth multi-cam playback
      Object.values(this.videoPool).forEach((v) => {
        if (v) {
          if (v.preload !== 'auto') v.preload = 'auto';
          v.play().catch(() => {});
        }
      });
    } else {
      this.pauseAllVideos(true);
    }
    this.updatePlayButton();
  }

  private seekTo(targetSec: number) {
    if (this.isExporting) return;
    this.currentTimeSec = Math.max(0, Math.min(this.durationSec, targetSec));
    const isIOSDevice = isIOS();
    const baseSpeed = this.options.playbackSpeed || 1.0;
    const seekTime = (!isIOSDevice && this.currentTimeSec === 0) ? 0.001 : this.currentTimeSec;
    Object.values(this.videoPool).forEach((v) => {
      if (v) {
        try {
          if (v.readyState >= 1) {
            v.currentTime = Math.min(v.duration || seekTime, seekTime);
          }
          v.playbackRate = baseSpeed;
        } catch {}
      }
    });
    this.updateTimelineUI();
  }

  private seekRelative(deltaSec: number) {
    if (this.isExporting) return;
    this.seekTo(this.currentTimeSec + deltaSec);
  }

  private prevClip() {
    if (this.isExporting || !this.activeClip) return;
    const allClips = this.folderGroups.flatMap((g) => g.clips);
    const idx = allClips.findIndex((c) => c.id === this.activeClip!.id);
    if (idx > 0) {
      this.selectClip(allClips[idx - 1]);
    }
  }

  private nextClip(auto = false) {
    if (this.isExporting || !this.activeClip) return;
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
    const baseSpeed = this.options.playbackSpeed || 1.0;
    Object.values(this.videoPool).forEach((v) => {
      if (v) v.playbackRate = baseSpeed;
    });
  }

  private startRenderLoop() {
    const loop = () => {
      if (this.isExporting) {
        // Enforce pause during video export across all platforms
        const videos = Object.values(this.videoPool);
        for (let i = 0; i < videos.length; i++) {
          const v = videos[i];
          if (v && !v.paused) {
            try { v.pause(); } catch {}
          }
        }
        requestAnimationFrame(loop);
        return;
      }

      const masterVideo = this.videoPool.front || Object.values(this.videoPool)[0];

      // [Requirement 1] 마스터 비디오가 없거나 정지/종료 상태인 경우: 어떤 보조 비디오도 혼자 재생되지 못하도록 즉시 동기 pause()
      if (!this.isPlaying || !masterVideo || masterVideo.paused || masterVideo.ended) {
        if (this.isPlaying) {
          this.handleMasterEnded();
        } else if (!this.isSelectingClip) {
          const baseSpeed = this.options.playbackSpeed || 1.0;
          const videos = Object.values(this.videoPool);
          for (let i = 0; i < videos.length; i++) {
            const v = videos[i];
            if (v && !v.paused && !v.seeking) {
              try { v.pause(); } catch {}
              try { v.playbackRate = baseSpeed; } catch {}
            }
          }
        }
      } else {
        // [Requirement 1 & 2] 마스터 비디오 정상 재생 중
        this.currentTimeSec = masterVideo.currentTime;

        // 마스터 비디오가 끝에 도달했는지 확인 (ended 또는 duration 끝 도달)
        const isMasterFinished = masterVideo.ended ||
          (this.durationSec > 0 && masterVideo.currentTime >= this.durationSec - 0.04);

        if (isMasterFinished) {
          this.handleMasterEnded();
        } else {
          // Sync other cameras to master video time
          const masterTime = masterVideo.currentTime;
          const targetSpeed = this.options.playbackSpeed || 1.0;
          const keys = Object.keys(this.videoPool) as CameraKey[];

          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const v = this.videoPool[k];
            if (!v || v === masterVideo) continue;

            // [Requirement 2] 만약 보조 비디오가 마스터보다 먼저 끝(v.ended)에 도달한 경우 마지막 프레임 유지
            if (v.ended) {
              continue;
            }

            // [Requirement 2] 보조 카메라가 마스터 비디오보다 앞서 가지 못하도록 제한
            const diff = v.currentTime - masterTime;

            if (Math.abs(diff) > 0.08) {
              try {
                v.currentTime = Math.min(v.duration || masterTime, masterTime);
              } catch {}
              v.playbackRate = targetSpeed;
            } else if (Math.abs(diff) > 0.03) {
              if (diff > 0) {
                // 보조 비디오가 앞서 있음 -> 감속
                v.playbackRate = Math.max(0.5, targetSpeed * 0.9);
              } else {
                // 보조 비디오가 뒤쳐짐 -> 가속
                v.playbackRate = Math.min(2.0, targetSpeed * 1.1);
              }
            } else {
              if (v.playbackRate !== targetSpeed) {
                v.playbackRate = targetSpeed;
              }
            }
          }
          this.updateTimelineUI();
        }
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
        btnPlay.textContent = isMobile ? i18n.t('btn_pause') : i18n.t('pause_with_space');
        btnPlay.classList.add('playing');
      } else {
        btnPlay.textContent = isMobile ? i18n.t('btn_play') : i18n.t('play_with_space');
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
        alert(i18n.t('alert_in_after_out'));
        return;
      }
      const durSec = (this.endPoint.absTimeMs - currAbsMs) / 1000.0;
      if (durSec > 1800.0) {
        alert(i18n.t('alert_max_duration', [(durSec / 60.0).toFixed(1)]));
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
        alert(i18n.t('alert_out_before_in'));
        return;
      }
      const durSec = (currAbsMs - this.startPoint.absTimeMs) / 1000.0;
      if (durSec > 1800.0) {
        alert(i18n.t('alert_max_duration', [(durSec / 60.0).toFixed(1)]));
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
      if (rangeText) rangeText.textContent = i18n.t('range_unspecified');
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
      const multiInfo = chain.length > 1 ? i18n.t('range_multi_files', [chain.length]) : '';
      if (rangeText) {
        rangeText.textContent = i18n.t('range_specified', [t1, t2, dur, multiInfo]);
      }
    } else if (this.startPoint) {
      const t1 = formatHms(new Date(this.startPoint.absTimeMs));
      if (rangeText) rangeText.textContent = i18n.t('range_need_out', [t1]);
    } else if (this.endPoint) {
      const t2 = formatHms(new Date(this.endPoint.absTimeMs));
      if (rangeText) rangeText.textContent = i18n.t('range_need_in', [t2]);
    } else {
      if (rangeText) {
        rangeText.textContent = i18n.t('range_unspecified_full', [this.durationSec.toFixed(1)]);
      }
    }

    // Update tree item highlights
    const allClips = this.folderGroups.flatMap((g) => g.clips);
    const sMs = this.startPoint ? this.startPoint.absTimeMs : (this.endPoint ? curClipBaseMs : null);
    const eMs = this.endPoint ? this.endPoint.absTimeMs : (this.startPoint ? curClipEndMs : null);

    allClips.forEach((c) => {
      const elId = `clip-item-${c.safeId}`;
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

  private updateFpsOptions(preserveValue: boolean = true) {
    const fpsSelect = document.getElementById('export-fps-select') as HTMLSelectElement;
    const speedSelect = document.getElementById('export-speed-select') as HTMLSelectElement;
    if (!fpsSelect) return;

    const hasPillars = Boolean(
      this.activeClip?.cams.left_pillar || this.activeClip?.cams.right_pillar
    );
    const baseFps = hasPillars ? 24.0 : 36.0;
    const exportSpeed = parseFloat(speedSelect?.value || '1.0');
    const maxFps = Math.min(120, Math.round(baseFps * exportSpeed));

    const currentVal = parseInt(fpsSelect.value) || 0;
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 850px), (pointer: coarse)').matches;

    // Standard output FPS candidates:
    // - On PC: default to maxFps (e.g. 72 FPS for 2x, 120 FPS for 4x, 36 FPS for 1x) for full original smoothness!
    // - On mobile: default to standard 30 FPS to avoid mobile decoder strain / iOS Slo-Mo
    const defaultFps = isMobile
      ? ((exportSpeed === 1.0 && Math.round(baseFps) <= 36) ? Math.round(baseFps) : 30)
      : maxFps;

    const candidates: Array<{ label: string; val: number }> = isMobile
      ? [
          { label: i18n.t('fps_30_rec'), val: 30 },
          { label: i18n.t('fps_orig_default', [Math.round(baseFps)]), val: Math.round(baseFps) },
          { label: i18n.t('fps_60'), val: 60 },
          { label: i18n.t('fps_24'), val: 24 },
          { label: i18n.t('fps_15'), val: 15 },
        ]
      : [
          { label: exportSpeed > 1.0 ? i18n.t('fps_orig_speed', [maxFps]) : i18n.t('fps_orig_optimal', [maxFps]), val: maxFps },
          { label: i18n.t('fps_60'), val: 60 },
          { label: i18n.t('fps_orig_default', [Math.round(baseFps)]), val: Math.round(baseFps) },
          { label: i18n.t('fps_30'), val: 30 },
          { label: i18n.t('fps_24'), val: 24 },
          { label: i18n.t('fps_saving'), val: 15 },
        ];

    fpsSelect.innerHTML = '';
    const added = new Set<number>();

    for (const c of candidates) {
      if (c.val <= maxFps && !added.has(c.val)) {
        const opt = document.createElement('option');
        opt.value = String(c.val);
        opt.textContent = c.label;
        fpsSelect.appendChild(opt);
        added.add(c.val);
      }
    }

    if (added.size === 0) {
      const opt = document.createElement('option');
      opt.value = String(defaultFps);
      opt.textContent = `${defaultFps} FPS`;
      fpsSelect.appendChild(opt);
      added.add(defaultFps);
    }

    if (preserveValue && currentVal > 0 && added.has(currentVal)) {
      fpsSelect.value = String(currentVal);
    } else if (added.has(defaultFps)) {
      fpsSelect.value = String(defaultFps);
    } else {
      fpsSelect.selectedIndex = 0;
    }
  }

  private updateEstimatedSize() {
    const resSelect = document.getElementById('export-resolution') as HTMLSelectElement;
    const speedSelect = document.getElementById('export-speed-select') as HTMLSelectElement;
    const fpsSelect = document.getElementById('export-fps-select') as HTMLSelectElement;
    const estLabel = document.getElementById('lbl-est-size');
    if (!resSelect || !estLabel) return;

    const resConfig = RESOLUTIONS[resSelect.value] || RESOLUTIONS['FHD (1920x1080) - 권장 표준'];
    const exportSpeed = parseFloat(speedSelect?.value || '1.0');
    const targetFps = fpsSelect ? parseFloat(fpsSelect.value) || 30.0 : 30.0;
    const fpsRatio = Math.pow(targetFps / 30.0, 0.45);

    let durationSec = this.durationSec;
    if (this.startPoint && this.endPoint) {
      durationSec = Math.max(0.1, (this.endPoint.absTimeMs - this.startPoint.absTimeMs) / 1000.0);
    } else {
      const chain = this.buildTargetClipChain();
      durationSec = chain.reduce((sum, seg) => sum + (seg.endSec - seg.startSec), 0);
    }

    // Bitrate calculation matching Python original with FPS ratio scaling
    const estMb = (resConfig.bitrate_mbps * 1_000_000 / 8 * durationSec * fpsRatio) / (exportSpeed * 1024 * 1024);
    estLabel.textContent = `${i18n.t('est_size_prefix')}${estMb.toFixed(1)} MB`;
  }

  private async startExport() {
    if (!this.activeClip) return;

    if (typeof VideoEncoder === 'undefined') {
      alert(i18n.t('alert_http_security'));
      return;
    }

    const resSelect = document.getElementById('export-resolution') as HTMLSelectElement;
    const speedSelect = document.getElementById('export-speed-select') as HTMLSelectElement;
    const fpsSelect = document.getElementById('export-fps-select') as HTMLSelectElement;
    const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
    const pbarContainer = document.getElementById('export-pbar-container');
    const pbarFill = document.getElementById('export-pbar-fill');
    const statusLabel = document.getElementById('export-status-label');

    // Export progress modal elements
    const exportModal = document.getElementById('export-progress-modal');
    const exportModalPct = document.getElementById('export-modal-pct');
    const exportModalFpsInfo = document.getElementById('export-modal-fps-info');
    const exportModalGaugeFill = document.getElementById('export-modal-gauge-fill');
    const exportModalFileSeg = document.getElementById('export-modal-file-seg');
    const btnCancelExportModal = document.getElementById('btn-cancel-export-modal') as HTMLButtonElement | null;

    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 850px), (pointer: coarse)').matches;
    const exportSpeed = parseFloat(speedSelect?.value || '1.0');
    const targetFps = fpsSelect ? parseInt(fpsSelect.value) || (isMobile ? 30 : Math.round(this.fps * exportSpeed)) : (isMobile ? 30 : 36);
    this.options.exportSpeed = exportSpeed;
    const segments = this.buildTargetClipChain();
    if (segments.length === 0) {
      alert(i18n.t('alert_no_range'));
      return;
    }

    // Unconditionally stop playback and update play button for all platforms
    this.pauseAllVideos(true);
    this.isPlaying = false;
    this.updatePlayButton();

    this.isExporting = true;
    const btnPlay = document.getElementById('btn-play') as HTMLButtonElement | null;
    if (btnPlay) {
      btnPlay.setAttribute('disabled', 'true');
      btnPlay.style.pointerEvents = 'none';
      btnPlay.style.opacity = '0.5';
    }
    if (btnExport) {
      btnExport.textContent = i18n.t('btn_export_cancel');
      btnExport.classList.add('cancelling');
    }
    if (pbarContainer) pbarContainer.style.display = 'block';
    if (statusLabel) {
      statusLabel.style.display = 'block';
      statusLabel.textContent = i18n.t('status_preparing', [segments.length]);
    }
    if (pbarFill) pbarFill.style.width = '0%';

    // Open fullscreen modal to protect against background touches & app sleep
    if (exportModal) exportModal.style.display = 'flex';
    if (exportModalPct) exportModalPct.textContent = '0%';
    if (exportModalGaugeFill) exportModalGaugeFill.style.width = '0%';
    if (exportModalFileSeg) exportModalFileSeg.textContent = i18n.t('export_modal_file_tag', [1, segments.length]);
    if (exportModalFpsInfo) exportModalFpsInfo.textContent = i18n.t('export_modal_fps_prep', [targetFps, exportSpeed]);
    if (btnCancelExportModal) {
      btnCancelExportModal.disabled = false;
      btnCancelExportModal.textContent = i18n.t('btn_export_cancel');
    }

    // Modal cancel button click handler
    const onModalCancel = () => {
      if (this.isExporting) {
        this.exporter.cancel();
        if (btnCancelExportModal) {
          btnCancelExportModal.disabled = true;
          btnCancelExportModal.textContent = i18n.t('status_cancelling');
        }
        if (exportModalFpsInfo) {
          exportModalFpsInfo.textContent = i18n.t('export_modal_cancelling');
        }
      }
    };
    btnCancelExportModal?.addEventListener('click', onModalCancel);

    // Prevent accidental page unload during encoding
    const preventUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);

    // Screen Wake Lock to prevent mobile display sleep
    let wakeLockSentinel: any = null;
    if ('wakeLock' in navigator && (navigator as any).wakeLock) {
      try {
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      } catch (e) {
        console.warn('[Export] Screen wake lock not granted:', e);
      }
    }

    try {
      const blob = await this.exporter.exportMultiClip({
        segments,
        getClipDecoder: async (clip: ClipItem) => {
          if (!this.clipDecoders.has(clip.id)) {
            const frontFile = await getClipFile(clip, 'front');
            if (frontFile) {
              const decoder = new RealTeslaSEIDecoder();
              const handle = new BlobFileHandle(frontFile);
              await decoder.parseMp4Sei(handle);
              this.clipDecoders.set(clip.id, decoder);
            }
          }
          return this.clipDecoders.get(clip.id) || null;
        },
        sourceFps: this.fps,
        targetFps,
        exportSpeed,
        resolutionName: resSelect.value as any,
        options: this.options,
        onProgress: (pct, curSeg, totalSeg) => {
          if (statusLabel) {
            statusLabel.textContent = i18n.t('status_encoding', [pct, curSeg, totalSeg]);
          }
          if (pbarFill) pbarFill.style.width = `${pct}%`;
          if (exportModalPct) exportModalPct.textContent = `${pct}%`;
          if (exportModalGaugeFill) exportModalGaugeFill.style.width = `${pct}%`;
          if (exportModalFileSeg) exportModalFileSeg.textContent = i18n.t('export_modal_file_tag', [curSeg, totalSeg]);
          if (exportModalFpsInfo) exportModalFpsInfo.textContent = i18n.t('export_modal_fps_info', [pct, targetFps, exportSpeed]);
        },
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const fileName = segments.length > 1
        ? `TeslaCam_${segments[0].clip.timestampRaw}_to_${segments[segments.length - 1].clip.timestampRaw}_export.mp4`
        : `TeslaCam_${segments[0].clip.timestampRaw}_export.mp4`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          a.remove();
          URL.revokeObjectURL(url);
        } catch {}
      }, 60000);

      if (exportModalPct) exportModalPct.textContent = '100%';
      if (exportModalGaugeFill) exportModalGaugeFill.style.width = '100%';
      if (exportModalFpsInfo) exportModalFpsInfo.textContent = i18n.t('export_success_save_desc');
      if (statusLabel) statusLabel.textContent = i18n.t('status_success');

      // 갤럭시는 브라우저 다운로드 완료 알림이 없으므로 안드로이드 환경에서만 안내 팝업 노출
      const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        setTimeout(() => {
          alert(i18n.t('export_success_alert'));
        }, 300);
      }
    } catch (e: any) {
      console.error('[Export Error]', e);
      const errorMsg = e?.message || String(e);
      const stackSnippet = e?.stack ? `\n\n[Stack]\n${String(e.stack).slice(0, 300)}` : '';
      if (statusLabel) statusLabel.textContent = `${i18n.t('status_error')}${errorMsg}`;
      alert(`${i18n.t('status_error')}${errorMsg}${stackSnippet}`);
    } finally {
      this.isExporting = false;
      const btnPlay = document.getElementById('btn-play') as HTMLButtonElement | null;
      if (btnPlay) {
        btnPlay.removeAttribute('disabled');
        btnPlay.style.pointerEvents = '';
        btnPlay.style.opacity = '';
      }
      this.updatePlayButton();
      window.removeEventListener('beforeunload', preventUnload);
      btnCancelExportModal?.removeEventListener('click', onModalCancel);

      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
      }
      if (exportModal) {
        exportModal.style.display = 'none';
      }

      if (btnExport) {
        btnExport.textContent = i18n.t('btn_export');
        btnExport.classList.remove('cancelling');
      }
      setTimeout(() => {
        if (!this.isExporting && statusLabel && (statusLabel.textContent === i18n.t('status_success') || statusLabel.textContent?.includes('완료') || statusLabel.textContent?.includes('success') || statusLabel.textContent?.includes('完了') || statusLabel.textContent?.includes('完成'))) {
          if (pbarContainer) pbarContainer.style.display = 'none';
          if (statusLabel) statusLabel.style.display = 'none';
        }
      }, 4000);
    }
  }

  // PWA / Add to Home Screen & Desktop Shortcut handler
  private initPWAInstall() {
    let deferredPrompt: any = null;
    const btnAddToHome = document.getElementById('btn-add-to-home');
    const btnPcInstall = document.getElementById('btn-pc-install');
    const modalInstallGuide = document.getElementById('modal-install-guide');
    const btnCloseInstallModal = document.getElementById('btn-close-install-modal');
    const btnConfirmInstall = document.getElementById('btn-confirm-install');
    const btnTriggerPwaInstall = document.getElementById('btn-trigger-pwa-install');
    const btnCopyPageUrl = document.getElementById('btn-copy-page-url');
    const copyStatusMsg = document.getElementById('copy-status-msg');

    // Register service worker if supported
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('[PWA] ServiceWorker registration failed:', err);
      });
    }

    // Helper to completely hide the PC install button once the app is installed
    const hidePcInstallBtn = () => {
      if (btnPcInstall) {
        btnPcInstall.style.display = 'none';
        btnPcInstall.classList.add('installed');
      }
      try {
        localStorage.setItem('pwa_installed', 'true');
      } catch {}
    };

    // If already installed or running as standalone web app, permanently hide the button
    const isAlreadyInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true ||
      localStorage.getItem('pwa_installed') === 'true';

    if (isAlreadyInstalled) {
      hidePcInstallBtn();
    }

    // Capture beforeinstallprompt for Android / Chrome / Edge / Samsung Internet
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      globalDeferredPrompt = e;
      if (btnTriggerPwaInstall) {
        btnTriggerPwaInstall.style.display = 'block';
      }
    });

    // When the app is successfully installed, hide the PC install button immediately
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      globalDeferredPrompt = null;
      hidePcInstallBtn();
    });

    const openInstallModal = () => {
      if (modalInstallGuide) modalInstallGuide.style.display = 'flex';
      // Detect platform
      const ua = navigator.userAgent.toLowerCase();
      const isIOSDevice = isIOS();
      const isAndroid = /android/i.test(navigator.userAgent || '');
      const guideAndroid = document.getElementById('guide-android');
      const guideIOS = document.getElementById('guide-ios');
      const guideDesktop = document.getElementById('guide-desktop');

      if (isIOSDevice) {
        if (guideIOS) guideIOS.style.display = 'block';
        if (guideAndroid) guideAndroid.style.display = 'none';
        if (guideDesktop) guideDesktop.style.display = 'none';
      } else if (isAndroid) {
        if (guideAndroid) guideAndroid.style.display = 'block';
        if (guideIOS) guideIOS.style.display = 'none';
        if (guideDesktop) guideDesktop.style.display = 'none';
        if ((deferredPrompt || globalDeferredPrompt) && btnTriggerPwaInstall) {
          btnTriggerPwaInstall.style.display = 'block';
        }
      } else {
        // Desktop PC (Windows / Edge / Chrome)
        if (guideDesktop) guideDesktop.style.display = 'block';
        if (guideAndroid) guideAndroid.style.display = 'none';
        if (guideIOS) guideIOS.style.display = 'none';
        if ((deferredPrompt || globalDeferredPrompt) && btnTriggerPwaInstall) {
          btnTriggerPwaInstall.style.display = 'block';
        }
      }
    };

    if (btnAddToHome) {
      btnAddToHome.addEventListener('click', () => {
        openInstallModal();
      });
    }

    // PC Desktop "앱 설치" button click handler
    if (btnPcInstall) {
      btnPcInstall.addEventListener('click', async () => {
        const promptToUse = deferredPrompt || globalDeferredPrompt;
        if (promptToUse) {
          try {
            await promptToUse.prompt();
            const choiceResult = await promptToUse.userChoice;
            if (choiceResult && choiceResult.outcome === 'accepted') {
              hidePcInstallBtn();
            }
          } catch (err) {
            console.warn('[PWA] Prompt error:', err);
            openInstallModal();
          }
          deferredPrompt = null;
          globalDeferredPrompt = null;
        } else {
          openInstallModal();
        }
      });
    }

    if (btnTriggerPwaInstall) {
      btnTriggerPwaInstall.addEventListener('click', async () => {
        const promptToUse = deferredPrompt || globalDeferredPrompt;
        if (promptToUse) {
          try {
            await promptToUse.prompt();
            const choiceResult = await promptToUse.userChoice;
            if (choiceResult && choiceResult.outcome === 'accepted') {
              if (modalInstallGuide) modalInstallGuide.style.display = 'none';
              hidePcInstallBtn();
            }
          } catch (err) {
            console.warn('[PWA] Prompt error:', err);
          }
          deferredPrompt = null;
          globalDeferredPrompt = null;
        } else {
          alert(i18n.t('alert_pc_install'));
        }
      });
    }

    const closeModal = () => {
      if (modalInstallGuide) modalInstallGuide.style.display = 'none';
    };

    if (btnCloseInstallModal) btnCloseInstallModal.addEventListener('click', closeModal);
    if (btnConfirmInstall) btnConfirmInstall.addEventListener('click', closeModal);

    if (modalInstallGuide) {
      modalInstallGuide.addEventListener('click', (e) => {
        if (e.target === modalInstallGuide) {
          closeModal();
        }
      });
    }

    if (btnCopyPageUrl) {
      btnCopyPageUrl.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          if (copyStatusMsg) {
            copyStatusMsg.textContent = i18n.t('install_copy_success');
            setTimeout(() => { if (copyStatusMsg) copyStatusMsg.textContent = ''; }, 3000);
          }
        } catch {
          if (copyStatusMsg) {
            copyStatusMsg.textContent = window.location.href;
          }
        }
      });
    }
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  (window as any).app = new CTDashcamStudioApp();
});
