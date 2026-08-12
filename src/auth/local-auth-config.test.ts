import { describe, expect, it } from 'vitest'
import config from '../../supabase/config.toml?raw'

describe('authentication redirect configuration', () => {
  it('uses homologation as the canonical site and retains local development redirects', () => {
    expect(config).toContain('site_url = "https://elo-homolog.vercel.app"')
    expect(config).toContain('"https://elo-homolog.vercel.app/**"')
    expect(config).toContain('"http://localhost:5173/**"')
    expect(config).toContain('"http://localhost:4173/**"')
  })
})
