import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const db = new DatabaseSync(path.join(rootDir, 'data', 'app.db'))

const addPageTag = (pageId, name) => {
  let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name)
  if (!tag) {
    const tagId = `t-${Date.now()}`
    db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(tagId, name)
    tag = { id: tagId }
  }
  db.prepare('INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES (?, ?)').run(pageId, tag.id)
}

const works = db.prepare(`
  SELECT w.id, COUNT(p.id) AS page_count
  FROM works w
  JOIN pages p ON p.work_id = w.id
  GROUP BY w.id
  HAVING COUNT(p.id) > 1
`).all()

let covers = 0
let backs = 0
for (const work of works) {
  const pages = db.prepare('SELECT id FROM pages WHERE work_id = ? ORDER BY page_no').all(work.id)
  if (!pages.length) continue
  addPageTag(pages[0].id, '封面')
  covers += 1
  if (pages.length > 1) {
    addPageTag(pages[pages.length - 1].id, '封底')
    backs += 1
  }
}

console.log(`applied cover/back tags to ${works.length} works: ${covers} covers, ${backs} backs`)
