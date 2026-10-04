import { expect, test } from '@playwright/test'

test('phone shows one surface at a time', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/control-center')
  await page.locator('[data-map-ready="true"]').waitFor({ state: 'attached', timeout: 60_000 })
  const fleet = page.getByRole('complementary', { name: 'Fleet' })
  const inspector = page.getByRole('complementary', { name: 'UAV inspector' })
  const showFleet = page.getByRole('button', { name: 'Show fleet panel' })

  // Map first: fleet collapsed to its button.
  await expect(showFleet).toBeVisible()
  await expect(fleet).toBeHidden()

  await showFleet.click()
  await expect(fleet).toBeVisible()
  expect((await fleet.boundingBox())?.width).toBeGreaterThan(340)

  await fleet.getByRole('button', { name: /^UAV-03 / }).click()
  await expect(inspector).toBeVisible()
  await expect(fleet).toBeHidden()
  expect((await inspector.boundingBox())?.width).toBeGreaterThan(340)

  await inspector.getByRole('button', { name: /expand/i }).click()
  await expect(page.getByLabel('Video focus')).toBeVisible()
  await expect(inspector).toBeHidden()

  await page.keyboard.press('Escape')
  await expect(inspector).toBeVisible()
  await inspector.getByRole('button', { name: 'Close inspector' }).click()
  await expect(fleet).toBeVisible()
})
