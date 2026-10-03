import { expect, test } from '@playwright/test'
import { demoControls, openControlCenter } from './control-center'

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

  // Speed up until the first waypoints are reached: progress derives from route execution.
  const demo = await demoControls(page)
  await demo.getByRole('radio', { name: '8×' }).click()
  await expect(status).not.toContainText(/^0%/, { timeout: 60_000 })
})
