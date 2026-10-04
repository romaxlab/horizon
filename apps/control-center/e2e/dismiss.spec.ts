import { expect, test } from '@playwright/test'
import { fleetRow, openControlCenter } from './control-center'

test('Escape closes one layer at a time, topmost first, and never from a text field', async ({
  page,
}) => {
  await openControlCenter(page)
  await fleetRow(page, 'UAV-03').click()
  const inspector = page.getByRole('complementary', { name: 'UAV inspector' })
  await expect(inspector).toBeVisible()

  // In the fleet search, Escape only leaves the field.
  const search = page.getByRole('complementary', { name: 'Fleet' }).getByRole('searchbox')
  await search.fill('UAV')
  await search.press('Escape')
  await expect(search).not.toBeFocused()
  await expect(inspector).toBeVisible()

  // A popover is above the inspector: focus moves into it, Escape closes it and returns focus.
  const demoButton = page.getByRole('button', { name: 'Demo', exact: true })
  await demoButton.click()
  const demo = page.getByLabel('Demo controls', { exact: true })
  await expect(demo).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(demo).toBeHidden()
  await expect(demoButton).toBeFocused()
  await expect(inspector).toBeVisible()

  // The video focus view is above the inspector too.
  await inspector.getByRole('button', { name: /expand/i }).click()
  const focus = page.getByLabel('Video focus')
  await expect(focus).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(focus).toBeHidden()
  await expect(inspector).toBeVisible()

  // Nothing else on top: Escape closes the inspector.
  await page.keyboard.press('Escape')
  await expect(inspector).toBeHidden()
})
