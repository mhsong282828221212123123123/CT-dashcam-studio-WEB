const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f141f"/>
      <stop offset="50%" stop-color="#090c12"/>
      <stop offset="100%" stop-color="#05070a"/>
    </linearGradient>
    <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00e6ff"/>
      <stop offset="50%" stop-color="#39ff14"/>
      <stop offset="100%" stop-color="#ffd700"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  
  <!-- App Icon Background with smooth squircle border -->
  <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#bgGrad)" stroke="#00e6ff" stroke-width="6" stroke-opacity="0.4"/>
  
  <!-- Cybertruck geometric roofline silhouette -->
  <path d="M70 330 L195 200 L345 200 L442 330 Z" fill="none" stroke="#00e6ff" stroke-width="8" stroke-linejoin="round" opacity="0.35"/>
  
  <!-- Powerful Neon Lightning Bolt Center -->
  <path d="M285 70 L175 270 L255 270 L220 442 L345 235 L265 235 Z" fill="url(#boltGrad)" filter="url(#glow)"/>
  
  <!-- Text Label -->
  <text x="256" y="472" font-family="Arial, sans-serif" font-weight="900" font-size="38" fill="#ffffff" text-anchor="middle" letter-spacing="3">CT DASH</text>
</svg>
`;

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  
  // 512x512
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;">${svg}</body></html>`);
  const buf512 = await page.screenshot({ type: 'png', omitBackground: true });
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'icon-512.png'), buf512);

  // 192x192
  await page.setViewport({ width: 192, height: 192, deviceScaleFactor: 1 });
  const svg192 = svg.replace('width="512" height="512"', 'width="192" height="192"');
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;">${svg192}</body></html>`);
  const buf192 = await page.screenshot({ type: 'png', omitBackground: true });
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'icon-192.png'), buf192);
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'apple-touch-icon.png'), buf192);

  // SVG itself
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'icon.svg'), svg.trim());

  await browser.close();
  console.log('✓ Successfully generated icon-512.png, icon-192.png, apple-touch-icon.png, and icon.svg');
})();
