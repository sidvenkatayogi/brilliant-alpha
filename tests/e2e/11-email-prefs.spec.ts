import { test, expect } from '@playwright/test'
import { signUp } from './helpers'

test('email quiz preference toggles and persists after reload', async ({ page }) => {
  await signUp(page)

  // The opt-in lives on the home page (floating, bottom-right) — no navigation needed.
  const toggle = page.getByRole('switch', { name: /daily probability quiz/i })
  await expect(toggle).toBeVisible()

  // Default: off
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  // Toggle on — must reflect immediately (no reload required).
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  // Reload and verify persistence
  await page.reload()
  const toggleAfterReload = page.getByRole('switch', { name: /daily probability quiz/i })
  await expect(toggleAfterReload).toHaveAttribute('aria-checked', 'true')

  // Toggle off — reflects immediately
  await toggleAfterReload.click()
  await expect(toggleAfterReload).toHaveAttribute('aria-checked', 'false')

  // Reload and verify
  await page.reload()
  const toggleFinal = page.getByRole('switch', { name: /daily probability quiz/i })
  await expect(toggleFinal).toHaveAttribute('aria-checked', 'false')
})
