import { test, expect } from '@playwright/test'
import { signUp } from './helpers'

// PRD2 §13 scenario 1: a new user joins a cohort via the dashboard CTA (which
// first explains what groups are and asks to confirm), is assigned, and sees the
// members list.
test('new user joins a cohort from the dashboard CTA and sees themselves as a member', async ({
  page,
}) => {
  test.slow() // first assignCohort call may cold-start the functions emulator
  await signUp(page)

  // A learner with no cohort sees a "Join a group" call-to-action.
  const cta = page.getByTestId('group-cta')
  await expect(cta).toContainText('Join a group')
  await cta.click()

  // The dialog explains groups before joining; confirm to be matched.
  await expect(page.getByTestId('join-group-dialog')).toBeVisible()
  await expect(page.getByText('Learn with a group')).toBeVisible()
  await page.getByTestId('confirm-join').click()

  // Lands on the Group tab with a named cohort and the caller as a member.
  await expect(page).toHaveURL(/\/group$/)
  await expect(page.getByRole('heading', { name: /^The \S+ \S+$/ })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText('(you)')).toBeVisible()

  // The Group tab's sections are present (peer presence now lives on the course path).
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /This week’s meeting/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Meeting outline' })).toBeVisible()

  // Back on the dashboard, the CTA now reads "View your group".
  await page.goto('/')
  await expect(page.getByTestId('group-cta')).toContainText('View your group')
})
