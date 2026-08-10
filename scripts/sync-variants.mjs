import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const db = new DatabaseSync(path.join(rootDir, 'data', 'app.db'))
const storageDir = path.join(rootDir, 'storage')
const thumbnailDir = path.join(storageDir, 'thumbnails')
const previewDir = path.join(storageDir, 'previews')
fs.mkdirSync(thumbnailDir, { recursive: true })
fs.mkdirSync(previewDir, { recursive: true })

const pages = db.prepare('SELECT id, original_path FROM pages').all()
const update = db.prepare('UPDATE pages SET thumbnail_path = ?, preview_path = ? WHERE id = ?')
let ok = 0
let failed = 0

for (const page of pages) {
  const original = page.original_path
  if (!original || !fs.existsSync(original)) {
    failed += 1
    continue
  }
  const thumbnail = path.join(thumbnailDir, `${page.id}.jpg`)
  const preview = path.join(previewDir, `${page.id}.png`)
  try {
    if (!fs.existsSync(thumbnail)) {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', '480', original, '--out', thumbnail], { stdio: 'ignore' })
    }
    if (!fs.existsSync(preview)) {
      execFileSync('sips', ['-s', 'format', 'png', '--resampleHeightWidthMax', '2560', original, '--out', preview], { stdio: 'ignore' })
    }
    update.run(thumbnail, preview, page.id)
    ok += 1
  } catch {
    failed += 1
  }
}

console.log(`synced ${ok} pages, failed ${failed}`)
