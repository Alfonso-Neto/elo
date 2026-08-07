import { SignalDomainError } from './errors'

export type SecureUuidSource = Pick<Crypto, 'randomUUID'>

const prefixPattern = /^[A-Za-z][A-Za-z0-9._-]{0,31}$/
const randomUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/

export function createIdempotencyKey(
  prefix: string,
  source: SecureUuidSource | null | undefined = globalThis.crypto,
) {
  if (!prefixPattern.test(prefix)) {
    throw new SignalDomainError('validation', { fieldErrors: { idempotency: 'Prefixo interno inválido.' } })
  }
  if (!source || typeof source.randomUUID !== 'function') {
    throw new SignalDomainError('service_unavailable')
  }

  const randomUuid = source.randomUUID()
  if (!randomUuidPattern.test(randomUuid)) throw new SignalDomainError('service_unavailable')
  const key = `${prefix}:${randomUuid}`
  if (!idempotencyKeyPattern.test(key)) throw new SignalDomainError('service_unavailable')
  return key
}
