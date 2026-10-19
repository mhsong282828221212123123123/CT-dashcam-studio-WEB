import puppeteer from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEST_DIR = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';
const PORTRAIT_SCREENSHOT = 'E:\\tesla\\project\\CT-dashcam-studio-web\\docs\\mobile_portrait_ui.png';
const LANDSCAPE_SCREENSHOT = 'E:\\tesla\\project\\CT-dashcam-studio-web\\docs\\mobile_landscape_ui.png';
const DESKTOP_MODE_SCREENSHOT = 'E:\\tesla\\project\\CT-dashcam-studio-web\\docs\\mobile_pc_mode_ui.png';

async function runEdgeMobileTest() {
  console.log('=== Starting Microsoft Edge Mobile Responsive UI E2E Test ===');

  const files = fs.readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.mp4'))
    .map(f => path.join(TEST_DIR, f));

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=450,900'
    ]
  });

  const page = await browser.newPage();
  
  // Emulate iPhone 14 / modern smartphone (390 x 844)
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true
  });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');

  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}]`, msg.text());
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // 1. Check Mobile Portrait Auto-detection
  const isMobileDetected = await page.evaluate(() => {
    return document.body.classList.contains('view-mobile') || !document.body.classList.contains('view-desktop');
  });
  console.log('✓ Mobile Portrait auto-detection:', isMobileDetected);

  // 2. Upload test files
  const inputEl = await page.$('#fallback-file-input');
  await inputEl.uploadFile(...files);
  await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));

  await page.waitForSelector('.clip-node', { timeout: 10000 });
  console.log('✓ Clips loaded in mobile explorer list');
  await new Promise(r => setTimeout(r, 1500));

  // 3. Verify Canvas player is at top and visible
  const canvasBox = await page.evaluate(() => {
    const canvas = document.getElementById('player-canvas');
    const rect = canvas.getBoundingClientRect();
    return { top: rect.top, width: rect.width, height: rect.height };
  });
  console.log('✓ Video player canvas bounding box on mobile:', canvasBox);
  if (canvasBox.top < 0 || canvasBox.width <= 0) {
    throw new Error('Canvas should be visible at top of mobile screen!');
  }

  // 3-1. Verify Play Button label does NOT have (Space) in mobile mode
  const playBtnText = await page.$eval('#btn-play', el => el.textContent.trim());
  console.log('✓ Mobile play button text:', playBtnText);
  if (playBtnText.includes('(Space)')) {
    throw new Error('Mobile play button should not contain shortcut "(Space)" text!');
  }

  // 3-2. Test Pointer Event Scrubbing on timeline
  console.log('Testing Pointer Events scrubbing on timeline track...');
  const trackBox = await page.$eval('#timeline-track', el => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top + r.height / 2, width: r.width };
  });
  
  await page.evaluate((box) => {
    const track = document.getElementById('timeline-track');
    // Dispatch pointerdown at 50%
    const pDown = new PointerEvent('pointerdown', {
      clientX: box.left + box.width * 0.5,
      clientY: box.top,
      bubbles: true,
      pointerId: 1
    });
    track.dispatchEvent(pDown);
  }, trackBox);

  await new Promise(r => setTimeout(r, 400));
  const progressPct = await page.$eval('#timeline-progress', el => parseFloat(el.style.width || '0'));
  console.log('✓ Timeline progress after pointer scrub:', progressPct);
  if (progressPct < 30 || progressPct > 70) {
    throw new Error(`Expected progress ~50%, got ${progressPct}%`);
  }

  // 3-3. Test Mobile Tier Badge and Modal
  console.log('Testing Mobile Tier Badge and Modal...');
  const mobileTierBadge = await page.$eval('#mobile-tier-badge', el => el.textContent.trim());
  console.log('✓ Mobile tier badge text:', mobileTierBadge);
  if (!mobileTierBadge.includes('Tier')) {
    throw new Error('Mobile tier badge should display detected tier!');
  }

  // Click mobile tier badge to open modal
  await page.click('#mobile-tier-badge');
  await new Promise(r => setTimeout(r, 300));
  const isTierModalOpen = await page.$eval('#tier-modal', el => el.style.display !== 'none');
  console.log('✓ Tier modal opened on mobile tier badge tap:', isTierModalOpen);
  if (!isTierModalOpen) throw new Error('Tier modal should be open after clicking tier badge!');

  // Close tier modal
  await page.click('#btn-close-tier');
  await new Promise(r => setTimeout(r, 300));
  const isTierModalClosed = await page.$eval('#tier-modal', el => el.style.display === 'none');
  console.log('✓ Tier modal closed successfully:', isTierModalClosed);
  if (!isTierModalClosed) throw new Error('Tier modal should close!');

  // 3-4. Test Canvas Camera Slot Zoom (Double-click / Double-tap)
  console.log('Testing Camera Slot Zoom via canvas double-click/tap...');
  await page.evaluate(() => {
    const canvas = document.getElementById('player-canvas');
    const rect = canvas.getBoundingClientRect();
    // Simulate double click on right column (e.g. rear camera in 1:3)
    const dblClickEvent = new MouseEvent('dblclick', {
      clientX: rect.left + rect.width * 0.85,
      clientY: rect.top + rect.height * 0.2,
      bubbles: true
    });
    canvas.dispatchEvent(dblClickEvent);
  });
  await new Promise(r => setTimeout(r, 500));
  const singleCamActive = await page.evaluate(() => {
    return document.getElementById('btn-layout-single').classList.contains('active');
  });
  console.log('✓ Camera slot zoomed into Single Camera mode:', singleCamActive);
  if (!singleCamActive) throw new Error('Slot zoom should activate single camera mode!');

  // Zoom back out to 1:3 layout
  await page.evaluate(() => {
    const canvas = document.getElementById('player-canvas');
    const rect = canvas.getBoundingClientRect();
    const dblClickEvent = new MouseEvent('dblclick', {
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + rect.height * 0.5,
      bubbles: true
    });
    canvas.dispatchEvent(dblClickEvent);
  });
  await new Promise(r => setTimeout(r, 500));
  const layoutRestored = await page.evaluate(() => {
    return !document.getElementById('btn-layout-single').classList.contains('active');
  });
  console.log('✓ Restored previous layout after second double click:', layoutRestored);
  if (!layoutRestored) throw new Error('Should restore previous layout after double click!');

  // 4. Test Mobile Tabs navigation and Sub-slider synchronization
  console.log('Testing Mobile Tab switching and slider sync...');
  // Click [🎛️ 오버레이] tab
  const tabOverlays = await page.$('.mobile-tab-btn[data-tab="overlays"]');
  await tabOverlays.click();
  await new Promise(r => setTimeout(r, 400));

  const overlaysVisible = await page.evaluate(() => {
    const sec = document.querySelector('.mobile-tab-section[data-mobile-tab="overlays"]');
    return window.getComputedStyle(sec).display !== 'none';
  });
  console.log('✓ Overlays tab active and visible:', overlaysVisible);
  if (!overlaysVisible) throw new Error('Overlays section should be displayed!');

  // Test brightness sub slider sync
  await page.evaluate(() => {
    const subBr = document.getElementById('slider-brightness-sub');
    subBr.value = '25';
    subBr.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const mainBrVal = await page.$eval('#slider-brightness', el => el.value);
  console.log('✓ Main brightness slider synced from mobile tab:', mainBrVal);
  if (mainBrVal !== '25') throw new Error(`Expected brightness 25, got ${mainBrVal}`);

  // Click [⚙️ 설정·추출] tab
  const tabExport = await page.$('.mobile-tab-btn[data-tab="export"]');
  await tabExport.click();
  await new Promise(r => setTimeout(r, 400));

  const exportVisible = await page.evaluate(() => {
    const sec = document.querySelector('.mobile-tab-section[data-mobile-tab="export"]');
    return window.getComputedStyle(sec).display !== 'none';
  });
  console.log('✓ Export tab active and visible:', exportVisible);
  if (!exportVisible) throw new Error('Export section should be displayed!');

  // Switch back to [🎬 클립 탐색] tab
  const tabClips = await page.$('.mobile-tab-btn[data-tab="clips"]');
  await tabClips.click();
  await new Promise(r => setTimeout(r, 400));

  // Capture Mobile Portrait Screenshot
  await page.screenshot({ path: PORTRAIT_SCREENSHOT });
  console.log(`✓ Saved Portrait screenshot to ${PORTRAIT_SCREENSHOT}`);

  // 5. Test "PC 버전으로 보기" button
  console.log('Testing "🖥️ PC버전으로 보기" toggle button...');
  const btnToggle = await page.$('#btn-toggle-view-mode');
  await btnToggle.click();
  await new Promise(r => setTimeout(r, 800));

  const isDesktopMode = await page.evaluate(() => {
    return document.body.classList.contains('view-desktop');
  });
  console.log('✓ Switched to Desktop view mode:', isDesktopMode);
  if (!isDesktopMode) throw new Error('Failed to switch to Desktop view mode!');

  // Verify Play Button in Desktop mode DOES have (Space)
  const desktopPlayBtnText = await page.$eval('#btn-play', el => el.textContent.trim());
  console.log('✓ Desktop play button text in PC mode:', desktopPlayBtnText);
  if (!desktopPlayBtnText.includes('(Space)')) {
    throw new Error('Desktop play button should contain shortcut "(Space)" text!');
  }

  // Verify Floating Mobile Return button is visible
  const floatingBtnVisible = await page.evaluate(() => {
    const btn = document.getElementById('btn-floating-view-mode');
    return window.getComputedStyle(btn).display !== 'none';
  });
  console.log('✓ Floating "📱 모바일 모드로 전환" button visible:', floatingBtnVisible);
  if (!floatingBtnVisible) throw new Error('Floating return button should be visible in desktop mode on mobile!');

  await page.screenshot({ path: DESKTOP_MODE_SCREENSHOT });
  console.log(`✓ Saved Desktop Mode on Mobile screenshot to ${DESKTOP_MODE_SCREENSHOT}`);

  // 6. Test returning to Mobile Mode via Floating Button
  console.log('Testing return to Mobile Mode via floating button...');
  await page.evaluate(() => {
    document.getElementById('btn-floating-view-mode').click();
  });
  await new Promise(r => setTimeout(r, 800));

  const isMobileRestored = await page.evaluate(() => {
    return document.body.classList.contains('view-mobile');
  });
  console.log('✓ Restored back to Mobile view mode:', isMobileRestored);
  if (!isMobileRestored) throw new Error('Failed to restore mobile view mode!');

  // 7. Test Mobile Landscape (가로 모드) Fullscreen Cinema UI
  console.log('Testing Mobile Landscape (가로 모드, 844 x 390)...');
  await page.setViewport({
    width: 844,
    height: 390,
    isMobile: true,
    hasTouch: true
  });
  await new Promise(r => setTimeout(r, 800));

  // Check Landscape drawer button
  const drawerBtn = await page.$('#btn-landscape-drawer');
  const drawerBtnVisible = await page.evaluate(() => {
    const btn = document.getElementById('btn-landscape-drawer');
    return window.getComputedStyle(btn).display !== 'none';
  });
  console.log('✓ Landscape drawer button visible:', drawerBtnVisible);

  // Click drawer button to slide out clip drawer
  await page.evaluate(() => {
    document.getElementById('btn-landscape-drawer').click();
  });
  await new Promise(r => setTimeout(r, 500));

  const drawerOpen = await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar-panel');
    return sidebar.classList.contains('landscape-drawer-open');
  });
  console.log('✓ Landscape clip drawer opened:', drawerOpen);
  if (!drawerOpen) throw new Error('Landscape drawer should be open!');

  await page.screenshot({ path: LANDSCAPE_SCREENSHOT });
  console.log(`✓ Saved Landscape screenshot to ${LANDSCAPE_SCREENSHOT}`);

  // 8. Test Small Android Phone Viewport (360 x 740)
  console.log('Testing Small Android Phone Viewport (360 x 740)...');
  await page.setViewport({
    width: 360,
    height: 740,
    isMobile: true,
    hasTouch: true
  });
  await new Promise(r => setTimeout(r, 500));
  const androidCanvasBox = await page.evaluate(() => {
    const canvas = document.getElementById('player-canvas');
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  console.log('✓ Android 360x740 Canvas dimensions:', androidCanvasBox);
  if (androidCanvasBox.width <= 0 || androidCanvasBox.height <= 0) {
    throw new Error('Canvas must be visible on small Android screen!');
  }

  // 9. Test Tablet Viewport (768 x 1024)
  console.log('Testing Tablet Viewport (768 x 1024)...');
  await page.setViewport({
    width: 768,
    height: 1024,
    isMobile: true,
    hasTouch: true
  });
  await new Promise(r => setTimeout(r, 500));
  const tabletCanvasBox = await page.evaluate(() => {
    const canvas = document.getElementById('player-canvas');
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  console.log('✓ Tablet 768x1024 Canvas dimensions:', tabletCanvasBox);
  if (tabletCanvasBox.width <= 0 || tabletCanvasBox.height <= 0) {
    throw new Error('Canvas must be visible on tablet screen!');
  }

  // Copy screenshots to artifact directory
  const artifactDir = 'C:\\Users\\ddno2\\.gemini\\antigravity\\brain\\1296f195-8d13-4c1e-ae90-bae2100cf725';
  fs.copyFileSync(PORTRAIT_SCREENSHOT, path.join(artifactDir, 'mobile_portrait_ui.png'));
  fs.copyFileSync(LANDSCAPE_SCREENSHOT, path.join(artifactDir, 'mobile_landscape_ui.png'));

  await browser.close();
  console.log('🎉 ALL MOBILE RESPONSIVE EDGE TESTS PASSED 100%!');
}

runEdgeMobileTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
