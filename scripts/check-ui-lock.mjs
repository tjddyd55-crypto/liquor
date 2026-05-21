/**
 * Phase 4 — 금지 UI 패턴 검사 (Tailwind·일부 하드코딩)
 * 예외: 해당 줄 바로 위에 // ui-lock-ignore
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const srcDir = path.join(root, 'src')

const LINE_PATTERNS = [
  { re: /\bbg-white\b/, msg: 'Use bg-bg / bg-elevated or tokens, not bg-white' },
  { re: /\bbg-black\b/, msg: 'Use token backgrounds, not bg-black' },
  { re: /\btext-white\b/, msg: 'Use text-on-primary / tokens, not text-white' },
  { re: /\btext-black\b/, msg: 'Use text-primary, not text-black' },
  { re: /\bborder-gray-\d/, msg: 'Use border-border or var(--border-default)' },
  { re: /\btext-gray-\d/, msg: 'Use text-primary / text-secondary' },
  { re: /\bbg-gray-\d/, msg: 'Use token bg utilities' },
  { re: /\bbg-blue-\d/, msg: 'Use bg-brand or Button, not raw blue-*' },
]

/** @param {string} dir */
function* walkTsFiles(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      yield* walkTsFiles(p)
    } else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name) && !ent.name.endsWith('.d.ts')) {
      yield p
    }
  }
}

function stripIgnoredLines(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i + 1] != null && /^\s*\/\/\s*ui-lock-ignore\b/.test(lines[i])) {
      i++
      continue
    }
    out.push(lines[i])
  }
  return out.join('\n')
}

let failed = false

for (const abs of walkTsFiles(srcDir)) {
  const text = readFileSync(abs, 'utf8')
  const scan = stripIgnoredLines(text)
  const rel = path.relative(root, abs)

  for (const { re, msg } of LINE_PATTERNS) {
    if (!re.test(scan)) continue
    const m = scan.match(re)
    console.error(`[ui-lock] ${rel}: ${msg}${m ? ` (…${m[0]}…)` : ''}`)
    failed = true
  }
}

if (failed) {
  console.error('\nui-lock: fix patterns or add // ui-lock-ignore on the line above (sparingly).')
  process.exit(1)
}
