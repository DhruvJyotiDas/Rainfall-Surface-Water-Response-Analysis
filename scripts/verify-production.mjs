import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [], external = [], failures = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (!request.url().startsWith(origin) && !request.url().startsWith('blob:')) external.push(request.url()); });
  page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('.loading-screen').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.tank-dot').count(), 470);
  assert.equal(await page.locator('.storm-scene canvas').count(), 1);
  await page.getByRole('slider', { name: 'Scenario rainfall', exact: true }).fill('500');
  await page.getByRole('textbox', { name: 'Search tanks' }).fill('tank_0002');
  await page.locator('.tank-dot').click();
  assert.equal(await page.getByTestId('fill-percent').innerText(), '100%');
  assert.equal(await page.getByTestId('inspector-title').innerText(), 'TANK_0002');
  assert.equal(await page.evaluate(() => document.fonts.check('16px "Space Grotesk Variable"')), true);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(failures, []);
  console.log('Production smoke check passed: 470 tanks, WebGL, scenario/selection, local fonts, no external requests, no failed assets, no browser errors.');
} finally {
  await browser.close();
}
