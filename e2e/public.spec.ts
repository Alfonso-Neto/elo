import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(1)
}

test('fails closed and removes legacy demo access parameters', async ({ page }) => {
  await page.goto('/?demo=1&role=trainer#/dashboard')

  await expect(page.getByRole('heading', { name: /Entre no seu Elo/i })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /Ambiente sem conexão de autenticação/i })).toBeVisible()
  await expect(page.getByRole('navigation', { name: /Navegação principal/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Explorar demonstração|Alternar perfil/i })).toHaveCount(0)
  await expect.poll(() => new URL(page.url()).search).toBe('')
  await expect(page).toHaveURL(/#\/entrar$/)
})

for (const width of [390, 768]) {
  test(`public entry has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/#/cadastro')
    await expect(page.getByRole('heading', { name: /Como você chega ao Elo/i })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
}

test('keyboard focus starts with a visible skip link and reaches account navigation', async ({ page }) => {
  await page.goto('/#/entrar')

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: /Pular para o conteúdo/i })
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeInViewport()

  await page.keyboard.press('Tab')
  const signInTab = page.getByRole('button', { name: /^Entrar$/ }).first()
  await expect(signInTab).toBeFocused()
  await expect(signInTab).toHaveCSS('outline-style', 'solid')
})

test('prefers-reduced-motion disables public entry animation and transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/entrar')

  await expect(page.locator('.auth-panel')).toHaveCSS('animation-name', 'none')
  const transitionSeconds = await page.getByRole('link', { name: /Pular para o conteúdo/i }).evaluate((element) => {
    const duration = getComputedStyle(element).transitionDuration
    return Math.max(...duration.split(',').map((value) => Number.parseFloat(value) || 0))
  })
  expect(transitionSeconds).toBeLessThanOrEqual(0.001)
})
