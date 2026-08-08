import { describe, expect, it } from 'vitest'

const styles = import.meta.glob('../**/*.css', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

describe('stylesheet token contract', () => {
  it('defines every referenced token except component-owned progress', () => {
    const css = Object.values(styles).join('\n')
    const definitions = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map((match) => match[1]))
    const references = new Set([...css.matchAll(/var\(--([\w-]+)/g)].map((match) => match[1]))

    expect([...references]
      .filter((token) => !definitions.has(token) && token !== 'progress')
      .sort()).toEqual([])
  })
})
