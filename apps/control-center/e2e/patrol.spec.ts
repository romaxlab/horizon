import { expect, test } from '@playwright/test'
import { drawOnMap, openControlCenter } from './control-center'

test('create a Patrol: pick the type, draw the loop, plan and launch', async ({ page }) => {
  test.setTimeout(180_000)
  await openControlCenter(page)

  await page.getByRole('button', { name: 'New Mission' }).click()
  const planning = page.getByRole('complementary', { name: 'Mission planning' })
  await planning.getByRole('radio', { name: 'Patrol' }).click()
  await expect(planning.getByLabel('Mission name')).toHaveValue('Patrol')
  await planning.getByLabel('UAVs').fill('3')
  await planning.getByLabel('Laps').fill('2')
  await planning.getByRole('button', { name: 'Continue' }).click()

  // A triangle loop around the map center.
  const click = await drawOnMap(page)
  for (const [dx, dy] of [
    [-150, 100],
    [0, -120],
    [150, 100],
  ] as const) {
    await click(dx, dy)
  }
  await expect(planning.getByText('3 points')).toBeVisible()

  await planning.getByRole('button', { name: 'Generate plan' }).click()
  await expect(planning.getByRole('list', { name: 'Routes' }).getByRole('listitem')).toHaveCount(3)
  await planning.getByRole('button', { name: 'Launch mission' }).click()
  await expect(planning).toBeHidden()

  await expect(page.locator('header').first()).toContainText('Patrol')
  await expect(page.getByLabel('Mission status')).toContainText('3 en route')
})
