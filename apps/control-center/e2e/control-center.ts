import { expect, type Locator, type Page } from '@playwright/test'

/** Opens the Control Center and waits until the fleet is live and the 3D map is interactive. */
export async function openControlCenter(page: Page) {
  await page.goto('/control-center')
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await expect(fleetRow(page, 'UAV-01')).toBeVisible()
  // Cesium loads lazily and is slow on CPU-rendered CI runners; map clicks need the scene.
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 60_000 })
}

export const fleetRow = (page: Page, name: string): Locator =>
  page.getByRole('complementary', { name: 'Fleet' }).getByRole('button', {
    name: new RegExp(`^${name} `),
  })

/** Opens the demo panel; commands go to the simulator, as an operator demo would. */
export async function demoControls(page: Page): Promise<Locator> {
  const panel = page.getByLabel('Demo controls', { exact: true })
  if (!(await panel.isVisible())) await page.getByRole('button', { name: 'Demo' }).click()
  await expect(panel).toBeVisible()
  return panel
}

/**
 * Clicks on the map canvas at offsets from its center, once the scene is in drawing mode.
 * Clicking the canvas element (not raw coordinates) makes Playwright verify the canvas receives
 * the click and name any element covering it.
 */
export async function drawOnMap(page: Page) {
  await expect(page.locator('[data-drawing="true"]')).toBeAttached()
  const canvas = page.getByRole('main', { name: 'Operational map' }).locator('canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('map canvas not visible')
  return (dx: number, dy: number) =>
    canvas.click({ position: { x: box.width / 2 + dx, y: box.height / 2 + dy } })
}
