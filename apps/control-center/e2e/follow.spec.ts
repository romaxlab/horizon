import { expect, test } from '@playwright/test'
import { fleetRow, openControlCenter } from './control-center'

test('follow is a UAV action: moves with the selection, stops on reset or close', async ({
  page,
}) => {
  await openControlCenter(page)
  await fleetRow(page, 'UAV-03').click()
  const inspector = page.getByRole('complementary', { name: 'UAV inspector' })
  const follow = inspector.getByRole('button', { name: 'Follow', exact: true })

  await follow.click()
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Reset view' }).click()
  await expect(follow).toHaveAttribute('aria-pressed', 'false')

  // Following moves to another selected UAV; closing the inspector stops it.
  await follow.click()
  await fleetRow(page, 'UAV-05').click()
  await expect(inspector.getByRole('heading', { name: 'UAV-05' })).toBeVisible()
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await inspector.getByRole('button', { name: 'Close inspector' }).click()
  await fleetRow(page, 'UAV-05').click()
  await expect(follow).toHaveAttribute('aria-pressed', 'false')
})
