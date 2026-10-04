import { expect, test } from '@playwright/test'
import { fleetRow, openControlCenter } from './control-center'

test('the inspector collapses to a compact card and stays collapsed across selections', async ({
  page,
}) => {
  await openControlCenter(page)
  await fleetRow(page, 'UAV-03').click()
  const inspector = page.getByRole('complementary', { name: 'UAV inspector' })
  const follow = inspector.getByRole('button', { name: 'Follow', exact: true })
  const collapse = inspector.getByRole('button', { name: 'Collapse inspector' })
  const expand = inspector.getByRole('button', { name: 'Expand inspector' })
  const fullHeight = (await inspector.boundingBox())?.height ?? 0

  await follow.click()
  await collapse.click()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(inspector.getByText('Battery', { exact: true }).first()).toBeHidden()
  expect((await inspector.boundingBox())?.height ?? 0).toBeLessThan(Math.min(120, fullHeight))
  // Following and the key readings stay in reach while collapsed.
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector.getByText(/ m\/s/)).toBeVisible()

  await fleetRow(page, 'UAV-05').click()
  await expect(inspector.getByRole('heading', { name: 'UAV-05' })).toBeVisible()
  await expect(expand).toBeVisible()

  await expand.click()
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await expect(inspector.getByText('Battery', { exact: true }).first()).toBeVisible()
})

test('on phones a collapsed inspector is a bar below the map', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/control-center')
  await page.locator('[data-map-ready="true"]').waitFor({ state: 'attached', timeout: 60_000 })
  const inspector = page.getByRole('complementary', { name: 'UAV inspector' })

  await page.getByRole('button', { name: 'Show fleet panel' }).click()
  await page
    .getByRole('complementary', { name: 'Fleet' })
    .getByRole('button', { name: /^UAV-03 / })
    .click()
  await inspector.getByRole('button', { name: 'Collapse inspector' }).click()

  // The map is back (the fleet list stays hidden); the inspector is a full-width bar below it.
  await expect(page.getByRole('complementary', { name: 'Fleet' })).toBeHidden()
  const bar = await inspector.boundingBox()
  expect(bar?.width).toBeGreaterThan(340)
  expect(bar?.height).toBeLessThan(120)
  expect(bar?.y).toBeGreaterThan(844 / 2)

  // Tapping the readings line expands the inspector again.
  await inspector.getByRole('button', { name: / m\/s$/ }).click()
  await expect(inspector.getByRole('button', { name: 'Collapse inspector' })).toBeVisible()
  await expect(inspector.getByText('Battery', { exact: true }).first()).toBeVisible()
})
