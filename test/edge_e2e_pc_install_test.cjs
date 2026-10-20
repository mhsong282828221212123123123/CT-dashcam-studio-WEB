const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\ddno2\\.gemini\\antigravity\\brain\\1296f195-8d13-4c1e-ae90-bae2100cf725';

async function runPcInstallTest() {
  console.log('=== Starting PC "앱 설치" Button & PWA Install E2E Test ===');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Browser error]`, msg.text());
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // 1. Verify PC Desktop Footer & Install Button
  const btnInfo = await page.evaluate(() => {
    const btn = document.getElementById('btn-pc-install');
    const tierBadge = document.getElementById('tier-badge');
    const tierGroup = btn ? btn.closest('.tier-group') : null;
    const style = btn ? window.getComputedStyle(btn) : null;
    return {
      exists: Boolean(btn),
      text: btn ? btn.textContent.trim() : null,
      display: style ? style.display : null,
      inTierGroup: Boolean(tierGroup && tierGroup.contains(tierBadge)),
    };
  });

  console.log('PC Install Button state on Desktop:', btnInfo);
  if (!btnInfo.exists) {
    throw new Error('Button #btn-pc-install does not exist!');
  }
  if (!btnInfo.text.includes('앱 설치')) {
    throw new Error(`Button text should include '앱 설치', got: ${btnInfo.text}`);
  }
  if (!['inline-flex', 'flex'].includes(btnInfo.display)) {
    throw new Error(`Button display should be inline-flex or flex, got: ${btnInfo.display}`);
  }
  if (!btnInfo.inTierGroup) {
    throw new Error('Button should be inside .tier-group next to #tier-badge!');
  }
  console.log('✓ PC Install button is cleanly positioned next to tier badge on desktop');

  // Screenshot footer showing tier badge and app install button
  const footerEl = await page.$('.app-footer');
  if (footerEl) {
    const screenshotPath = path.join(ARTIFACT_DIR, 'pc_tier_install_button.png');
    await footerEl.screenshot({ path: screenshotPath });
    const docsPath = path.join(__dirname, '../docs/pc_tier_install_button.png');
    fs.copyFileSync(screenshotPath, docsPath);
    console.log(`✓ Screenshot of tier badge + install button saved: ${screenshotPath}`);
  }

  // 2. Test click with beforeinstallprompt mock
  console.log('\nTesting PWA install flow and button disappearance after install...');
  const installResult = await page.evaluate(async () => {
    const btn = document.getElementById('btn-pc-install');
    let promptCalled = false;

    // Simulate beforeinstallprompt
    const mockEvent = new Event('beforeinstallprompt');
    Object.assign(mockEvent, {
      prompt: async () => {
        promptCalled = true;
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });

    window.dispatchEvent(mockEvent);

    // Click the button
    btn.click();
    await new Promise(r => setTimeout(r, 200));

    const style = window.getComputedStyle(btn);
    return {
      promptCalled,
      displayAfterInstall: style.display,
      isInstalledClass: btn.classList.contains('installed'),
      localStorageVal: localStorage.getItem('pwa_installed'),
    };
  });

  console.log('Install Result:', installResult);
  if (!installResult.promptCalled) {
    throw new Error('PWA install prompt was not triggered upon button click!');
  }
  if (installResult.displayAfterInstall !== 'none') {
    throw new Error(`Button must be hidden (display: none) after install! Got: ${installResult.displayAfterInstall}`);
  }
  console.log('✓ Install button was successfully triggered and is completely hidden after installation!');

  // 3. Test page reload: button must remain hidden when pwa_installed is stored
  console.log('\nTesting button visibility after page reload with installed state...');
  await page.reload({ waitUntil: 'networkidle0' });
  const reloadBtnState = await page.evaluate(() => {
    const btn = document.getElementById('btn-pc-install');
    const style = btn ? window.getComputedStyle(btn) : null;
    return {
      display: style ? style.display : null,
      isInstalled: btn ? btn.classList.contains('installed') : false,
    };
  });
  console.log('Button state after reload:', reloadBtnState);
  if (reloadBtnState.display !== 'none') {
    throw new Error(`Button must stay hidden after reload if installed! Got: ${reloadBtnState.display}`);
  }
  console.log('✓ Button remains permanently hidden after reload when already installed!');

  // 4. Test Mobile Viewport: Button must NOT be visible on mobile
  console.log('\nTesting Mobile Viewport (390x844)...');
  await page.evaluate(() => localStorage.removeItem('pwa_installed')); // reset storage
  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle0' });

  const mobileBtnState = await page.evaluate(() => {
    const btn = document.getElementById('btn-pc-install');
    const footer = document.querySelector('.app-footer');
    const btnStyle = btn ? window.getComputedStyle(btn) : null;
    const footerStyle = footer ? window.getComputedStyle(footer) : null;
    return {
      btnDisplay: btnStyle ? btnStyle.display : null,
      footerDisplay: footerStyle ? footerStyle.display : null,
    };
  });
  console.log('Mobile view button state:', mobileBtnState);
  if (mobileBtnState.btnDisplay !== 'none') {
    throw new Error(`Button must be hidden on mobile! Got: ${mobileBtnState.btnDisplay}`);
  }
  console.log('✓ Button is strictly hidden on mobile devices!');

  await browser.close();
  console.log('=== ALL PC INSTALL BUTTON & PWA SHORTCUT TESTS PASSED 100%! ===');
}

runPcInstallTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
