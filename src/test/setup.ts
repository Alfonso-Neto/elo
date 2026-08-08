import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

configure({ asyncUtilTimeout: 10_000 })

Object.defineProperty(window, 'scrollTo', { value: () => undefined, writable: true })
Object.defineProperty(window, 'matchMedia', {
  value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
  writable: true,
})
