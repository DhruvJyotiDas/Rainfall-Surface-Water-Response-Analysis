import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.loading-screen').waitFor({ state: 'hidden' });
  await page.screenshot({ path: '../desktop-hero.png' });
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#dashboard').offsetTop));
  await page.screenshot({ path: '../desktop-dashboard.png' });
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#science').offsetTop));
  await page.screenshot({ path: '../desktop-science.png' });
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#results').offsetTop));
  await page.screenshot({ path: '../desktop-results.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '../mobile-hero.png' });
  for (const id of ['dashboard', 'results']) {
    await page.evaluate(id => window.scrollTo(0, document.querySelector('#' + id).offsetTop), id);
    await page.screenshot({ path: `../mobile-${id}.png` });
  }
  console.log(JSON.stringify({ errors, title: await page.title(), fontsReady: await page.evaluate(() => document.fonts.check('16px "Space Grotesk Variable"')) }));
} finally {
  await browser.close();
}
