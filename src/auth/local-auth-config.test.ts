import { describe, expect, it } from 'vitest'
import config from '../../supabase/config.toml?raw'

describe('local authentication redirect configuration', () => {
  it('allows both the Vite development and preview origins', () => {
    expect(config).toContain('site_url = "http://localhost:5173"')
    expect(config).toContain('"http://localhost:5173/**"')
    expect(config).toContain('"http://localhost:4173/**"')
  })
})
