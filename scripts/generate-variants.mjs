import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const db = new DatabaseSync(path.join(rootDir, 'data', 'app.db'))
const storageDir = path.join(rootDir, 'storage')
const thumbnailDir = path.join(storageDir, 'thumbnails')
const previewDir = path.join(storageDir, 'previews')
fs.mkdirSync(thumbnailDir, { recursive: true })
fs.mkdirSync(previewDir, { recursive: true })

const pages = db.prepare('SELECT id, original_path, thumbnail_path, preview_path FROM pages').all()
const update = db.prepare('UPDATE pages SET thumbnail_path = ?, preview_path = ? WHERE id = ?')
let generated = 0
let failed = 0

for (const page of pages) {
  const original = page.original_path
  if (!original || !fs.existsSync(original)) {
    failed += 1
    continue
  }
  const thumbnail = path.join(thumbnailDir, `${page.id}.webp`)
  const preview = path.join(previewDir, `${page.id}.png`)
  try {
    await sharp(original)
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(thumbnail)
    await sharp(original)
      .resize({ width: 2560, withoutEnlargement: true })
      .png({ compressionLevel: 6 })
      .toFile(preview)
    update.run(thumbnail, preview, page.id)
    generated += 1
  } catch {
    failed += 1
  }
}

console.log(`generated ${generated} variants, failed ${failed}`)
