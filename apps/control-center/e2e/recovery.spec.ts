import { expect, test } from '@playwright/test'
import { demoControls, fleetRow, openControlCenter } from './control-center'

test('connection loss: last known state goes stale, reconnect restores current state', async ({
  page,
}) => {
  await openControlCenter(page)
  const header = page.locator('header').first()
  const demo = await demoControls(page)

  await demo.getByRole('button', { name: 'Network outage' }).click()
  await expect(header).toContainText('Reconnecting')
  await expect(page.getByLabel('Alerts', { exact: true })).toContainText('Connection lost')

  // Without data UAVs keep their last known state but are marked stale (5 s threshold).
  await expect(fleetRow(page, 'UAV-01')).toContainText('Stale', { timeout: 10_000 })

  await demo.getByRole('button', { name: 'Restore all' }).click()
  // Reconnect with backoff, fresh snapshot, reconcile → live and fresh again.
  await expect(header).toContainText('Live', { timeout: 20_000 })
  await expect(fleetRow(page, 'UAV-01')).toContainText('Standby')
  await expect(page.getByRole('radio', { name: /^Alerts/ })).toHaveText('Alerts 0')
  await expect(page.getByLabel('Alerts', { exact: true })).not.toContainText('Connection lost')
})
