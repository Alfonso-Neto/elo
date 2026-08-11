import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const projectDirectory = fileURLToPath(new URL('../', import.meta.url))
const sourceDirectory = join(projectDirectory, 'src')

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    if (!['.ts', '.tsx'].includes(extname(entry.name)) || /\.test\.[^.]+$/.test(entry.name)) return []
    return path
  }))
  return nested.flat()
}

function location(sourceFile, position) {
  const point = sourceFile.getLineAndCharacterOfPosition(position)
  return `${relative(projectDirectory, sourceFile.fileName).replaceAll('\\', '/')}:${point.line + 1}`
}

function openingTag(node) {
  if (ts.isJsxElement(node)) return node.openingElement
  if (ts.isJsxSelfClosingElement(node)) return node
  return null
}

const files = await listSourceFiles(sourceDirectory)
const violations = []
const forbiddenPatterns = [
  [/dangerouslySetInnerHTML/, 'dynamic HTML injection is forbidden'],
  [/\bdocument\.write\s*\(/, 'document.write is forbidden'],
  [/\.innerHTML\s*=/, 'direct innerHTML assignment is forbidden'],
  [/\beval\s*\(/, 'eval is forbidden'],
  [/\bnew\s+Function\s*\(/, 'dynamic Function construction is forbidden'],
  [/(?:local|session)Storage\.setItem\s*\(/, 'application data must not be persisted in browser storage'],
  [/indexedDB\.open\s*\(/, 'application data must not be persisted in IndexedDB'],
  [/prototype-context|trainer-screens|student-screens/, 'a removed prototype module is referenced'],
]
const idempotencyPrefixPattern = /^[A-Za-z][A-Za-z0-9._-]{0,31}$/

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)

  for (const [pattern, message] of forbiddenPatterns) {
    const match = pattern.exec(source)
    if (match) violations.push(`${location(sourceFile, match.index)}: ${message}`)
  }

  function visit(node) {
    const tag = openingTag(node)
    if (tag?.tagName.getText(sourceFile) === 'button') {
      const hasType = tag.attributes.properties.some((attribute) => (
        ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'type'
      ))
      if (!hasType) violations.push(`${location(sourceFile, tag.getStart(sourceFile))}: button must declare an explicit type`)
    }
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'createIdempotencyKey'
    ) {
      const prefix = node.arguments[0]
      if (!prefix || (!ts.isStringLiteral(prefix) && !ts.isNoSubstitutionTemplateLiteral(prefix))) {
        violations.push(`${location(sourceFile, node.getStart(sourceFile))}: idempotency prefix must be a statically auditable literal`)
      } else if (!idempotencyPrefixPattern.test(prefix.text)) {
        violations.push(`${location(sourceFile, prefix.getStart(sourceFile))}: idempotency prefix must match ${idempotencyPrefixPattern}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

if (violations.length > 0) throw new Error(`Source contract failed:\n${violations.join('\n')}`)

console.log(`Source contract verified across ${files.length} production TypeScript files.`)
