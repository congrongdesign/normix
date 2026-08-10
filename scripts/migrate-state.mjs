import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const storageDir = path.join(rootDir, 'storage')
const dirs = {
  uploads: path.join(storageDir, 'uploads'),
  thumbnails: path.join(storageDir, 'thumbnails'),
  previews: path.join(storageDir, 'previews'),
  originals: path.join(storageDir, 'originals'),
}
Object.values(dirs).forEach((dir) => fs.mkdirSync(dir, { recursive: true }))

const db = new DatabaseSync(path.join(dataDir, 'app.db'))

const existingWorks = db.prepare('SELECT COUNT(*) AS count FROM works').get().count
if (existingWorks > 0 && !process.argv.includes('--force')) {
  console.log('works table already has data, use --force to migrate again')
  process.exit(0)
}

const stateRow = db.prepare('SELECT data FROM app_state WHERE id = 1').get()
if (!stateRow) {
  console.log('no legacy state to migrate')
  process.exit(0)
}

const state = JSON.parse(stateRow.data)
const works = Array.isArray(state.works) ? state.works : []
const collections = Array.isArray(state.collections) ? state.collections : []
const metadataOnly = process.argv.includes('--metadata-only')

if (existingWorks > 0 && process.argv.includes('--force')) {
  db.exec(`
    DELETE FROM page_tags;
    DELETE FROM page_folders;
    DELETE FROM pages;
    DELETE FROM tags;
    DELETE FROM works;
    DELETE FROM folders;
  `)
}

const insertWork = db.prepare(`
  INSERT INTO works (id, title, file_name, kind, status, quality, rating, description, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const insertFolder = db.prepare(`
  INSERT INTO folders (id, name, parent_id, description, sort_order, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const insertPage = db.prepare(`
  INSERT INTO pages (id, work_id, page_no, title, thumbnail_path, preview_path, original_path, rating, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const insertTag = db.prepare('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)')
const findTag = db.prepare('SELECT id FROM tags WHERE name = ?')
const insertPageTag = db.prepare('INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES (?, ?)')
const insertPageFolder = db.prepare('INSERT OR IGNORE INTO page_folders (page_id, folder_id) VALUES (?, ?)')

const ensureTag = (name) => {
  if (!name) return null
  let tag = findTag.get(name)
  if (!tag) {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    insertTag.run(id, name)
    tag = { id }
  }
  return tag
}

const writeImage = (dataUrl, folder, id) => {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  const meta = dataUrl.slice(5, comma)
  const ext = /png/i.test(meta) ? 'png' : /jpeg|jpg/i.test(meta) ? 'jpg' : 'webp'
  const file = path.join(folder, `${id}.${ext}`)
  fs.writeFileSync(file, Buffer.from(dataUrl.slice(comma + 1), 'base64'))
  return file
}

for (const work of works) {
  insertWork.run(
    work.id,
    work.title ?? work.fileName ?? '未命名作品',
    work.fileName ?? '',
    work.kind ?? 'PPT',
    work.status ?? '已入库',
    work.quality ?? '待筛选',
    work.rating ?? 0,
    work.description ?? '',
    work.uploadedAt ?? new Date().toISOString().slice(0, 10),
  )

  if (Array.isArray(work.tags)) {
    work.tags.forEach((tag) => ensureTag(tag))
  }

  for (const page of work.pages ?? []) {
    const original = writeImage(page.imageUrl, dirs.originals, page.id)
    let thumbnail = null
    let preview = null
    if (original) {
      if (metadataOnly) {
        thumbnail = original
        preview = original
      } else {
        thumbnail = path.join(dirs.thumbnails, `${page.id}.png`)
        preview = path.join(dirs.previews, `${page.id}.png`)
        try {
          thumbnail = thumbnail.replace(/\.png$/, '.webp')
          await sharp(original)
            .resize({ width: 480, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(thumbnail)
          await sharp(original)
            .resize({ width: 2560, withoutEnlargement: true })
            .png({ compressionLevel: 6 })
            .toFile(preview)
        } catch {
          thumbnail = original
          preview = original
        }
      }
    }
    insertPage.run(
      page.id,
      work.id,
      page.pageNumber ?? 0,
      page.title ?? '',
      thumbnail,
      preview,
      original,
      page.rating ?? 0,
      work.uploadedAt ?? new Date().toISOString().slice(0, 10),
    )
    ;(page.tags ?? []).forEach((tag) => {
      const tagRow = ensureTag(tag)
      if (tagRow) insertPageTag.run(page.id, tagRow.id)
    })
  }
}

const folderOrder = new Map(collections.map((folder, index) => [folder.id, index]))
const sortedFolders = [...collections].sort((a, b) => {
  const parentDiff = (a.parentId ?? '').localeCompare(b.parentId ?? '')
  return parentDiff || (folderOrder.get(a.id) ?? 0) - (folderOrder.get(b.id) ?? 0)
})

for (const folder of sortedFolders) {
  const siblings = sortedFolders.filter((item) => (item.parentId ?? '') === (folder.parentId ?? ''))
  const sortOrder = siblings.findIndex((item) => item.id === folder.id)
  insertFolder.run(
    folder.id,
    folder.name ?? '新文件夹',
    folder.parentId ?? null,
    folder.description ?? '',
    sortOrder,
    new Date().toISOString(),
  )
  ;(folder.pageIds ?? []).forEach((pageId) => insertPageFolder.run(pageId, folder.id))
}

console.log(`migrated ${works.length} works, ${collections.length} folders`)
