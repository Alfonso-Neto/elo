export type OperationsErrorCode =
  | 'validation'
  | 'authentication_required'
  | 'membership_required'
  | 'ambiguous_workspace'
  | 'record_unavailable'
  | 'schedule_conflict'
  | 'idempotency_conflict'
  | 'rate_limited'
  | 'service_unavailable'

const messages: Record<OperationsErrorCode, string> = {
  validation: 'Revise os dados e tente novamente.',
  authentication_required: 'Entre novamente para continuar.',
  membership_required: 'É necessário um vínculo ativo para continuar.',
  ambiguous_workspace: 'Há mais de um vínculo ativo. O suporte precisa revisar esse acesso.',
  record_unavailable: 'Este registro não está disponível para esta conta.',
  schedule_conflict: 'Este horário não está mais disponível. Atualize a agenda e tente novamente.',
  idempotency_conflict: 'Esta solicitação já foi usada com dados diferentes. Tente novamente.',
  rate_limited: 'Muitas ações em pouco tempo. Aguarde alguns minutos e tente novamente.',
  service_unavailable: 'Não foi possível concluir a solicitação agora. Tente novamente.',
}

export class OperationsDomainError extends Error {
  readonly code: OperationsErrorCode
  readonly fieldErrors?: Readonly<Record<string, string>>

  constructor(
    code: OperationsErrorCode,
    options?: { fieldErrors?: Readonly<Record<string, string>> },
  ) {
    super(messages[code])
    this.name = 'OperationsDomainError'
    this.code = code
    this.fieldErrors = options?.fieldErrors
  }
}

type BackendErrorLike = { code?: unknown; message?: unknown }

export function toOperationsDomainError(error: unknown): OperationsDomainError {
  if (error instanceof OperationsDomainError) return error

  const candidate = error && typeof error === 'object' ? error as BackendErrorLike : {}
  const backendCode = typeof candidate.code === 'string' ? candidate.code : ''
  const backendMessage = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''

  if (backendCode === '21000') return new OperationsDomainError('ambiguous_workspace')
  if (backendCode === '42501' || backendCode === 'PGRST301' || backendCode === 'PGRST303') {
    return new OperationsDomainError('record_unavailable')
  }
  if (backendCode === 'P0001') return new OperationsDomainError('schedule_conflict')
  if (backendCode === '54000') return new OperationsDomainError('rate_limited')
  if (
    (backendCode === '22023' || backendCode === '23505')
    && backendMessage.includes('idempotency')
  ) return new OperationsDomainError('idempotency_conflict')
  if (backendCode === '22023') return new OperationsDomainError('validation')

  return new OperationsDomainError('service_unavailable')
}
