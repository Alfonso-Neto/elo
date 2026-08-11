export type PublicSupabaseConfig = {
  configured: boolean
  url: string
  publishableKey: string
  issue: string | null
}

const isLocalUrl = (url: URL) => ['localhost', '127.0.0.1'].includes(url.hostname)
const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9_-]{20,}$/

export function validatePublicSupabaseConfig(rawUrl?: string, rawKey?: string): PublicSupabaseConfig {
  const url = rawUrl?.trim() ?? ''
  const publishableKey = rawKey?.trim() ?? ''

  if (!url && !publishableKey) return { configured: false, url, publishableKey, issue: null }
  if (!url || !publishableKey) {
    return { configured: false, url, publishableKey, issue: 'A URL e a chave publicável do Supabase precisam ser informadas juntas.' }
  }
  if (/service[_-]?role|sb_secret_/i.test(publishableKey)) {
    return { configured: false, url, publishableKey: '', issue: 'Uma chave secreta não pode ser usada no navegador.' }
  }
  if (!publishableKeyPattern.test(publishableKey)) {
    return { configured: false, url, publishableKey: '', issue: 'Informe somente uma chave publicável válida do Supabase.' }
  }

  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password) {
      return { configured: false, url, publishableKey, issue: 'A URL pública do Supabase não pode conter credenciais.' }
    }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalUrl(parsed))) {
      return { configured: false, url, publishableKey, issue: 'A URL do Supabase precisa usar HTTPS, exceto no ambiente local.' }
    }
  } catch {
    return { configured: false, url, publishableKey, issue: 'A URL pública do Supabase é inválida.' }
  }

  return { configured: true, url, publishableKey, issue: null }
}
