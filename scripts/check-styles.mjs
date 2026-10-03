// Guards against raw design values outside token sources.
// - raw colors are forbidden everywhere except packages/ui/src/styles;
// - Tailwind arbitrary values (e.g. `w-[13px]`) are forbidden in application code.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const scanRoots = ['apps', 'packages']
const tokenSource = join('packages', 'ui', 'src', 'styles')
const extensions = ['.vue', '.ts', '.css']

const rawColor =
  /(?<![\w&/-])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?|oklch|oklab)\(/gi
const arbitraryValue = /(?<=[\s"'`:])[a-z-]+-\[[^\]\s]+\]/g

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (extensions.some((ext) => name.endsWith(ext))) yield path
  }
}

const problems = []

for (const scanRoot of scanRoots) {
  for (const file of walk(join(root, scanRoot))) {
    const rel = relative(root, file)
    if (rel.startsWith(tokenSource) || /\.(test|spec)\.ts$/.test(rel)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      for (const match of line.matchAll(rawColor)) {
        problems.push(`${rel}:${index + 1} raw color "${match[0]}"`)
      }
      if (rel.startsWith('apps')) {
        for (const match of line.matchAll(arbitraryValue)) {
          problems.push(`${rel}:${index + 1} arbitrary value "${match[0]}"`)
        }
      }
    })
  }
}

if (problems.length > 0) {
  console.error(`Style guard found ${problems.length} problem(s):\n${problems.join('\n')}`)
  process.exit(1)
}
