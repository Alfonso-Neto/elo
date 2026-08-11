import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = fileURLToPath(new URL('../', import.meta.url))
const ignoredDirectories = new Set(['.git', '.pnpm-store', 'dist', 'node_modules'])

async function listMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : listMarkdownFiles(join(directory, entry.name))
    }
    return extname(entry.name).toLowerCase() === '.md' ? join(directory, entry.name) : []
  }))
  return nested.flat()
}

const files = await listMarkdownFiles(projectDirectory)
const violations = []

for (const file of files) {
  const markdown = await readFile(file, 'utf8')
  const displayPath = relative(projectDirectory, file).replaceAll('\\', '/')

  for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].trim()
    if (!target || /^(?:https?:\/\/|mailto:|#)/i.test(target)) continue
    const pathPart = target.split('#')[0]
    if (!pathPart) continue
    let decodedPath
    try {
      decodedPath = decodeURIComponent(pathPart.replace(/^<|>$/g, ''))
    } catch {
      violations.push(`${displayPath}: malformed encoded link (${target})`)
      continue
    }
    const resolvedPath = resolve(dirname(file), decodedPath)
    const projectRelativePath = relative(projectDirectory, resolvedPath)
    if (projectRelativePath === '..' || projectRelativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(projectRelativePath)) {
      violations.push(`${displayPath}: link escapes the project (${target})`)
      continue
    }
    try {
      await access(resolvedPath)
    } catch {
      violations.push(`${displayPath}: broken local link (${target})`)
    }
  }

  if (/elo-prototipo(?:\s|\.|\(|`)/i.test(markdown)) {
    violations.push(`${displayPath}: removed prototype artifact is referenced`)
  }
  if (/roteiro de demonstração|altern[ae].{0,30}(?:professor|treinador).{0,10}aluno/is.test(markdown)) {
    violations.push(`${displayPath}: removed local role-switch workflow is documented`)
  }
}

if (files.length < 4) violations.push(`Expected at least 4 project documents, found ${files.length}.`)
if (violations.length > 0) throw new Error(`Documentation contract failed:\n${violations.join('\n')}`)

console.log(`Documentation contract verified across ${files.length} Markdown files.`)
