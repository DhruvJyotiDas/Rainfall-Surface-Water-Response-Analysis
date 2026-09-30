import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const destination = 'docs/images/screenshots';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.loading-screen').waitFor({ state: 'hidden' });
  await page.screenshot({ path: `${destination}/hero.png` });
  await page.setViewportSize({ width: 1440, height: 1500 });
  for (const [selector, name] of [['#dashboard', 'dashboard'], ['#science', 'science'], ['#results', 'findings']]) {
    await page.locator(selector).screenshot({ path: `${destination}/${name}.png` });
  }
  await page.getByRole('textbox', { name: 'Search tanks' }).fill('tank_0002');
  await page.locator('.tank-dot').click();
  await page.getByRole('slider', { name: 'Scenario rainfall', exact: true }).fill('400');
  await page.locator('.inspector').screenshot({ path: `${destination}/tank-inspector.png` });
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('button', { name: 'Back to district aggregate', exact: false }).click();
  await page.getByRole('button', { name: 'Peak storm', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${destination}/mobile.png` });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Captured six README screenshots from the final local production website.');
} finally {
  await browser.close();
}
