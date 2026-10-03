import { expect, test } from '@playwright/test'
import { fleetRow, openControlCenter } from './control-center'

test('select a UAV: inspector opens with telemetry and the simulated video feed', async ({
  page,
}) => {
  await openControlCenter(page)

  const row = fleetRow(page, 'UAV-03')
  await row.click()
  await expect(row).toHaveAttribute('aria-pressed', 'true')

  const inspector = page.getByRole('complementary', { name: 'UAV inspector' })
  await expect(inspector.getByRole('heading', { name: 'UAV-03' })).toBeVisible()
  for (const metric of ['Battery', 'Altitude', 'Speed', 'Heading', 'Signal', 'GPS', 'Updated']) {
    // Battery, Altitude and Speed also caption the trend charts.
    await expect(inspector.getByText(metric, { exact: true }).first()).toBeVisible()
  }

  const feed = inspector.getByRole('figure', { name: /UAV-03 camera feed/ })
  await expect(feed).toBeVisible()
  await expect(feed.getByText('SIMULATED FEED')).toBeVisible()
  await expect(feed.getByText(/^ALT \d+ m$/)).toBeVisible()

  // Closing returns to the map; the shared selection is cleared.
  await page.keyboard.press('Escape')
  await expect(inspector).toBeHidden()
  await expect(row).toHaveAttribute('aria-pressed', 'false')
})

test('fleet list is one Tab stop with arrow-key navigation', async ({ page }) => {
  await openControlCenter(page)

  await fleetRow(page, 'UAV-01').focus()
  await page.keyboard.press('ArrowDown')
  await expect(fleetRow(page, 'UAV-02')).toBeFocused()
  await page.keyboard.press('End')
  await expect(fleetRow(page, 'UAV-24')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'UAV-24' })).toBeVisible()

  // Leaving the list with Tab skips the remaining rows.
  await fleetRow(page, 'UAV-24').focus()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('radio', { name: /^All/ })).toBeFocused()
})
