import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const db = new DatabaseSync(path.join(rootDir, 'data', 'app.db'))
const base = process.env.API_BASE ?? 'http://localhost:4000'
const count = Number(process.argv[2] ?? 5000)
const workId = 'perf-work'

db.prepare('DELETE FROM works WHERE id = ?').run(workId)
db.prepare('DELETE FROM pages WHERE work_id = ?').run(workId)
db.prepare(`
  INSERT INTO works (id, title, file_name, kind, status, quality, rating, description, created_at)
  VALUES (?, '性能测试', 'perf.pdf', 'PDF', '已入库', '待筛选', 0, '', ?)
`).run(workId, new Date().toISOString())
const insertPage = db.prepare(`
  INSERT INTO pages (id, work_id, page_no, title, thumbnail_path, preview_path, original_path, rating, created_at)
  VALUES (?, ?, ?, ?, '', '', '', 0, ?)
`)
const now = new Date().toISOString()
for (let i = 1; i <= count; i += 1) {
  insertPage.run(`${workId}-p${i}`, workId, i, `页面 ${i}`, now)
}

const start = Date.now()
const worksResponse = await fetch(`${base}/api/works?page=1&limit=100&keyword=性能测试`)
const works = await worksResponse.json()
const pagesResponse = await fetch(`${base}/api/pages?page=1&limit=200&work_id=${workId}`)
const pages = await pagesResponse.json()
const elapsed = Date.now() - start

await fetch(`${base}/api/works/${workId}`, { method: 'DELETE' })
await fetch(`${base}/api/trash/${workId}`, { method: 'DELETE' })

console.log(JSON.stringify({ count, worksTotal: works.total, pagesTotal: pages.total, elapsedMs: elapsed }))
