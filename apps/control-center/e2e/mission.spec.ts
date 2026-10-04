import { expect, test } from '@playwright/test'
import { openControlCenter } from './control-center'

test('create an Area Scan mission, generate the plan, launch and observe execution', async ({
  page,
}) => {
  // The full plan → launch → progress flow is the longest scenario (slow WebGL on CI).
  test.setTimeout(180_000)
  await openControlCenter(page)

  await page.getByRole('button', { name: 'New Mission' }).click()
  const planning = page.getByRole('complementary', { name: 'Mission planning' })
  await planning.getByLabel('Mission name').fill('E2E Scan')
  await planning.getByRole('button', { name: 'Continue' }).click()

  // Draw a square scan area around the map center.
  const map = page.getByRole('main', { name: 'Operational map' })
  const box = await map.boundingBox()
  if (!box) throw new Error('map not visible')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  for (const [dx, dy] of [
    [-160, -110],
    [160, -110],
    [160, 110],
    [-160, 110],
  ] as const) {
    await page.mouse.click(cx + dx, cy + dy)
  }
  await expect(planning.getByText('4 points')).toBeVisible()

  await planning.getByRole('button', { name: 'Generate plan' }).click()
  await expect(planning.getByText('Waypoints')).toBeVisible()
  await expect(planning.getByRole('list', { name: 'Routes' }).getByRole('listitem')).toHaveCount(6)

  await planning.getByRole('button', { name: 'Launch mission' }).click()
  await expect(planning).toBeHidden()

  // Execution is visible: header names the mission, status shows scanning UAVs and progress.
  await expect(page.locator('header').first()).toContainText('E2E Scan')
  const status = page.getByLabel('Mission status')
  await expect(status).toContainText('6 UAVs scanning')
  await expect(status.getByRole('progressbar', { name: 'Mission progress' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New Mission' })).toBeDisabled()

  // The mission UAVs are flying: Active in the fleet, moving and climbing in the inspector.
  // (Waypoint-based progress itself is covered by unit tests; it needs minutes of flight.)
  await expect(page.getByRole('radio', { name: /^Active/ })).toHaveText('Active 6')
  await page.getByRole('radio', { name: /^Active/ }).click()
  await page
    .getByRole('complementary', { name: 'Fleet' })
    .getByRole('button', { name: /^UAV-/ })
    .first()
    .click()
  const inspector = page.getByRole('complementary', { name: 'UAV inspector' })
  await expect(inspector.getByText('E2E Scan', { exact: true })).toBeVisible()
  await expect(inspector.getByText(/^ALT [1-9]\d* m$/)).toBeVisible({ timeout: 30_000 })
  await expect(inspector.getByText(/^SPD (?!0\.0)[\d.]+ m\/s$/)).toBeVisible({ timeout: 30_000 })
})
