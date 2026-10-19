// E2E Test for Native Language Selector and Mobile Add to Home Screen (PWA)
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173/';

(async () => {
  console.log('=== Starting PWA Shortcut & Native Language Selector E2E Test ===');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: EDGE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('[Browser]', msg.text()));
  page.on('pageerror', err => console.error('[PageError]', err));

  // 1. Test Language Dropdown Options (Native Endonyms)
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL, { waitUntil: 'networkidle0' });

  const langOptions = await page.evaluate(() => {
    const select = document.getElementById('select-language');
    if (!select) return [];
    return Array.from(select.options).map(opt => ({
      value: opt.value,
      text: opt.textContent.trim()
    }));
  });

  console.log('Language Options:', JSON.stringify(langOptions, null, 2));

  const expected = [
    { value: 'ko', text: '한국어' },
    { value: 'en', text: 'English' },
    { value: 'ja', text: '日本語' },
    { value: 'zh-CN', text: '简体中文' },
    { value: 'zh-TW', text: '繁體中文' }
  ];

  for (const exp of expected) {
    const match = langOptions.find(o => o.value === exp.value);
    if (!match || match.text !== exp.text) {
      throw new Error(`Language mismatch for ${exp.value}: got "${match?.text}", expected "${exp.text}"`);
    }
    console.log(`✓ Language ${exp.value} properly labeled as: "${exp.text}"`);
  }

  // Test selecting zh-CN
  await page.select('#select-language', 'zh-CN');
  const exportBtnZh = await page.$eval('#btn-export', el => el.textContent.trim());
  console.log(`✓ Switched to zh-CN, export button text: "${exportBtnZh}"`);
  if (!exportBtnZh.includes('导出')) {
    throw new Error(`Failed to switch to zh-CN translation`);
  }

  // Switch back to ko
  await page.select('#select-language', 'ko');

  // 2. Test Mobile Add to Home Screen Button & Modal (Galaxy 360x740)
  console.log('\nTesting Mobile Viewport (Android Galaxy 360x740)...');
  await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: 'networkidle0' });

  // Check btn-add-to-home visibility and text
  const addBtnInfo = await page.evaluate(() => {
    const btn = document.getElementById('btn-add-to-home');
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const style = window.getComputedStyle(btn);
    return {
      text: btn.textContent.trim(),
      visible: style.display !== 'none' && rect.width > 0 && rect.height > 0,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    };
  });

  console.log('Mobile Add to Home button info:', addBtnInfo);
  if (!addBtnInfo || !addBtnInfo.visible) {
    throw new Error('btn-add-to-home is not visible on mobile');
  }

  // Verify no overflow on 360px screen
  const isOverflowing = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  console.log(`✓ 360px Screen overflow check: ${isOverflowing ? 'FAILED' : 'PASSED (0px overflow)'}`);
  if (isOverflowing) throw new Error('360px viewport has horizontal overflow');

  // Click btn-add-to-home to open modal
  await page.click('#btn-add-to-home');
  await new Promise(r => setTimeout(r, 200));

  const modalState = await page.evaluate(() => {
    const modal = document.getElementById('modal-install-guide');
    if (!modal) return null;
    const style = window.getComputedStyle(modal);
    const guideAndroid = document.getElementById('guide-android');
    const guideIOS = document.getElementById('guide-ios');
    return {
      modalVisible: style.display !== 'none',
      androidGuideVisible: window.getComputedStyle(guideAndroid).display !== 'none',
      iosGuideVisible: window.getComputedStyle(guideIOS).display !== 'none'
    };
  });

  console.log('Install Guide Modal State on Mobile:', modalState);
  if (!modalState || !modalState.modalVisible) {
    throw new Error('Install Guide Modal did not open on clicking #btn-add-to-home');
  }

  // Save screenshot of the modal on 360px
  const modalScreenshotPath = path.join(__dirname, '..', 'docs', 'mobile_install_modal_360.png');
  await page.screenshot({ path: modalScreenshotPath });
  console.log(`✓ Saved modal screenshot: ${modalScreenshotPath}`);

  // Test close modal
  await page.click('#btn-close-install-modal');
  await new Promise(r => setTimeout(r, 200));
  const isClosed = await page.$eval('#modal-install-guide', el => window.getComputedStyle(el).display === 'none');
  console.log(`✓ Modal closed successfully: ${isClosed}`);
  if (!isClosed) throw new Error('Failed to close install guide modal');

  // 3. Test iPhone 14 Viewport (390x844)
  console.log('\nTesting iPhone 14 Viewport (390x844)...');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.click('#btn-add-to-home');
  await new Promise(r => setTimeout(r, 200));
  const modalIosScreenshot = path.join(__dirname, '..', 'docs', 'mobile_install_modal_390.png');
  await page.screenshot({ path: modalIosScreenshot });
  console.log(`✓ Saved iPhone modal screenshot: ${modalIosScreenshot}`);

  await browser.close();
  console.log('\n🎉 ALL PWA & NATIVE LANGUAGE SELECTOR TESTS PASSED 100%!');
})().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
