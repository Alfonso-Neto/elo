import type { Role } from '../types'

export type RegistrationValues = {
  role: Role | null
  displayName: string
  email: string
  password: string
  confirmation: string
  crefNumber: string
  crefState: string
  studioName: string
  acceptedTerms: boolean
}

export type RegistrationErrors = Partial<Record<keyof RegistrationValues, string>>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string) {
  return emailPattern.test(value.trim())
}

export function validateRegistration(values: RegistrationValues): RegistrationErrors {
  const errors: RegistrationErrors = {}
  if (!values.role) errors.role = 'Escolha como você vai usar o Elo.'
  if (values.displayName.trim().length < 2) errors.displayName = 'Informe seu nome completo.'
  if (!isValidEmail(values.email)) errors.email = 'Informe um e-mail válido.'
  if (values.password.length < 12) errors.password = 'A senha precisa ter pelo menos 12 caracteres.'
  if (values.confirmation !== values.password) errors.confirmation = 'As senhas precisam ser iguais.'
  if (values.role === 'trainer') {
    if (values.crefNumber.replace(/\s/g, '').length < 4) errors.crefNumber = 'Informe um CREF válido.'
    if (!/^[A-Z]{2}$/.test(values.crefState)) errors.crefState = 'Escolha o estado do CREF.'
  }
  if (!values.acceptedTerms) errors.acceptedTerms = 'Você precisa aceitar os termos para continuar.'
  return errors
}

export function validatePasswordReset(password: string, confirmation: string) {
  const errors: { password?: string; confirmation?: string } = {}
  if (password.length < 12) errors.password = 'A senha precisa ter pelo menos 12 caracteres.'
  if (confirmation !== password) errors.confirmation = 'As senhas precisam ser iguais.'
  return errors
}
