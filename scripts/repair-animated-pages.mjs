import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const db = new DatabaseSync(path.join(rootDir, 'data', 'app.db'))

let storageDir = path.join(rootDir, 'storage')
try {
  const saved = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'settings.json'), 'utf8'))
  if (saved.storageDir && path.isAbsolute(saved.storageDir)) storageDir = saved.storageDir
} catch {
  // Use the default storage location.
}

const originalsDir = path.join(storageDir, 'originals')
const resolvePath = (filePath) => (path.isAbsolute(filePath) ? filePath : path.join(storageDir, filePath))

const rows = db.prepare(`
  SELECT id, original_path, preview_path
  FROM pages
  WHERE lower(original_path) LIKE '%.webp' OR lower(original_path) LIKE '%.gif'
`).all()

let repaired = 0
let skipped = 0
for (const row of rows) {
  const sourcePath = resolvePath(row.original_path)
  if (!fs.existsSync(sourcePath)) {
    skipped += 1
    continue
  }

  let metadata
  try {
    metadata = await sharp(sourcePath, { animated: true, limitInputPixels: false }).metadata()
  } catch {
    skipped += 1
    continue
  }
  if ((metadata.pages ?? 1) <= 1) {
    skipped += 1
    continue
  }

  const sourceExt = path.extname(sourcePath).toLowerCase()
  const gifPath = path.join(originalsDir, `${row.id}.gif`)
  const tempGifPath = sourceExt === '.gif' ? `${sourcePath}.repair` : gifPath
  try {
    const gifOptions = { effort: 2 }
    if (Array.isArray(metadata.delay) && metadata.delay.length > 0) {
      gifOptions.delay = metadata.delay.map((value) => Math.max(120, Math.round(Number(value) || 120)))
    }
    gifOptions.loop = 1
    await sharp(sourcePath, { animated: true, limitInputPixels: false })
      .gif(gifOptions)
      .toFile(tempGifPath)
    const finalPath = sourceExt === '.gif' ? sourcePath : gifPath
    if (sourceExt === '.gif') {
      fs.renameSync(tempGifPath, sourcePath)
    } else {
      fs.renameSync(tempGifPath, gifPath)
    }
    db.prepare('UPDATE pages SET original_path = ?, preview_path = ? WHERE id = ?')
      .run(finalPath, finalPath, row.id)

    if (sourceExt !== '.gif') {
      const refs = db.prepare('SELECT COUNT(*) AS count FROM pages WHERE original_path = ? OR preview_path = ?')
        .get(sourcePath, sourcePath).count
      if (!refs) fs.rmSync(sourcePath, { force: true })
    }
    repaired += 1
  } catch (error) {
    console.error(`skip ${row.id}: ${error instanceof Error ? error.message : error}`)
    fs.rmSync(tempGifPath, { force: true })
    skipped += 1
  }
}

console.log(`repaired ${repaired} animated pages, skipped ${skipped}`)
