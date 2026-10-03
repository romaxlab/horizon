import { expect, type Locator, type Page } from '@playwright/test'

/** Opens the Control Center and waits until the fleet is live. */
export async function openControlCenter(page: Page) {
  await page.goto('/control-center')
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await expect(fleetRow(page, 'UAV-01')).toBeVisible()
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
