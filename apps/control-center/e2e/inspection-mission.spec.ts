import { expect, test } from '@playwright/test'
import { openControlCenter } from './control-center'

test('create a Point Inspection: place the target, plan the orbit and launch', async ({ page }) => {
  test.setTimeout(180_000)
  await openControlCenter(page)

  await page.getByRole('button', { name: 'New Mission' }).click()
  const planning = page.getByRole('complementary', { name: 'Mission planning' })
  await planning.getByRole('radio', { name: 'Inspection' }).click()
  await expect(planning.getByLabel('Mission name')).toHaveValue('Point Inspection')
  await planning.getByLabel('UAVs').fill('2')
  await planning.getByLabel('Orbits').fill('2')
  await planning.getByLabel('Radius (m)').fill('200')
  await planning.getByRole('button', { name: 'Continue' }).click()

  // The second click moves the target instead of adding a point.
  const map = page.getByRole('main', { name: 'Operational map' })
  const box = await map.boundingBox()
  if (!box) throw new Error('map not visible')
  await page.mouse.click(box.x + box.width / 2 - 80, box.y + box.height / 2)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(planning.getByText('Target set')).toBeVisible()

  await planning.getByRole('button', { name: 'Generate plan' }).click()
  await expect(planning.getByRole('list', { name: 'Routes' }).getByRole('listitem')).toHaveCount(2)
  await planning.getByRole('button', { name: 'Launch mission' }).click()
  await expect(planning).toBeHidden()
  await expect(page.getByLabel('Mission status')).toContainText('2 UAVs inspecting')
})
