import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const db = new DatabaseSync(path.join(rootDir, 'data', 'app.db'))
const storageDir = path.join(rootDir, 'storage')
const originalDir = path.join(storageDir, 'originals')
const previewDir = path.join(storageDir, 'previews')
const thumbnailDir = path.join(storageDir, 'thumbnails')

const addPageTag = (pageId, name) => {
  let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name)
  if (!tag) {
    const tagId = `t-${Date.now()}`
    db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(tagId, name)
    tag = { id: tagId }
  }
  db.prepare('INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES (?, ?)').run(pageId, tag.id)
}

const existingWorkIds = new Set(db.prepare('SELECT id FROM works').all().map((row) => row.id))
const groups = new Map()
for (const file of fs.readdirSync(originalDir)) {
  const match = file.match(/^(w-[^/]+)-p(\d+)\.(.+)$/i)
  if (!match) continue
  const workId = match[1]
  const pageNo = Number(match[2])
  if (existingWorkIds.has(workId)) continue
  const pages = groups.get(workId) ?? []
  pages.push({ pageNo, file })
  groups.set(workId, pages)
}

let recovered = 0
for (const [workId, pages] of groups) {
  pages.sort((a, b) => a.pageNo - b.pageNo)
  const now = new Date().toISOString()
  const title = `已恢复作品 ${now.slice(0, 10)}`
  db.prepare(`
    INSERT INTO works (id, title, file_name, source_path, kind, status, quality, rating, description, deleted_at, created_at)
    VALUES (?, ?, ?, NULL, ?, '已入库', '待筛选', 0, '', NULL, ?)
  `).run(workId, title, `${workId}.${pages.length > 1 ? 'pptx' : 'png'}`, pages.length > 1 ? 'PPT' : 'IMAGE', now)

  let pageIndex = 1
  for (const page of pages) {
    const originalPath = path.join(originalDir, page.file)
    const ext = path.extname(originalPath).toLowerCase()
    const pageId = `${workId}-p${pageIndex}`
    const previewPath = path.join(previewDir, `${pageId}.${ext === '.gif' || ext === '.webp' ? 'webp' : 'png'}`)
    const thumbnailPath = path.join(thumbnailDir, `${pageId}.webp`)

    if (!fs.existsSync(previewPath)) {
      const metadata = await sharp(originalPath, { animated: true, limitInputPixels: false }).metadata()
      const animated = (metadata.pages ?? 1) > 1
      if (animated) {
        await sharp(originalPath, { animated: true, limitInputPixels: false })
          .resize({ width: 1600, withoutEnlargement: true })
          .webp({ quality: 85, effort: 4 })
          .toFile(previewPath)
      } else {
        await sharp(originalPath).resize({ width: 2560, withoutEnlargement: true }).png().toFile(previewPath)
      }
    }
    if (!fs.existsSync(thumbnailPath)) {
      await sharp(originalPath, { page: 0, limitInputPixels: false })
        .resize({ width: 480, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(thumbnailPath)
    }

    db.prepare(`
      INSERT INTO pages (id, work_id, page_no, title, thumbnail_path, preview_path, original_path, rating, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(pageId, workId, pageIndex, `恢复第 ${pageIndex} 页`, thumbnailPath, previewPath, originalPath, now)
    pageIndex += 1
  }

  if (pageIndex > 2) {
    addPageTag(`${workId}-p1`, '封面')
    addPageTag(`${workId}-p${pageIndex - 1}`, '封底')
  }
  recovered += 1
}

console.log(`recovered ${recovered} orphan works`)
