import { DatabaseSync } from 'node:sqlite'
import JSZip from 'jszip'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPptxSlidePaths, getPptxSlideSize, getPptxSlideLayers, compositePptxLayers } from '../lib/pptx-pages.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const db = new DatabaseSync(path.join(rootDir, 'data', 'app.db'))
const uploadsDir = path.join(rootDir, 'storage', 'uploads')
const storageDirs = {
  uploads: uploadsDir,
  thumbnails: path.join(rootDir, 'storage', 'thumbnails'),
  previews: path.join(rootDir, 'storage', 'previews'),
  originals: path.join(rootDir, 'storage', 'originals'),
}

const numericName = (name) => Number(String(name).match(/(\d+)/)?.[1] ?? 0)
const compareMediaNames = (a, b) => numericName(a) - numericName(b) || a.localeCompare(b, 'zh-CN')
const mediaNamesFromZip = (zip) =>
  Object.keys(zip.files)
    .filter((name) => name.startsWith('ppt/media/'))
    .map((name) => name.split('/').pop() ?? '')
    .filter((name) => /\.(png|jpe?g|webp|gif)$/i.test(name))
    .sort(compareMediaNames)

const hasAnimatedMedia = async (zip) => {
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('ppt/media/')) continue
    const ext = path.extname(name).toLowerCase()
    if (!['.gif', '.webp', '.png'].includes(ext)) continue
    try {
      const metadata = await sharp(await zip.files[name].async('nodebuffer'), { animated: true, limitInputPixels: false }).metadata()
      if ((metadata.pages ?? 1) > 1) return true
    } catch {
      // ignore unreadable media
    }
  }
  return false
}

const isAnimatedImageFile = async (sourcePath) => {
  try {
    const metadata = await sharp(sourcePath, { animated: true, limitInputPixels: false }).metadata()
    return (metadata.pages ?? 1) > 1
  } catch {
    return false
  }
}

const generatePageFiles = async (sourcePath, pageId) => {
  const animated = await isAnimatedImageFile(sourcePath)
  const originalExt = animated ? (path.extname(sourcePath).toLowerCase() || '.webp') : '.png'
  const original = path.join(storageDirs.originals, `${pageId}${originalExt}`)
  const preview = path.join(storageDirs.previews, `${pageId}.${animated ? 'webp' : 'png'}`)
  const thumbnail = path.join(storageDirs.thumbnails, `${pageId}.webp`)
  if (animated) {
    fs.copyFileSync(sourcePath, original)
    await sharp(sourcePath, { animated: true, limitInputPixels: false })
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toFile(preview)
    await sharp(sourcePath, { page: 0, limitInputPixels: false })
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(thumbnail)
    return { original, preview, thumbnail }
  }
  try {
    await sharp(sourcePath).png({ compressionLevel: 6 }).toFile(original)
    await sharp(sourcePath).resize({ width: 2560, withoutEnlargement: true }).png({ compressionLevel: 6 }).toFile(preview)
    await sharp(sourcePath).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 82 }).toFile(thumbnail)
  } catch {
    fs.copyFileSync(sourcePath, original)
    fs.copyFileSync(sourcePath, preview)
    fs.copyFileSync(sourcePath, thumbnail)
  }
  return { original, preview, thumbnail }
}

const addPageTag = (pageId, name) => {
  let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name)
  if (!tag) {
    const tagId = `t-${Date.now()}`
    db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(tagId, name)
    tag = { id: tagId }
  }
  db.prepare('INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES (?, ?)').run(pageId, tag.id)
}

const findSourceFile = async (work) => {
  if (work.source_path && fs.existsSync(work.source_path)) return work.source_path
  const files = fs.readdirSync(uploadsDir).filter((file) => file.endsWith('.pptx'))
  const pageTitles = db
    .prepare('SELECT title FROM pages WHERE work_id = ? ORDER BY page_no')
    .all(work.id)
    .map((row) => String(row.title ?? '').toLowerCase())
  let best = null
  for (const file of files) {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(uploadsDir, file)))
    const media = mediaNamesFromZip(zip).map((name) => name.toLowerCase())
    if (media.length !== pageTitles.length) continue
    const score = media.reduce((sum, name, index) => sum + (name === pageTitles[index] ? 1 : 0), 0)
    if (score === media.length) {
      best = path.join(uploadsDir, file)
      break
    }
  }
  return best
}

const works = db.prepare(`
  SELECT id, title, source_path FROM works WHERE kind = 'PPT' ORDER BY created_at
`).all()

let repaired = 0
for (const work of works) {
  const sourcePath = await findSourceFile(work)
  if (!sourcePath) continue
  const zip = await JSZip.loadAsync(fs.readFileSync(sourcePath))
  const slidePaths = await getPptxSlidePaths(zip)
  const animated = await hasAnimatedMedia(zip)
  const currentCount = db.prepare('SELECT COUNT(*) AS count FROM pages WHERE work_id = ?').get(work.id).count
  if (!slidePaths.length || (!animated && currentCount <= slidePaths.length)) continue

  const slideSize = await getPptxSlideSize(zip)
  db.prepare('DELETE FROM page_tags WHERE page_id IN (SELECT id FROM pages WHERE work_id = ?)').run(work.id)
  db.prepare('DELETE FROM page_folders WHERE page_id IN (SELECT id FROM pages WHERE work_id = ?)').run(work.id)
  db.prepare('DELETE FROM pages WHERE work_id = ?').run(work.id)

  let pageNo = 1
  for (const slidePath of slidePaths) {
    const layers = await getPptxSlideLayers(zip, slidePath)
    if (!layers.length) continue
    const composite = await compositePptxLayers(layers, slideSize)
    const compositeMeta = await sharp(composite, { limitInputPixels: false }).metadata()
    const tempExt = compositeMeta.format === 'gif' ? '.gif' : compositeMeta.pages > 1 ? '.webp' : '.png'
    const tempPath = path.join(uploadsDir, `${work.id}-slide-${pageNo}${tempExt}`)
    fs.writeFileSync(tempPath, composite)
    const files = await generatePageFiles(tempPath, `${work.id}-p${pageNo}`)
    db.prepare(`
      INSERT INTO pages (id, work_id, page_no, title, thumbnail_path, preview_path, original_path, rating, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(`${work.id}-p${pageNo}`, work.id, pageNo, `PPT 第 ${pageNo} 页`, files.thumbnail, files.preview, files.original, new Date().toISOString())
    pageNo += 1
  }

  const finalCount = pageNo - 1
  if (finalCount > 0) {
    addPageTag(`${work.id}-p1`, '封面')
    if (finalCount > 1) addPageTag(`${work.id}-p${finalCount}`, '封底')
    db.prepare("UPDATE works SET status = '已入库' WHERE id = ?").run(work.id)
    db.prepare('UPDATE works SET source_path = ? WHERE id = ?').run(sourcePath, work.id)
    console.log(`${work.title}: ${currentCount} -> ${finalCount} 页`)
    repaired += 1
  }
}

console.log(`repaired ${repaired} pptx works`)
