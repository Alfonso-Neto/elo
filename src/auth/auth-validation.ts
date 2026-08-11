import type { Role } from '../types'
import { hasUnsafeDisplayCharacters } from '../lib/safe-text'

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
  const normalized = value.trim()
  return normalized.length <= 320
    && !hasUnsafeDisplayCharacters(normalized)
    && emailPattern.test(normalized)
}

export function validateRegistration(values: RegistrationValues): RegistrationErrors {
  const errors: RegistrationErrors = {}
  const displayName = values.displayName.trim()
  const studioName = values.studioName.trim()
  if (!values.role) errors.role = 'Escolha como você vai usar o Elo.'
  if (displayName.length < 2 || displayName.length > 80 || hasUnsafeDisplayCharacters(displayName)) {
    errors.displayName = 'Informe um nome válido com 2 a 80 caracteres.'
  }
  if (!isValidEmail(values.email)) errors.email = 'Informe um e-mail válido.'
  if (values.password.length < 12) errors.password = 'A senha precisa ter pelo menos 12 caracteres.'
  if (values.confirmation !== values.password) errors.confirmation = 'As senhas precisam ser iguais.'
  if (values.role === 'trainer') {
    if (!/^[0-9A-Z/-]{4,24}$/.test(values.crefNumber.trim().toUpperCase())) errors.crefNumber = 'Informe um CREF válido.'
    if (!/^[A-Z]{2}$/.test(values.crefState)) errors.crefState = 'Escolha o estado do CREF.'
    if (studioName && (studioName.length < 2 || studioName.length > 80 || hasUnsafeDisplayCharacters(studioName))) {
      errors.studioName = 'Use de 2 a 80 caracteres no nome do espaço.'
    }
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
