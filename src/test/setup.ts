import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'scrollTo', { value: () => undefined, writable: true })
Object.defineProperty(window, 'matchMedia', {
  value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
  writable: true,
})
