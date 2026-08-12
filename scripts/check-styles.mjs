import { readFile, readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url))

async function listCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listCssFiles(path) : extname(path) === '.css' ? path : []
  }))
  return files.flat()
}

const files = await listCssFiles(sourceDirectory)
const css = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n')
const definitions = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map((match) => match[1]))
const references = new Set([...css.matchAll(/var\(--([\w-]+)/g)].map((match) => match[1]))
const unresolvedTokens = [...references].filter((token) => !definitions.has(token) && token !== 'progress').sort()

if (unresolvedTokens.length > 0) {
  throw new Error(`Undefined CSS tokens: ${unresolvedTokens.join(', ')}`)
}
if (/Manrope|Roboto Mono/.test(css)) {
  throw new Error('Legacy hard-coded font families remain in the stylesheets.')
}
if (/role-switch|reset-button|mobile-more-backdrop/.test(css)) {
  throw new Error('Removed demonstration selectors remain in the stylesheets.')
}
for (const token of ['--disp:"Segoe UI Variable Display"', '--body:"Segoe UI Variable Text"', '--mono:var(--body)']) {
  if (!css.includes(token)) throw new Error(`Missing Elo typography token: ${token}`)
}
for (const token of ['--motion-fast:', '--motion-base:', '--motion-slow:']) {
  if (!css.includes(token)) throw new Error(`Missing Elo motion token: ${token}`)
}
if (css.includes('.builder-copilot-intro>span{')) {
  throw new Error('Copilot icon styles must not collapse textual spans.')
}

console.log(`Stylesheet contract verified across ${files.length} files.`)
