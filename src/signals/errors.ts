export type SignalErrorCode =
  | 'validation'
  | 'authentication_required'
  | 'student_workspace_required'
  | 'ambiguous_student_workspace'
  | 'consent_required'
  | 'consent_policy_unavailable'
  | 'idempotency_conflict'
  | 'access_unavailable'
  | 'service_unavailable'

const messages: Record<SignalErrorCode, string> = {
  validation: 'Revise os campos sinalizados e tente novamente.',
  authentication_required: 'Entre novamente para continuar.',
  student_workspace_required: 'Vincule o aluno a um espaço ativo antes de continuar.',
  ambiguous_student_workspace: 'Há mais de um vínculo ativo. O suporte precisa revisar esse acesso.',
  consent_required: 'O consentimento atual para dados de saúde é necessário antes do envio.',
  consent_policy_unavailable: 'A versão atual do consentimento não está disponível.',
  idempotency_conflict: 'Esta solicitação já foi usada com dados diferentes. Tente novamente.',
  access_unavailable: 'Este registro não está disponível para esta conta.',
  service_unavailable: 'Não foi possível concluir a solicitação agora. Tente novamente.',
}

export class SignalDomainError extends Error {
  readonly code: SignalErrorCode
  readonly fieldErrors?: Readonly<Record<string, string>>

  constructor(
    code: SignalErrorCode,
    options?: { fieldErrors?: Readonly<Record<string, string>> },
  ) {
    super(messages[code])
    this.name = 'SignalDomainError'
    this.code = code
    this.fieldErrors = options?.fieldErrors
  }
}

type ErrorLike = { code?: unknown; message?: unknown }

export function toSignalDomainError(error: unknown): SignalDomainError {
  if (error instanceof SignalDomainError) return error

  const candidate = error && typeof error === 'object' ? (error as ErrorLike) : {}
  const backendCode = typeof candidate.code === 'string' ? candidate.code : ''
  const backendMessage = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''

  if (backendCode === '21000' || backendMessage.includes('workspace is ambiguous')) {
    return new SignalDomainError('ambiguous_student_workspace')
  }
  if (backendMessage.includes('one active student workspace')) {
    return new SignalDomainError('student_workspace_required')
  }
  if (backendMessage.includes('current health-processing consent')) {
    return new SignalDomainError('consent_required')
  }
  if (backendCode === '22023' || backendCode === '23505' || backendMessage.includes('idempotency')) {
    return new SignalDomainError('idempotency_conflict')
  }
  if (backendCode === '42501' || backendCode === 'PGRST301' || backendCode === 'PGRST303') {
    return new SignalDomainError('access_unavailable')
  }

  return new SignalDomainError('service_unavailable')
}
