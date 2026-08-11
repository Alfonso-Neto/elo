import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const migrationsDirectory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort()

if (migrationNames.length === 0) throw new Error('No Supabase migrations found.')

const sql = (await Promise.all(migrationNames.map((name) => (
  readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
)))).join('\n')

const publicTables = new Set(
  [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)]
    .map((match) => match[1].toLowerCase()),
)
const missingRls = [...publicTables].filter((table) => {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return !new RegExp(`alter\\s+table\\s+public\\.${escapedTable}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(sql)
})

const securityDefiners = [...sql.matchAll(/security\s+definer/gi)].length
const hardenedDefiners = [...sql.matchAll(/security\s+definer\s+set\s+search_path\s*=\s*''/gi)].length
const violations = []

if (missingRls.length > 0) violations.push(`Public tables without RLS: ${missingRls.sort().join(', ')}`)
if (securityDefiners !== hardenedDefiners) {
  violations.push(`${securityDefiners - hardenedDefiners} SECURITY DEFINER function(s) do not set an empty search_path.`)
}
if (/grant\s+all\s+on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+(?:anon|authenticated)/i.test(sql)) {
  violations.push('A blanket public-schema table grant was given to a browser role.')
}

if (violations.length > 0) throw new Error(`SQL security contract failed:\n${violations.join('\n')}`)

console.log(
  `SQL security contract verified across ${migrationNames.length} migrations, ${publicTables.size} public tables and ${securityDefiners} SECURITY DEFINER functions.`,
)
