import { expect, test, type Page } from '@playwright/test'

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
