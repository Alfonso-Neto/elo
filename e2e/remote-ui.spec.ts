import { expect, test, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

type PilotRole = 'trainer' | 'student'

const pilot = {
  baseUrl: process.env.PILOT_BASE_URL,
  trainer: {
    email: process.env.PILOT_TRAINER_EMAIL,
    password: process.env.PILOT_TRAINER_PASSWORD,
  },
  student: {
    email: process.env.PILOT_STUDENT_EMAIL,
    password: process.env.PILOT_STUDENT_PASSWORD,
  },
}

const requiredEnvironment = [
  'PILOT_BASE_URL',
  'PILOT_TRAINER_EMAIL',
  'PILOT_TRAINER_PASSWORD',
  'PILOT_STUDENT_EMAIL',
  'PILOT_STUDENT_PASSWORD',
] as const

const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]?.trim())
if (missingEnvironment.length > 0) {
  throw new Error(`Remote UI acceptance is missing required variables: ${missingEnvironment.join(', ')}`)
}

async function signIn(page: Page, role: PilotRole) {
  const account = pilot[role]
  await page.goto('/#/entrar')
  await page.getByLabel(/^E-mail$/i).fill(account.email!)
  await page.getByLabel(/^Senha$/i).fill(account.password!)
  await page.getByRole('button', { name: /^Entrar$/i }).last().click()

  await expect(page.getByRole('navigation', { name: /Navegação (principal|móvel)/i }).first()).toBeVisible({ timeout: 20_000 })
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(1)
}

const roleExpectations = {
  trainer: { own: /Visão geral|Alunos/i, forbidden: /^Hoje$/i },
  student: { own: /^Hoje$|^Treino$/i, forbidden: /Visão geral/i },
} satisfies Record<PilotRole, { own: RegExp; forbidden: RegExp }>

for (const role of ['trainer', 'student'] as const) {
  for (const width of [390, 768]) {
    test(`${role} navigation is role-specific and responsive at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await signIn(page, role)

      const navigation = page.getByRole('navigation', { name: /Navegação (principal|móvel)/i }).filter({ visible: true }).first()
      await expect(navigation.getByRole('button', { name: roleExpectations[role].own }).first()).toBeVisible()
      await expect(navigation.getByRole('button', { name: roleExpectations[role].forbidden })).toHaveCount(0)
      await expectNoHorizontalOverflow(page)

      await page.keyboard.press('Tab')
      await expect(page.locator(':focus-visible')).toHaveCount(1)
      await expect(page.locator(':focus-visible')).toHaveCSS('outline-style', 'solid')
    })
  }
}

test('deployed entry honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/entrar')
  await expect(page.locator('.auth-panel')).toHaveCSS('animation-name', 'none')
})

const featureRoutes = {
  trainer: ['dashboard', 'students', 'copilot', 'builder', 'schedule', 'messages', 'forms'],
  student: ['today', 'workout', 'assistant', 'nutrition', 'schedule', 'messages', 'student-form'],
} satisfies Record<PilotRole, string[]>

for (const role of ['trainer', 'student'] as const) {
  test(`${role} can open every primary feature without a runtime failure`, async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text())
    })

    await page.setViewportSize({ width: 1280, height: 900 })
    await signIn(page, role)

    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 })
      for (const route of featureRoutes[role]) {
        await page.evaluate((target) => { window.location.hash = `#/${target}` }, route)
        await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#/${route}`)
        await expect(page.locator('main#main-content')).toBeVisible()
        await expect(page.locator('.app-fatal')).toHaveCount(0)
        await expect(page.locator('.route-loading')).toHaveCount(0, { timeout: 20_000 })
        await expectNoHorizontalOverflow(page)
      }
    }

    expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
  })
}

test('trainer can open and dismiss the main read-only drawers with restored focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await signIn(page, 'trainer')

  const notifications = page.getByRole('button', { name: /Abrir atualizações/i })
  await notifications.click()
  await expect(page.getByRole('dialog', { name: 'O que mudou' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(notifications).toBeFocused()

  const navigation = page.getByRole('navigation', { name: 'Navegação principal' })
  await navigation.getByRole('button', { name: 'Alunos', exact: true }).click()
  const invite = page.getByRole('button', { name: /Convidar aluno/i }).first()
  await invite.click()
  await expect(page.getByRole('dialog', { name: /Convide um aluno/i })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(invite).toBeFocused()

  await navigation.getByRole('button', { name: 'Agenda', exact: true }).click()
  const openSlot = page.getByRole('button', { name: /Abrir horário/i }).first()
  await openSlot.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(openSlot).toBeFocused()
})

test('mobile overflow navigation exposes every secondary destination', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, 'student')

  const more = page.getByRole('navigation', { name: 'Navegação móvel' }).getByRole('button', { name: 'Mais' })
  await more.click()
  const dialog = page.getByRole('dialog', { name: 'Mais no Elo' })
  await expect(dialog).toBeVisible()
  for (const label of ['Agenda', 'Conversas', 'Anamnese', 'Sair da conta']) {
    await expect(dialog.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
})
