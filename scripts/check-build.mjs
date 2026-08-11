import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
const limits = new Map([
  ['.js', 250 * 1024],
  ['.css', 150 * 1024],
])

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : path
  }))
  return files.flat()
}

const files = await listFiles(distDirectory)
const violations = []
const html = await readFile(join(distDirectory, 'index.html'), 'utf8')

if (!/<html\s+lang="pt-BR"/i.test(html)) violations.push('index.html must declare Brazilian Portuguese.')
if (!/<meta\s+name="robots"\s+content="noindex,nofollow,noarchive"/i.test(html)) {
  violations.push('index.html must keep the authenticated homologation app out of search indexes.')
}
if (!/<a\s+class="skip-link"\s+href="#main-content"/i.test(html)) {
  violations.push('index.html must preserve the keyboard skip link.')
}

for (const file of files) {
  const extension = [...limits.keys()].find((candidate) => file.endsWith(candidate))
  if (!extension) continue
  const fileSize = (await stat(file)).size
  const limit = limits.get(extension)
  if (fileSize > limit) {
    violations.push(`${relative(distDirectory, file)}: ${(fileSize / 1024).toFixed(2)} kB > ${limit / 1024} kB`)
  }
}

if (violations.length > 0) {
  throw new Error(`Build budget exceeded:\n${violations.join('\n')}`)
}

console.log(`Build contract verified across ${files.length} generated files.`)
