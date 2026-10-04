import { expect, test } from '@playwright/test'
import { openControlCenter } from './control-center'

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
  const map = page.getByRole('main', { name: 'Operational map' })
  const box = await map.boundingBox()
  if (!box) throw new Error('map not visible')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  for (const [dx, dy] of [
    [-150, 100],
    [0, -120],
    [150, 100],
  ] as const) {
    await page.mouse.click(cx + dx, cy + dy)
  }
  await expect(planning.getByText('3 points')).toBeVisible()

  await planning.getByRole('button', { name: 'Generate plan' }).click()
  await expect(planning.getByRole('list', { name: 'Routes' }).getByRole('listitem')).toHaveCount(3)
  await planning.getByRole('button', { name: 'Launch mission' }).click()
  await expect(planning).toBeHidden()

  await expect(page.locator('header').first()).toContainText('Patrol')
  await expect(page.getByLabel('Mission status')).toContainText('3 UAVs patrolling')
})
