// Main Application Entrypoint for CT Dashcam Studio Web
import { RealTeslaSEIDecoder, BlobFileHandle, TelemetryData } from './core/seiDecoder';
import {
  groupFilesIntoClips,
  scanFileSystemDirectory,
  FolderGroup,
  ClipItem,
  ScannedFileItem,
  getClipFile,
  ensureClipFiles,
  CAM_REGEX,
} from './core/clipScanner';
import { SeiWorkerResponse } from './core/seiWorker';
import { OverlayRenderer, RenderOptions, DEFAULT_RENDER_OPTIONS, DEFAULT_TELEMETRY_ORDER, COL_WIDTH_BASE } from './core/renderer';
import { detectDeviceCapabilities, CapabilityPolicy } from './core/capability';
import { WebCodecsExporter, ExportClipSegment } from './core/exporter';
import { RESOLUTIONS, CameraKey } from './core/constants';
import { i18n, SupportedLang } from './core/i18n';

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

  // Parking detection worker state
  private loadGeneration = 0;
  private parkingQueue: string[] = [];
  private isProcessingParking = false;
  private isSelectingClip = false;
  private parkingObserver: IntersectionObserver | null = null;

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

    (window as any).app = this;
    console.log('[App] CT Dashcam Studio Web initialized');
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
      textEl.textContent = `주행 데이터 분석 중... ${pct}% (${parsedFrames}/${totalFrames}f)`;
    } else {
      textEl.textContent = `주행 데이터 분석 중... ${pct}%`;
    }
  }

  hideSeiProgress() {
    const badge = document.getElementById('sei-progress-badge');
    if (badge) {
      badge.style.display = 'none';
    }
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
      if (btnDrawer) btnDrawer.textContent = '✕ 닫기';
    };

    const closeDrawer = () => {
      this.isLandscapeDrawerOpen = false;
      if (sidebar) {
        sidebar.style.transform = '';
        sidebar.classList.remove('landscape-drawer-open');
      }
      if (backdrop) backdrop.style.display = 'none';
      if (btnDrawer) btnDrawer.textContent = '🎬 메뉴 / 클립';
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
    // 1. Open Folder Button & Fallback Inputs
    const btnOpenFolder = document.getElementById('btn-open-folder');
    const fallbackFolderInput = document.getElementById('fallback-folder-input') as HTMLInputElement;

    btnOpenFolder?.addEventListener('click', async () => {
      // 1) 보안 컨텍스트에서 File System Access API(showDirectoryPicker) 지원 시 우선 사용
      if ('showDirectoryPicker' in window && (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        try {
          const dirHandle = await (window as any).showDirectoryPicker();
          this.showLoadProgress('📂 폴더 탐색 중...', '영상 탐색 중...', 0, true);
          const items = await scanFileSystemDirectory(dirHandle, (filesCount, dirsCount) => {
            this.showLoadProgress('📂 폴더 탐색 중...', `영상 ${filesCount}개 발견 (폴더 ${dirsCount}개)`, 0, true);
          });
          if (items && items.length > 0) {
            await this.loadFiles(items);
            return;
          }
        } catch (e: any) {
          if (e.name === 'AbortError') {
            this.hideLoadProgress();
            return; // 사용자가 취소함
          }
          console.warn('showDirectoryPicker failed, falling back to folder input:', e);
        } finally {
          this.hideLoadProgress();
        }
      }

      // 2) HTML5 표준 webkitdirectory 폴더 선택 창 실행
      if (fallbackFolderInput) {
        fallbackFolderInput.value = '';
        fallbackFolderInput.click();
      }
    });

    fallbackFolderInput?.addEventListener('change', async () => {
      if (fallbackFolderInput.files && fallbackFolderInput.files.length > 0) {
        await this.loadFiles(Array.from(fallbackFolderInput.files));
      }
    });

    const fallbackFileInput = document.getElementById('fallback-file-input') as HTMLInputElement;
    fallbackFileInput?.addEventListener('change', async () => {
      if (fallbackFileInput.files && fallbackFileInput.files.length > 0) {
        await this.loadFiles(Array.from(fallbackFileInput.files));
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
      this.updateFpsOptions();
      this.updateEstimatedSize();
    });
    document.getElementById('export-fps-select')?.addEventListener('change', () => this.updateEstimatedSize());
    const selectLanguage = document.getElementById('select-language') as HTMLSelectElement;
    if (selectLanguage) {
      selectLanguage.value = i18n.getLang();
      selectLanguage.addEventListener('change', (e) => {
        const targetLang = (e.target as HTMLSelectElement).value as SupportedLang;
        i18n.setLang(targetLang);
        this.updateEstimatedSize();
        this.updateRangeUI();
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

  async loadFiles(files: (File | ScannedFileItem)[]) {
    console.log('[App] loadFiles called with', files.length, 'files');
    if (!files || files.length === 0) return;

    // 1. Invalidate previous parking detection generation & queue
    this.loadGeneration++;
    this.parkingQueue = [];
    if (this.parkingObserver) {
      this.parkingObserver.disconnect();
    }

    // 2. Pre-filter candidate files with regex
    const validFiles = files.filter((f) => {
      const relPath =
        (f as any).webkitRelativePath ||
        (f as any)._relativePath ||
        (f as any).relativePath ||
        f.name;
      return CAM_REGEX.test(relPath);
    });

    const candidateList = validFiles.length > 0 ? validFiles : files;
    const totalCount = candidateList.length;

    this.showLoadProgress('🎬 클립 분류 중...', `0 / ${totalCount}개 파일 (0%)`, 0, false);

    this.folderGroups = groupFilesIntoClips(candidateList, (done, total, clipCount) => {
      const pct = Math.round((done / total) * 100);
      this.showLoadProgress(
        '🎬 클립 분류 중...',
        `${done} / ${total}개 파일 (${pct}%) · ${clipCount}개 클립`,
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
    this.hideLoadProgress();

    // 5. On mobile portrait, expand bottom sheet so user sees clips
    if (this.isMobilePortrait()) {
      this.toggleExplorerSheet(true);
    }

    // 6. Select first clip if available on next animation frame
    if (this.folderGroups.length > 0 && this.folderGroups[0].clips.length > 0) {
      const firstClip = this.folderGroups[0].clips[0];
      requestAnimationFrame(() => {
        this.selectClip(firstClip);
      });
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
      const isParking = clip.isParking ?? (clip.folder.includes('Sentry') || clip.folder.includes('Parking'));
      const tagClass = isParking ? 'parking' : 'driving';
      const tagText = `[${isParking ? '주차' : '주행'}] ${camCount}채널`;

      let classes = 'clip-node';
      if (isActive) classes += ' active';
      if (inRange) classes += ' in-range';

      htmlParts.push(
        `<div class="${classes}" id="clip-item-${clip.safeId}" data-clip-id="${clip.id}">` +
          `<span>🎬 ${clip.timestampStr}</span>` +
          `<span id="tag-${clip.safeId}" class="clip-type-tag ${tagClass}">${tagText}</span>` +
        `</div>`
      );
    }

    container.innerHTML = htmlParts.join('');
    container.setAttribute('data-rendered', 'true');
    this.observeClipNodes(container);
  }

  private observeClipNodes(container: HTMLElement) {
    if (!this.parkingObserver) {
      const rootEl = document.getElementById('clips-tree');
      this.parkingObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const clipId = target.getAttribute('data-clip-id');
          if (!clipId) continue;
          const clip = this.clipMap.get(clipId);
          if (!clip || clip.isParking !== undefined) continue;

          if (entry.isIntersecting) {
            if (!this.parkingQueue.includes(clipId)) {
              this.parkingQueue.push(clipId);
              this.processNextParkingCheck();
            }
          } else {
            const qIdx = this.parkingQueue.indexOf(clipId);
            if (qIdx !== -1) {
              this.parkingQueue.splice(qIdx, 1);
            }
          }
        }
      }, {
        root: rootEl,
        rootMargin: '100px',
        threshold: 0,
      });
    }

    const rows = container.querySelectorAll('.clip-node');
    rows.forEach((r) => this.parkingObserver?.observe(r));
  }

  private async processNextParkingCheck() {
    if (this.isProcessingParking) return;
    if (this.isSelectingClip && this.isMobileDevice()) return;
    if (this.parkingQueue.length === 0) return;

    this.isProcessingParking = true;
    const currentGen = this.loadGeneration;

    const clipId = this.parkingQueue.shift();
    if (!clipId) {
      this.isProcessingParking = false;
      return;
    }

    const clip = this.clipMap.get(clipId);
    if (!clip || clip.isParking !== undefined) {
      this.isProcessingParking = false;
      this.scheduleNextParkingCheck();
      return;
    }

    const frontFile = await getClipFile(clip, 'front');
    if (!frontFile) {
      this.isProcessingParking = false;
      this.scheduleNextParkingCheck();
      return;
    }

    try {
      const handle = new BlobFileHandle(frontFile);
      const isParking = await RealTeslaSEIDecoder.quickCheckIsParking(handle);
      if (currentGen !== this.loadGeneration) {
        this.isProcessingParking = false;
        return;
      }
      clip.isParking = isParking;

      // Update badge in DOM if visible
      const tagEl = document.getElementById(`tag-${clip.safeId}`);
      if (tagEl) {
        const camCount = Math.max(Object.keys(clip.cams).length, clip.camHandles ? Object.keys(clip.camHandles).length : 0);
        tagEl.className = `clip-type-tag ${isParking ? 'parking' : 'driving'}`;
        tagEl.textContent = `[${isParking ? '주차' : '주행'}] ${camCount}채널`;
      }
    } catch (e) {
      console.warn('[App] quickCheckIsParking error:', e);
    } finally {
      this.isProcessingParking = false;
      if (currentGen === this.loadGeneration) {
        this.scheduleNextParkingCheck();
      }
    }
  }

  private scheduleNextParkingCheck() {
    if (this.parkingQueue.length === 0) return;
    if (typeof (window as any).requestIdleCallback === 'function') {
      (window as any).requestIdleCallback(() => this.processNextParkingCheck(), { timeout: 200 });
    } else {
      setTimeout(() => this.processNextParkingCheck(), 50);
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

    const activeFolder = this.activeClip?.folder;
    const isSingleFolder = this.folderGroups.length === 1;
    const docFrag = document.createDocumentFragment();

    this.folderGroups.forEach((group, idx) => {
      const folderDiv = document.createElement('div');
      const isFolderOpen = isSingleFolder || (activeFolder ? group.folderName === activeFolder || group.clips.some((c) => c.folder === activeFolder) : idx === 0);

      folderDiv.className = `folder-node ${isFolderOpen ? '' : 'collapsed'}`;
      folderDiv.setAttribute('data-group-idx', String(idx));

      const folderHeader = document.createElement('div');
      folderHeader.className = 'folder-header';
      folderHeader.setAttribute('data-group-idx', String(idx));
      folderHeader.innerHTML = `<span class="folder-arrow">▼</span> <span>📁</span> <span class="folder-name">${group.folderName} (${group.clips.length})</span>`;

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

        // Master camera preloads 'auto', other cameras preload 'metadata'
        const isMaster = key === 'front' || key === camKeys[0];
        video.preload = isMaster ? 'auto' : 'metadata';

        this.videoContainer.appendChild(video);
        this.videoPool[key] = video;
        try {
          video.load();
        } catch {}
      }

      // Get duration from master video with safe timeout for mobile browsers
      const masterVideo = this.videoPool.front || Object.values(this.videoPool)[0];
      if (masterVideo) {
        await new Promise<void>((resolve) => {
          if (masterVideo.readyState >= 1) {
            resolve();
            return;
          }
          let done = false;
          const finish = () => {
            if (!done) {
              done = true;
              resolve();
            }
          };
          masterVideo.onloadedmetadata = finish;
          masterVideo.onloadeddata = finish;
          masterVideo.oncanplay = finish;
          masterVideo.onerror = finish;
          // 1.5s fallback timeout: ensures mobile UI never freezes if metadata is delayed or blocked
          setTimeout(finish, 1500);
        });
        this.durationSec = masterVideo.duration && !isNaN(masterVideo.duration) && masterVideo.duration > 0
          ? masterVideo.duration
          : 60.0;
      }

      this.seekTo(0);
      this.updatePlayButton();

      // Start non-blocking background telemetry extraction
      this.startBackgroundTelemetry(clip, clipGen);
    } finally {
      this.isSelectingClip = false;
      this.scheduleNextParkingCheck();
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

  private togglePlay() {
    this.isPlaying = !this.isPlaying;
    const masterVideo = this.videoPool.front || Object.values(this.videoPool)[0];

    if (this.isPlaying) {
      if (masterVideo && masterVideo.ended) {
        this.seekTo(0);
      }
      // Upgrade any metadata preload to auto for smooth multi-cam playback
      Object.values(this.videoPool).forEach((v) => {
        if (v) {
          if (v.preload !== 'auto') v.preload = 'auto';
          v.play().catch(() => {});
        }
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

  private updateFpsOptions() {
    const fpsSelect = document.getElementById('export-fps-select') as HTMLSelectElement;
    const speedSelect = document.getElementById('export-speed-select') as HTMLSelectElement;
    if (!fpsSelect) return;

    const hasPillars = Boolean(
      this.activeClip?.cams.left_pillar || this.activeClip?.cams.right_pillar
    );
    const baseFps = hasPillars ? 24.0 : 36.0;
    const exportSpeed = parseFloat(speedSelect?.value || '1.0');
    const maxFps = Math.min(120, Math.round(baseFps * exportSpeed));

    const currentVal = parseInt(fpsSelect.value) || maxFps;

    const candidates: Array<{ label: string; val: number }> = [
      { label: `${maxFps} FPS (원본 최적)`, val: maxFps },
      { label: '60 FPS', val: 60 },
      { label: '36 FPS', val: 36 },
      { label: '30 FPS (표준)', val: 30 },
      { label: '24 FPS (시네마)', val: 24 },
      { label: '15 FPS (절감)', val: 15 },
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
      opt.value = String(maxFps);
      opt.textContent = `${maxFps} FPS`;
      fpsSelect.appendChild(opt);
      added.add(maxFps);
    }

    if (added.has(currentVal)) {
      fpsSelect.value = String(currentVal);
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

  // PWA / Add to Home Screen handler for Android & iOS
  private initPWAInstall() {
    let deferredPrompt: any = null;
    const btnAddToHome = document.getElementById('btn-add-to-home');
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

    // Capture beforeinstallprompt for Android / Chrome / Edge / Samsung Internet
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (btnTriggerPwaInstall) {
        btnTriggerPwaInstall.style.display = 'block';
      }
    });

    const openInstallModal = () => {
      if (modalInstallGuide) modalInstallGuide.style.display = 'flex';
      // Detect platform
      const ua = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroid = /android/.test(ua);
      const guideAndroid = document.getElementById('guide-android');
      const guideIOS = document.getElementById('guide-ios');

      if (isIOS) {
        if (guideIOS) guideIOS.style.display = 'block';
        if (guideAndroid) guideAndroid.style.display = 'none';
      } else if (isAndroid) {
        if (guideAndroid) guideAndroid.style.display = 'block';
        if (guideIOS) guideIOS.style.display = 'none';
        if (deferredPrompt && btnTriggerPwaInstall) {
          btnTriggerPwaInstall.style.display = 'block';
        }
      } else {
        // Desktop / Other: show both
        if (guideAndroid) guideAndroid.style.display = 'block';
        if (guideIOS) guideIOS.style.display = 'block';
      }
    };

    if (btnAddToHome) {
      btnAddToHome.addEventListener('click', () => {
        openInstallModal();
      });
    }

    if (btnTriggerPwaInstall) {
      btnTriggerPwaInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const choiceResult = await deferredPrompt.userChoice;
          if (choiceResult && choiceResult.outcome === 'accepted') {
            if (modalInstallGuide) modalInstallGuide.style.display = 'none';
          }
          deferredPrompt = null;
        } else {
          alert('브라우저 메뉴(⋮ 또는 ≡)에서 "홈 화면에 추가" 또는 "현재 페이지 추가"를 선택하세요.');
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
            copyStatusMsg.textContent = '✓ 링크 복사 완료!';
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
  new CTDashcamStudioApp();
});
