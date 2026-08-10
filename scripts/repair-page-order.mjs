import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const db = new DatabaseSync(path.join(rootDir, 'data', 'app.db'))

const numericValue = (value) => {
  const match = String(value ?? '').match(/(\d+)/)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

const works = db.prepare(`
  SELECT id, kind FROM works WHERE kind IN ('PPT', 'ZIP')
`).all()

let removed = 0
for (const work of works) {
  const pages = db.prepare('SELECT id, title, page_no FROM pages WHERE work_id = ? ORDER BY page_no').all(work.id)
  const filtered = pages.filter((page) => {
    const name = String(page.title ?? '').toLowerCase()
    if (pages.length > 1 && /^(thumbnail|cover|preview)[._-]?/.test(name)) {
      removed += 1
      db.prepare('DELETE FROM pages WHERE id = ?').run(page.id)
      return false
    }
    return true
  })
  filtered.sort((a, b) => numericValue(a.title) - numericValue(b.title) || a.title.localeCompare(b.title, 'zh-CN'))
  filtered.forEach((page, index) => {
    if (page.page_no !== index + 1) {
      db.prepare('UPDATE pages SET page_no = ? WHERE id = ?').run(index + 1, page.id)
    }
  })
}

console.log(`repaired page order, removed ${removed} thumbnail pages`)
