import { test, expect, type Page } from '@playwright/test';

async function range(page: Page, name: string, value: number) {
  await page.getByRole('slider', { name, exact: true }).fill(String(value));
}

test.beforeEach(async ({ page }) => {
  // Deterministic UI checks and accessibility preference coverage; a dedicated
  // graphics test below exercises the live atmosphere separately.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /When the rain falls/ })).toBeVisible();
});

test('inventory, map selection, search, empty state and table navigation', async ({ page }) => {
  await expect(page.locator('.tank-dot')).toHaveCount(470);
  await expect(page.getByTestId('tank-count')).toContainText('470');
  await page.getByRole('textbox', { name: 'Search tanks' }).fill('tank_0002');
  await expect(page.locator('.tank-dot')).toHaveCount(1);
  await page.locator('.tank-dot').click();
  await expect(page.getByTestId('inspector-title')).toHaveText('TANK_0002');
  await page.getByRole('button', { name: 'Bookmark selected tank' }).click();
  await expect(page.getByRole('button', { name: 'Bookmark selected tank' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('button', { name: 'Show bookmarked tanks' }).click();
  await expect(page.locator('.tank-dot')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show bookmarked tanks' }).click();
  await page.getByRole('textbox', { name: 'Search tanks' }).fill('no-matching-tank');
  await expect(page.getByText('No tanks match these filters.')).toBeVisible();
  await expect(page.getByTestId('inspector-title')).toHaveText('DISTRICT OVERVIEW');
  await expect(page.getByRole('button', { name: 'Select random tank' })).toBeDisabled();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('button', { name: 'Table view', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(10);
  const firstId = await page.locator('tbody tr').first().innerText();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('tbody tr').first()).not.toHaveText(firstId!);
  await page.getByRole('button', { name: 'Area (ha)' }).click();
  const areas = await page.locator('tbody tr td:nth-child(2)').allTextContents();
  expect(Number(areas[0])).toBeGreaterThanOrEqual(Number(areas[1]));
  await page.locator('.tank-table-button').first().click();
  await expect(page.getByTestId('inspector-title')).not.toHaveText('DISTRICT OVERVIEW');
});

test('fragile threshold, class isolation and non-responsive behavior', async ({ page }) => {
  await page.locator('.class-tile').filter({ has: page.getByRole('heading', { name: 'Threshold fragile', exact: true }) }).click();
  await expect(page.locator('.tank-dot')).toHaveCount(284);
  await page.getByRole('textbox', { name: 'Search tanks' }).fill('tank_0002');
  await page.locator('.tank-dot').click();
  await range(page, 'Scenario rainfall', 0);
  await expect(page.getByTestId('fill-percent')).toHaveText('3%');
  await range(page, 'Scenario rainfall', 500);
  await expect(page.getByTestId('fill-percent')).toHaveText('100%');
  await page.locator('.class-tile').filter({ has: page.getByRole('heading', { name: 'Non-responsive', exact: true }) }).click();
  await expect(page.locator('.tank-dot')).toHaveCount(59);
  await page.getByRole('button', { name: 'Select random tank' }).click();
  await range(page, 'Scenario rainfall', 0);
  await expect(page.getByTestId('fill-percent')).toHaveText('3%');
  await range(page, 'Scenario rainfall', 500);
  await expect(page.getByTestId('fill-percent')).toHaveText('3%');
  await page.locator('.map-filters').getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.tank-dot')).toHaveCount(470);
});

test('weather presets, auto seasonal cycle, playback and scenario reset', async ({ page }) => {
  await page.getByRole('button', { name: 'Dry', exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-weather', 'dry');
  await expect(page.getByRole('slider', { name: 'Scenario rainfall', exact: true })).toHaveValue('0');
  const dryCount = parseInt(await page.getByTestId('filling-count').innerText());
  await page.getByRole('button', { name: 'Peak storm', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Scenario rainfall', exact: true })).toHaveValue('380');
  expect(parseInt(await page.getByTestId('filling-count').innerText())).toBeGreaterThan(dryCount);
  await range(page, 'Observation month', 5);
  await expect(page.locator('.app')).toHaveAttribute('data-weather', 'pre');
  await expect(page.getByRole('button', { name: 'AUTO', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await range(page, 'Observation month', 7);
  await expect(page.locator('.app')).toHaveAttribute('data-weather', 'onset');
  await range(page, 'Observation month', 8);
  await expect(page.locator('.app')).toHaveAttribute('data-weather', 'storm');
  await range(page, 'Observation month', 10);
  await expect(page.locator('.app')).toHaveAttribute('data-weather', 'recession');
  await range(page, 'Observation month', 119);
  await page.getByRole('button', { name: 'Play timeline' }).click();
  await expect(page.getByRole('slider', { name: 'Observation month' })).not.toHaveValue('119');
  await page.getByRole('button', { name: 'Pause timeline' }).click();
  await range(page, 'Scenario rainfall', 410);
  await expect(page.getByText('SCENARIO OVERRIDE', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'RESET TO MONTH' }).click();
  await expect(page.getByRole('button', { name: 'MONTHLY DEMO SERIES' })).toBeDisabled();
});

test('CSV reflects filtered scenario and inspector charts are explorable', async ({ page }) => {
  await page.locator('.class-tile').filter({ has: page.getByRole('heading', { name: 'Resilient', exact: true }) }).click();
  await expect(page.locator('.tank-dot')).toHaveCount(5);
  await range(page, 'Scenario rainfall', 321);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export data' }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  let csv = ''; for await (const chunk of stream!) csv += chunk.toString();
  const rows = csv.trim().split('\n');
  expect(rows.length).toBe(6);
  expect(rows[0]).toContain('scenario_active');
  for (const row of rows.slice(1)) { expect(row).toContain(',resilient,'); expect(row).toContain(',321,'); expect(row).toMatch(/,true$/); }
  await page.getByRole('button', { name: '24 months', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Full record', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Full record', exact: true }).click();
  await page.getByRole('button', { name: 'Linear', exact: true }).click();
  await expect(page.getByRole('img', { name: /Conceptual linear model/ })).toBeVisible();
  await page.getByRole('button', { name: 'Hinge', exact: true }).click();
  await range(page, 'Conceptual model rainfall', 100);
  await expect(page.getByRole('img', { name: /Conceptual hinge model: 100 millimeters yields 0 percent area/ })).toBeVisible();
  await page.getByText('Limitations, stated plainly', { exact: true }).click();
  await expect(page.getByText(/No bootstrap confidence intervals/)).toBeVisible();
});

test('responsive layout, offline assets and keyboard navigation', async ({ page, context }) => {
  await expect(page.locator('.app')).toHaveClass(/motion-paused/);
  const widths = [320, 390, 768, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const bounds = await page.locator('.control-room').boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  }
  await page.locator('.tank-dot').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inspector-title')).toHaveText('TANK_0002');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('inspector-title')).toHaveText('TANK_0004');
  await context.setOffline(true);
  await range(page, 'Scenario rainfall', 250);
  await expect(page.getByRole('slider', { name: 'Scenario rainfall', exact: true })).toHaveValue('250');
  await context.setOffline(false);
});

test('graphics initialize without browser errors and controls survive context loss', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.storm-scene canvas')).toHaveCount(1);
  await page.waitForTimeout(1600);
  expect(errors).toEqual([]);
  await page.locator('.storm-scene canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2'); gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.locator('.scene-fallback')).toHaveCount(1);
  await page.getByRole('button', { name: 'Dry', exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-weather', 'dry');
  await expect(page.locator('.tank-dot')).toHaveCount(470);
});
