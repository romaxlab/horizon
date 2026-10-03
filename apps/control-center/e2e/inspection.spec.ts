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
    await expect(inspector.getByText(metric, { exact: true })).toBeVisible()
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
