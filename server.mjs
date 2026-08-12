import express from 'express'
import cors from 'cors'
import multer from 'multer'
import sharp from 'sharp'
import JSZip from 'jszip'
import { getPptxSlidePaths, getPptxSlideSize, getPptxSlideLayers, compositePptxLayers } from './lib/pptx-pages.mjs'
import { getPdfPageCountJs, renderPdfRangeJs } from './lib/pdf-render.mjs'
import { DatabaseSync } from 'node:sqlite'
import { execFile as execFileAsync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { Transform } from 'node:stream'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data')
const defaultStorageDir = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(__dirname, 'storage')
let storageDir = defaultStorageDir
let activeUploads = 0
const processingQueue = []
let processingActive = 0
const cancelledUploadTaskIds = new Set()
const maxProcessingConcurrency = Math.max(1, Math.min(3, Math.max(1, os.cpus().length - 2)))
let storageDirs = {
  uploads: path.join(storageDir, 'uploads'),
  thumbnails: path.join(storageDir, 'thumbnails'),
  previews: path.join(storageDir, 'previews'),
  originals: path.join(storageDir, 'originals'),
  sources: path.join(storageDir, 'sources'),
}
fs.mkdirSync(dataDir, { recursive: true })

const drainProcessingQueue = () => {
  while (processingActive < maxProcessingConcurrency && processingQueue.length > 0) {
    const job = processingQueue.shift()
    processingActive += 1
    activeUploads += 1
    Promise.resolve()
      .then(job)
      .finally(() => {
        processingActive -= 1
        activeUploads -= 1
        drainProcessingQueue()
      })
  }
}

const enqueueProcessing = (job) => {
  processingQueue.push(job)
  drainProcessingQueue()
}

const ensureUploadNotCancelled = (taskId) => {
  if (cancelledUploadTaskIds.has(taskId)) {
    throw new Error('用户已取消')
  }
}

const settingsFilePath = path.join(dataDir, 'settings.json')
const saveSettings = () => {
  fs.writeFileSync(settingsFilePath, JSON.stringify({ storageDir }, null, 2))
}
const applyStorageDir = (nextDir) => {
  storageDir = path.resolve(nextDir)
  storageDirs = {
    uploads: path.join(storageDir, 'uploads'),
    thumbnails: path.join(storageDir, 'thumbnails'),
    previews: path.join(storageDir, 'previews'),
    originals: path.join(storageDir, 'originals'),
    sources: path.join(storageDir, 'sources'),
  }
}
try {
  const saved = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
  if (saved.storageDir && path.isAbsolute(saved.storageDir)) {
    applyStorageDir(saved.storageDir)
  }
} catch {
  // First run or invalid settings file.
}
Object.values(storageDirs).forEach((dir) => fs.mkdirSync(dir, { recursive: true }))
fs.mkdirSync('/tmp/normix-fontconfig-cache', { recursive: true })

const cleanupStaleUploads = () => {
  if (activeUploads > 0 || processingActive > 0 || processingQueue.length > 0) return
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const file of fs.existsSync(storageDirs.uploads) ? fs.readdirSync(storageDirs.uploads) : []) {
    const filePath = path.join(storageDirs.uploads, file)
    try {
      if (fs.statSync(filePath).mtimeMs < cutoff) fs.rmSync(filePath, { force: true })
    } catch {
      // Ignore files that disappear during cleanup.
    }
  }
}
cleanupStaleUploads()
setInterval(cleanupStaleUploads, 10 * 60 * 1000).unref()

const clearSourceStorage = () => {
  const sourcesRoot = path.resolve(storageDirs.sources)
  if (!fs.existsSync(sourcesRoot)) return 0
  let freedBytes = 0
  let deleted = 0
  for (const entry of fs.readdirSync(sourcesRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const filePath = path.join(sourcesRoot, entry.name)
    try {
      freedBytes += fs.statSync(filePath).size
      fs.rmSync(filePath, { force: true })
      deleted += 1
    } catch {
      // Ignore files that disappear during cleanup.
    }
  }
  db.prepare('UPDATE works SET source_path = NULL').run()
  if (deleted > 0) console.log(`Cleared source storage: ${deleted} file(s), freed ${(freedBytes / 1024 / 1024).toFixed(2)} MB`)
  return freedBytes
}

const db = new DatabaseSync(path.join(dataDir, 'app.db'))
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS works (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    source_path TEXT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    quality TEXT,
    rating INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    deleted_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL,
    page_no INTEGER NOT NULL,
    title TEXT,
    thumbnail_path TEXT,
    preview_path TEXT,
    original_path TEXT,
    rating INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    tag_group TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    scope TEXT DEFAULT 'work'
  );

  CREATE TABLE IF NOT EXISTS page_tags (
    page_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (page_id, tag_id),
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS page_folders (
    page_id TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    PRIMARY KEY (page_id, folder_id),
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS work_tags (
    work_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (work_id, tag_id),
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS upload_tasks (
    id TEXT PRIMARY KEY,
    work_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    progress INTEGER DEFAULT 0,
    stage TEXT,
    processed INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_works_deleted_created ON works(deleted_at, created_at);
  CREATE INDEX IF NOT EXISTS idx_works_kind ON works(kind);
  CREATE INDEX IF NOT EXISTS idx_pages_work_no ON pages(work_id, page_no);
  CREATE INDEX IF NOT EXISTS idx_pages_created ON pages(created_at);
  CREATE INDEX IF NOT EXISTS idx_folders_parent_order ON folders(parent_id, sort_order);
  CREATE INDEX IF NOT EXISTS idx_page_tags_page ON page_tags(page_id);
  CREATE INDEX IF NOT EXISTS idx_page_tags_tag ON page_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_page_folders_page ON page_folders(page_id);
  CREATE INDEX IF NOT EXISTS idx_page_folders_folder ON page_folders(folder_id);
  CREATE INDEX IF NOT EXISTS idx_work_tags_work ON work_tags(work_id);
  CREATE INDEX IF NOT EXISTS idx_work_tags_tag ON work_tags(tag_id);
`)

try {
  db.exec('ALTER TABLE pages ADD COLUMN rating INTEGER DEFAULT 0')
} catch {
  // column already exists
}

try {
  db.exec('ALTER TABLE works ADD COLUMN source_path TEXT')
} catch {
  // column already exists
}

try {
  db.exec('ALTER TABLE works ADD COLUMN deleted_at TEXT')
} catch {
  // column already exists
}

try {
  db.exec('ALTER TABLE works ADD COLUMN favorite INTEGER DEFAULT 0')
} catch {
  // column already exists
}

try {
  db.exec('ALTER TABLE works ADD COLUMN file_hash TEXT')
} catch {
  // column already exists
}
db.exec('CREATE INDEX IF NOT EXISTS idx_works_file_hash ON works(file_hash)')

for (const [column, definition] of [
  ['parent_id', 'TEXT'],
  ['tag_group', 'TEXT'],
  ['color', 'TEXT'],
  ['sort_order', 'INTEGER DEFAULT 0'],
  ['scope', 'TEXT'],
]) {
  try {
    db.exec(`ALTER TABLE tags ADD COLUMN ${column} ${definition}`)
  } catch {
    // column already exists
  }
}

const existingTagTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tags'").get()
if (existingTagTable?.sql?.includes('UNIQUE')) {
  db.exec('PRAGMA foreign_keys = OFF')
  db.exec('ALTER TABLE tags RENAME TO tags_legacy')
  db.exec(`
    CREATE TABLE tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      tag_group TEXT,
      color TEXT,
      sort_order INTEGER DEFAULT 0
    )
  `)
  db.exec(`
    INSERT INTO tags (id, name, parent_id, tag_group, color, sort_order)
    SELECT id, name, parent_id, tag_group, color, sort_order FROM tags_legacy
  `)
  db.exec('DROP TABLE tags_legacy')
  db.exec('PRAGMA foreign_keys = ON')
}

db.exec(`
  UPDATE tags SET tag_group = '页面'
  WHERE tag_group IS NULL AND name IN ('封面', '封底', '未分类', '真实预览', '重点参考')
`)
db.exec(`
  UPDATE tags SET tag_group = '自定义'
  WHERE tag_group IS NULL AND id IN (SELECT DISTINCT tag_id FROM work_tags)
`)
db.exec(`
  UPDATE tags SET tag_group = '自定义'
  WHERE tag_group IS NULL
`)

const migrateTagScopes = () => {
  const rows = db.prepare(`
    SELECT id, name, tag_group, color, sort_order
    FROM tags
    WHERE scope IS NULL OR scope NOT IN ('work', 'page')
  `).all()

  for (const row of rows) {
    const workCount = db.prepare(`
      SELECT COUNT(*) AS count FROM work_tags WHERE tag_id = ?
    `).get(row.id).count
    const pageCount = db.prepare(`
      SELECT COUNT(*) AS count FROM page_tags WHERE tag_id = ?
    `).get(row.id).count

    if (workCount > 0 && pageCount > 0) {
      db.prepare(`UPDATE tags SET scope = 'work' WHERE id = ?`).run(row.id)
      const pageTagId = `t-${randomUUID()}`
      db.prepare(`
        INSERT INTO tags (id, name, parent_id, tag_group, color, sort_order, scope)
        VALUES (?, ?, NULL, ?, ?, ?, 'page')
      `).run(pageTagId, row.name, row.tag_group, row.color, row.sort_order)
      db.prepare(`UPDATE page_tags SET tag_id = ? WHERE tag_id = ?`).run(pageTagId, row.id)
    } else if (workCount > 0) {
      db.prepare(`UPDATE tags SET scope = 'work' WHERE id = ?`).run(row.id)
    } else if (pageCount > 0) {
      db.prepare(`UPDATE tags SET scope = 'page' WHERE id = ?`).run(row.id)
    } else {
      db.prepare(`UPDATE tags SET scope = ? WHERE id = ?`).run(row.tag_group === '页面' ? 'page' : 'work', row.id)
    }
  }

  db.prepare(`
    UPDATE tags
    SET scope = 'work'
    WHERE scope IS NULL OR scope NOT IN ('work', 'page')
  `).run()
}

migrateTagScopes()

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tags_scope_parent ON tags(scope, parent_id, sort_order)
`)

for (const [column, definition] of [
  ['progress', 'INTEGER DEFAULT 0'],
  ['stage', 'TEXT'],
  ['processed', 'INTEGER DEFAULT 0'],
  ['total', 'INTEGER DEFAULT 0'],
]) {
  try {
    db.exec(`ALTER TABLE upload_tasks ADD COLUMN ${column} ${definition}`)
  } catch {
    // column already exists
  }
}

const recoverInterruptedUploads = () => {
  const stale = db.prepare("SELECT id, work_id FROM upload_tasks WHERE status IN ('processing', 'pending')").all()
  const updatedAt = new Date().toISOString()
  for (const row of stale) {
    db.prepare(`
      UPDATE upload_tasks
      SET status = 'error', error = '服务重启，任务已中断', stage = '任务中断', updated_at = ?
      WHERE id = ?
    `).run(updatedAt, row.id)
  }
  if (stale.length > 0) {
    console.log(`Recovered ${stale.length} interrupted upload task(s)`)
  }
}

const reconcileCompletedUploadTasks = () => {
  const rows = db.prepare(`
    SELECT t.id, t.work_id
    FROM upload_tasks t
    WHERE t.status = 'error'
      AND EXISTS (SELECT 1 FROM pages p WHERE p.work_id = t.work_id)
  `).all()
  const updatedAt = new Date().toISOString()
  for (const row of rows) {
    const pageCount = db.prepare('SELECT COUNT(*) AS count FROM pages WHERE work_id = ?').get(row.work_id).count
    if (pageCount > 0) {
      db.prepare(`
        UPDATE upload_tasks
        SET status = 'done', progress = 100, stage = '完成', processed = ?, total = ?, error = NULL, updated_at = ?
        WHERE id = ?
      `).run(pageCount, Math.max(1, pageCount), updatedAt, row.id)
    }
  }
  if (rows.length > 0) {
    console.log(`Reconciled ${rows.length} upload task(s) that already produced pages`)
  }
}

const upload = multer({
  storage: {
    _handleFile: async (req, file, cb) => {
      const tempPath = path.join(storageDirs.uploads, `${Date.now()}-${randomUUID()}${path.extname(file.originalname)}`)
      const hash = createHash('sha256')
      const hashingStream = new Transform({
        transform(chunk, _encoding, callback) {
          hash.update(chunk)
          callback(null, chunk)
        },
      })
      const output = fs.createWriteStream(tempPath)
      try {
        await new Promise((resolve, reject) => {
          file.stream
            .on('error', reject)
            .pipe(hashingStream)
            .pipe(output)
            .on('error', reject)
            .on('finish', resolve)
        })
        cb(null, { path: tempPath, size: output.bytesWritten, hash: hash.digest('hex') })
      } catch (error) {
        fs.rmSync(tempPath, { force: true })
        cb(error instanceof Error ? error : new Error('upload write failed'))
      }
    },
    _removeFile: (_req, file, cb) => {
      if (file?.path) fs.rmSync(file.path, { force: true })
      cb(null)
    },
  },
})

const app = express()
app.use(cors())
app.use(express.json({ limit: '1gb' }))

const dirSize = (dir) => {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) total += dirSize(fullPath)
    else total += fs.statSync(fullPath).size
  }
  return total
}

app.get('/api/settings', (_req, res) => {
  const usage = {}
  for (const [key, dir] of Object.entries(storageDirs)) {
    usage[key] = dirSize(dir)
  }
  usage.total = Object.values(usage).reduce((sum, value) => sum + value, 0)
  res.json({
    storageDir,
    defaultStorageDir,
    dataDir,
    usage,
  })
})

app.get('/api/settings/browse', (req, res) => {
  const rawPath = String(req.query.path ?? '').trim()
  const current = rawPath
    ? path.resolve(rawPath)
    : (process.env.HOME || defaultStorageDir)
  if (!path.isAbsolute(current) || !fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
    res.status(400).json({ error: '目录不存在' })
    return
  }
  let directories = []
  try {
    directories = fs.readdirSync(current, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => path.join(current, entry.name))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    res.status(400).json({ error: '无法读取目录' })
    return
  }
  res.json({
    current,
    parent: path.dirname(current),
    directories,
  })
})

app.post('/api/settings/pick-folder', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', 'POSIX path of (choose folder)'])
    const selected = stdout.trim()
    if (!selected) {
      res.status(400).json({ error: '未选择文件夹' })
      return
    }
    res.json({ path: selected })
  } catch {
    res.status(400).json({ error: '无法打开系统文件夹选择器' })
  }
})

app.post('/api/settings/storage/migrate', (req, res) => {
  const raw = String(req.body?.storageDir ?? '').trim()
  if (!raw) {
    res.status(400).json({ error: '请输入新的存储目录' })
    return
  }
  const targetDir = path.resolve(raw)
  if (!path.isAbsolute(raw)) {
    res.status(400).json({ error: '存储目录必须是绝对路径' })
    return
  }
  if (targetDir === dataDir || targetDir === path.join(dataDir, 'app.db') || targetDir === storageDir) {
    res.status(400).json({ error: '请选择其他存储目录' })
    return
  }

  try {
    const newDirs = {
      uploads: path.join(targetDir, 'uploads'),
      thumbnails: path.join(targetDir, 'thumbnails'),
      previews: path.join(targetDir, 'previews'),
      originals: path.join(targetDir, 'originals'),
      sources: path.join(targetDir, 'sources'),
    }
    Object.values(newDirs).forEach((dir) => fs.mkdirSync(dir, { recursive: true }))
    const testFile = path.join(targetDir, '.normix-write-test')
    fs.writeFileSync(testFile, 'ok')
    fs.rmSync(testFile, { force: true })

    const oldStorageDir = storageDir
    for (const key of ['uploads', 'thumbnails', 'previews', 'originals', 'sources']) {
      const from = path.join(oldStorageDir, key)
      if (fs.existsSync(from)) {
        fs.cpSync(from, newDirs[key], { recursive: true, force: true })
      }
    }

    const updatedColumns = []
    for (const column of ['thumbnail_path', 'preview_path', 'original_path']) {
      const result = db.prepare(`UPDATE pages SET ${column} = replace(${column}, ?, ?) WHERE ${column} LIKE ?`).run(oldStorageDir, targetDir, `${oldStorageDir}%`)
      updatedColumns.push(result.changes)
    }
    const sourceResult = db.prepare('UPDATE works SET source_path = replace(source_path, ?, ?) WHERE source_path LIKE ?').run(oldStorageDir, targetDir, `${oldStorageDir}%`)

    applyStorageDir(targetDir)
    saveSettings()
    res.json({
      ok: true,
      storageDir,
      updatedPages: updatedColumns.reduce((sum, value) => sum + value, 0),
      updatedWorks: sourceResult.changes,
    })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '迁移失败' })
  }
})

const normalizePagePreviews = async () => {
  const pages = db.prepare('SELECT id, original_path, preview_path FROM pages').all()
  const before = dirSize(storageDirs.previews)
  let converted = 0
  let failed = 0
  let skipped = 0

  for (const page of pages) {
    const preview = resolveStoredPath(page.preview_path)
    const previewsRoot = path.resolve(storageDirs.previews)
    if (
      !preview ||
      !fs.existsSync(preview) ||
      !preview.startsWith(`${previewsRoot}${path.sep}`) ||
      path.extname(preview).toLowerCase() === '.webp'
    ) {
      skipped += 1
      continue
    }
    const source = resolveStoredPath(page.original_path)
    const input = source && fs.existsSync(source) ? source : preview
    const newPath = path.join(path.dirname(preview), `${path.basename(preview, path.extname(preview))}.webp`)
    try {
      await sharp(input, { limitInputPixels: false })
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 90, effort: 4 })
        .toFile(newPath)
      db.prepare('UPDATE pages SET preview_path = ? WHERE id = ?').run(newPath, page.id)
      fs.rmSync(preview, { force: true })
      converted += 1
    } catch {
      fs.rmSync(newPath, { force: true })
      failed += 1
    }
  }

  return {
    converted,
    failed,
    skipped,
    before,
    after: dirSize(storageDirs.previews),
  }
}

app.post('/api/settings/storage/normalize', async (_req, res) => {
  try {
    const result = await normalizePagePreviews()
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '规范化失败' })
  }
})

app.post('/api/settings/storage/clean-previews', (_req, res) => {
  try {
    const pages = db.prepare('SELECT id, preview_path, original_path FROM pages').all()
    const previewsRoot = path.resolve(storageDirs.previews)
    let deleted = 0
    let skipped = 0
    let freedBytes = 0

    for (const page of pages) {
      const preview = resolveStoredPath(page.preview_path)
      const original = resolveStoredPath(page.original_path)
      if (
        !preview ||
        !preview.startsWith(`${previewsRoot}${path.sep}`) ||
        !fs.existsSync(preview) ||
        !original ||
        !fs.existsSync(original)
      ) {
        skipped += 1
        continue
      }

      try {
        freedBytes += fs.statSync(preview).size
        fs.rmSync(preview, { force: true })
        db.prepare('UPDATE pages SET preview_path = ? WHERE id = ?').run(original, page.id)
        deleted += 1
      } catch {
        skipped += 1
      }
    }

    res.json({
      ok: true,
      deleted,
      skipped,
      freedBytes,
      previewsSize: dirSize(storageDirs.previews),
    })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '清理失败' })
  }
})

app.post('/api/settings/storage/clean-orphans', (_req, res) => {
  try {
    const result = cleanOrphanFiles()
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '清理失败' })
  }
})

app.post('/api/settings/storage/compact-pages', async (_req, res) => {
  try {
    const result = await compactPageOriginals()
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '压缩失败' })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/state', (_req, res) => {
  const row = db.prepare('SELECT data FROM app_state WHERE id = 1').get()
  if (!row) {
    res.json({ works: [], collections: [], empty: true })
    return
  }

  try {
    const data = JSON.parse(row.data)
    res.json({ ...data, empty: false })
  } catch {
    res.status(500).json({ error: 'database state is corrupted' })
  }
})

app.post('/api/state', (req, res) => {
  const { works = [], collections = [] } = req.body ?? {}
  if (!Array.isArray(works) || !Array.isArray(collections)) {
    res.status(400).json({ error: 'works and collections must be arrays' })
    return
  }

  const data = JSON.stringify({ works, collections })
  db.prepare(`
    INSERT INTO app_state (id, data) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data
  `).run(data)
  res.json({ ok: true })
})

const removeWorkFromLegacyState = (workId) => {
  const row = db.prepare('SELECT data FROM app_state WHERE id = 1').get()
  if (!row) return false
  try {
    const data = JSON.parse(row.data)
    if (!Array.isArray(data.works) || !data.works.some((work) => work.id === workId)) return false
    data.works = data.works.filter((work) => work.id !== workId)
    db.prepare('UPDATE app_state SET data = ? WHERE id = 1').run(JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

const markWorkDeletedInLegacyState = (workId, deletedAt) => {
  const row = db.prepare('SELECT data FROM app_state WHERE id = 1').get()
  if (!row) return false
  try {
    const data = JSON.parse(row.data)
    const index = (data.works ?? []).findIndex((work) => work.id === workId)
    if (index < 0) return false
    data.works[index] = { ...data.works[index], deleted_at: deletedAt, deletedAt }
    db.prepare('UPDATE app_state SET data = ? WHERE id = 1').run(JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

const restoreWorkInLegacyState = (workId) => {
  const row = db.prepare('SELECT data FROM app_state WHERE id = 1').get()
  if (!row) return false
  try {
    const data = JSON.parse(row.data)
    const index = (data.works ?? []).findIndex((work) => work.id === workId && work.deleted_at)
    if (index < 0) return false
    const { deleted_at: _deletedAt, deletedAt: _deletedAt2, ...rest } = data.works[index]
    data.works[index] = rest
    db.prepare('UPDATE app_state SET data = ? WHERE id = 1').run(JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

const legacyTrashWorks = () => {
  const row = db.prepare('SELECT data FROM app_state WHERE id = 1').get()
  if (!row) return []
  try {
    const data = JSON.parse(row.data)
    return (data.works ?? []).filter((work) => work.deleted_at || work.deletedAt)
  } catch {
    return []
  }
}

const getPagination = (query, fallback = 100) => {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(200, Math.max(1, Number(query.limit) || fallback))
  return { page, limit, offset: (page - 1) * limit }
}

const resolveStoredPath = (filePath) => {
  if (!filePath || filePath.startsWith('data:')) return null
  return path.isAbsolute(filePath) ? filePath : path.resolve(storageDir, filePath)
}

const cleanupUploadedFiles = (uploadPath, workId) => {
  try {
    const uploadRoot = path.resolve(storageDirs.uploads)
    if (uploadPath) {
      const resolved = path.resolve(uploadPath)
      if (resolved.startsWith(`${uploadRoot}${path.sep}`) && fs.existsSync(resolved)) {
        fs.rmSync(resolved, { force: true })
      }
    }
    if (!workId) return
    const prefix = `${workId}-`
    for (const file of fs.existsSync(uploadRoot) ? fs.readdirSync(uploadRoot) : []) {
      if (file.startsWith(prefix)) {
        fs.rmSync(path.join(uploadRoot, file), { force: true })
      }
    }
    const work = db.prepare('SELECT source_path FROM works WHERE id = ?').get(workId)
    const sourcesRoot = path.resolve(storageDirs.sources)
    const sourcePath = work?.source_path ? resolveStoredPath(work.source_path) : null
    if (sourcePath && !sourcePath.startsWith(`${sourcesRoot}${path.sep}`)) {
      db.prepare('UPDATE works SET source_path = NULL WHERE id = ?').run(workId)
    }
  } catch (error) {
    console.error('Upload cleanup failed (best effort):', error)
  }
}

const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })

const sendStoredFile = (res, filePath, cache = false) => {
  const resolved = resolveStoredPath(filePath)
  if (!resolved || !fs.existsSync(resolved)) {
    res.status(404).json({ error: 'file not found' })
    return
  }
  if (cache) res.setHeader('Cache-Control', 'public, max-age=86400')
  res.sendFile(resolved)
}

const previewOptionsFromQuery = (query) => {
  const rawWidth = String(query.width ?? '').trim().toLowerCase()
  const requestedWidth = rawWidth === '' || rawWidth === 'original' ? 0 : Number.parseInt(rawWidth, 10)
  const width = Number.isFinite(requestedWidth) ? Math.min(4096, Math.max(0, requestedWidth)) : 0
  const requestedQuality = Number(query.quality)
  const quality = Number.isFinite(requestedQuality) ? Math.min(95, Math.max(55, Math.round(requestedQuality))) : 90
  return { width, quality }
}

const sendPreviewFromOriginal = async (req, res, sourcePath, pageId) => {
  const resolved = resolveStoredPath(sourcePath)
  if (!resolved || !fs.existsSync(resolved)) return false

  const animated = await isAnimatedImageFile(resolved)
  if (animated) {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
    sendStoredFile(res, resolved, false)
    return true
  }

  const ext = path.extname(resolved).toLowerCase()
  const noExplicitWidth = req.query.width === undefined || String(req.query.width).trim() === '' || String(req.query.width).trim().toLowerCase() === 'original'
  if (noExplicitWidth && (ext === '.jpg' || ext === '.jpeg' || ext === '.webp')) {
    sendStoredFile(res, resolved, true)
    return true
  }

  const { width, quality } = previewOptionsFromQuery(req.query)
  const stat = fs.statSync(resolved)
  const etag = `"${pageId}-${stat.size}-${stat.mtimeMs}-${width}-${quality}-webp"`
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
  res.setHeader('ETag', etag)
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end()
    return true
  }

  let pipeline = sharp(resolved, { limitInputPixels: false })
  if (width > 0) pipeline = pipeline.resize({ width, withoutEnlargement: true })
  const buffer = await pipeline.webp({ quality, effort: 4 }).toBuffer()
  res.setHeader('Content-Type', 'image/webp')
  res.setHeader('Content-Length', buffer.length)
  res.send(buffer)
  return true
}

const cleanOrphanFiles = () => {
  if (activeUploads > 0) return { deleted: 0, freedBytes: 0 }
  const refs = new Set()
  for (const row of db.prepare('SELECT original_path, preview_path, thumbnail_path FROM pages').all()) {
    for (const filePath of [row.original_path, row.preview_path, row.thumbnail_path]) {
      const resolved = resolveStoredPath(filePath)
      if (resolved) refs.add(path.resolve(resolved))
    }
  }
  for (const row of db.prepare('SELECT source_path FROM works WHERE source_path IS NOT NULL').all()) {
    const resolved = resolveStoredPath(row.source_path)
    if (resolved) refs.add(path.resolve(resolved))
  }

  let deleted = 0
  let freedBytes = 0
  for (const key of ['originals', 'thumbnails', 'previews', 'sources']) {
    const root = path.resolve(storageDirs[key])
    if (!fs.existsSync(root)) continue
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const filePath = path.join(root, entry.name)
      if (refs.has(path.resolve(filePath))) continue
      try {
        freedBytes += fs.statSync(filePath).size
        fs.rmSync(filePath, { force: true })
        deleted += 1
      } catch {
        // Ignore files that disappear while scanning.
      }
    }
  }
  return { deleted, freedBytes }
}

const compactPageOriginals = async () => {
  if (activeUploads > 0) return { compressed: 0, skipped: 0, freedBytes: 0 }
  const pages = db.prepare(`
    SELECT p.id, p.original_path, p.preview_path
    FROM pages p
    JOIN works w ON w.id = p.work_id
    WHERE w.kind IN ('PDF', 'PPT', 'ZIP')
  `).all()
  let compressed = 0
  let skipped = 0
  let freedBytes = 0

  for (const page of pages) {
    const original = resolveStoredPath(page.original_path)
    if (!original || !fs.existsSync(original)) {
      skipped += 1
      continue
    }

    if (path.extname(original).toLowerCase() === '.webp') {
      try {
        const metadata = await sharp(original, { animated: true, limitInputPixels: false }).metadata()
        const animated = (metadata.pages ?? 1) > 1
        if ((metadata.width ?? 0) <= (animated ? 1280 : 1920)) {
          skipped += 1
          continue
        }
      } catch {
        skipped += 1
        continue
      }
    }

    if (path.extname(original).toLowerCase() === '.gif') {
      try {
        const animated = await isAnimatedImageFile(original)
        if (animated) {
          skipped += 1
          continue
        }
      } catch {
        skipped += 1
        continue
      }
    }

    const webpPath = path.join(storageDirs.originals, `${page.id}.webp`)
    try {
      const animated = await isAnimatedImageFile(original)
      const before = fs.statSync(original).size
      let pipeline = sharp(original, { animated, limitInputPixels: false })
      pipeline = pipeline.resize({ width: animated ? 1280 : 1920, withoutEnlargement: true })
      await pipeline.webp({ quality: animated ? 88 : 92, effort: 4 }).toFile(webpPath)
      db.prepare('UPDATE pages SET original_path = ?, preview_path = ? WHERE id = ?').run(webpPath, webpPath, page.id)
      fs.rmSync(original, { force: true })
      freedBytes += before
      compressed += 1
    } catch {
      fs.rmSync(webpPath, { force: true })
      skipped += 1
    }
  }
  return { compressed, skipped, freedBytes }
}

const permanentlyDeleteWork = (workId) => {
  const work = db.prepare('SELECT * FROM works WHERE id = ? AND deleted_at IS NOT NULL').get(workId)
  if (!work) return false
  const pages = db.prepare('SELECT * FROM pages WHERE work_id = ?').all(workId)
  db.prepare('DELETE FROM page_tags WHERE page_id IN (SELECT id FROM pages WHERE work_id = ?)').run(workId)
  db.prepare('DELETE FROM page_folders WHERE page_id IN (SELECT id FROM pages WHERE work_id = ?)').run(workId)
  db.prepare('DELETE FROM work_tags WHERE work_id = ?').run(workId)
  db.prepare('DELETE FROM pages WHERE work_id = ?').run(workId)
  db.prepare('DELETE FROM upload_tasks WHERE work_id = ?').run(workId)
  db.prepare('DELETE FROM works WHERE id = ?').run(workId)
  const sourcePath = resolveStoredPath(work.source_path)
  if (sourcePath && fs.existsSync(sourcePath)) fs.rmSync(sourcePath, { force: true })
  for (const page of pages) {
    for (const filePath of [page.thumbnail_path, page.preview_path, page.original_path]) {
      const resolved = resolveStoredPath(filePath)
      if (resolved && fs.existsSync(resolved)) fs.rmSync(resolved, { force: true })
    }
  }
  cleanupUploadedFiles(null, workId)
  return true
}

const pageTags = (pageId) => {
  const rows = db.prepare(`
    SELECT t.name FROM tags t
    JOIN page_tags pt ON pt.tag_id = t.id
    WHERE pt.page_id = ? AND t.scope = 'page'
    ORDER BY t.name
  `).all(pageId)
  return rows.map((row) => row.name)
}

const pageTagIds = (pageId) => {
  const rows = db.prepare(`
    SELECT pt.tag_id FROM page_tags pt
    JOIN tags t ON t.id = pt.tag_id
    WHERE pt.page_id = ? AND t.scope = 'page'
  `).all(pageId)
  return rows.map((row) => row.tag_id)
}

const findTagId = (name, scope) => {
  const existing = db.prepare('SELECT id FROM tags WHERE name = ? AND scope = ?').get(name, scope)
  return existing?.id ?? null
}

const getOrCreateTagId = (name, group = '自定义', scope = 'work') => {
  const existingId = findTagId(name, scope)
  if (existingId) return existingId
  const tagId = `t-${randomUUID()}`
  db.prepare('INSERT INTO tags (id, name, tag_group, scope) VALUES (?, ?, ?, ?)').run(tagId, name, group, scope)
  return tagId
}

const addPageTag = (pageId, name) => {
  if (!pageId || !name) return
  const tagId = getOrCreateTagId(name, '页面', 'page')
  db.prepare('INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES (?, ?)').run(pageId, tagId)
}

const applyCoverBackTags = (workId, pageCount) => {
  if (pageCount > 0) addPageTag(`${workId}-p1`, '封面')
  if (pageCount > 1) addPageTag(`${workId}-p${pageCount}`, '封底')
}

const pageFolderIds = (pageId) => {
  const rows = db.prepare('SELECT folder_id FROM page_folders WHERE page_id = ?').all(pageId)
  return rows.map((row) => row.folder_id)
}

const workTags = (workId) => {
  const rows = db.prepare(`
    SELECT t.name FROM tags t
    JOIN work_tags wt ON wt.tag_id = t.id
    WHERE wt.work_id = ? AND t.scope = 'work'
    ORDER BY t.name
  `).all(workId)
  return rows.map((row) => row.name)
}

const workTagIds = (workId) => {
  const rows = db.prepare(`
    SELECT wt.tag_id FROM work_tags wt
    JOIN tags t ON t.id = wt.tag_id
    WHERE wt.work_id = ? AND t.scope = 'work'
  `).all(workId)
  return rows.map((row) => row.tag_id)
}

const workFileSize = (work) => {
  const resolved = resolveStoredPath(work?.source_path)
  if (resolved && fs.existsSync(resolved)) {
    try {
      return fs.statSync(resolved).size
    } catch {
      return 0
    }
  }
  const pages = db.prepare('SELECT original_path FROM pages WHERE work_id = ?').all(work.id)
  return pages.reduce((total, page) => {
    const pagePath = resolveStoredPath(page.original_path)
    if (!pagePath || !fs.existsSync(pagePath)) return total
    try {
      return total + fs.statSync(pagePath).size
    } catch {
      return total
    }
  }, 0)
}

const getTagTree = (scope = null) => {
  const rows = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(DISTINCT wt.work_id) FROM work_tags wt WHERE wt.tag_id = t.id) AS work_count,
      (SELECT COUNT(DISTINCT pt.page_id) FROM page_tags pt WHERE pt.tag_id = t.id) AS page_count
    FROM tags t
    WHERE (? IS NULL OR t.scope = ?)
    ORDER BY t.tag_group, COALESCE(t.parent_id, ''), t.sort_order, t.name
  `).all(scope, scope)
  const nodes = new Map(rows.map((row) => {
    const { tag_group: tagGroup, ...rest } = row
    return [row.id, { ...rest, group: tagGroup, children: [] }]
  }))
  const roots = []
  for (const node of nodes.values()) {
    if (node.parent_id && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id).children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}


app.get('/api/works', (req, res) => {
  const { page, limit, offset } = getPagination(req.query)
  const conditions = ['w.deleted_at IS NULL']
  const params = []
  const keyword = String(req.query.keyword ?? '').trim().toLowerCase()
  if (keyword) {
    conditions.push('(LOWER(w.title) LIKE ? OR LOWER(w.file_name) LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`)
  }
  if (req.query.tag) {
    conditions.push(`EXISTS (
      SELECT 1 FROM work_tags wt
      JOIN tags t ON t.id = wt.tag_id
      WHERE wt.work_id = w.id AND t.name = ? AND t.scope = 'work'
    )`)
    params.push(String(req.query.tag))
  }
  if (req.query.tagIds) {
    const tagIds = String(req.query.tagIds).split(',').map((id) => id.trim()).filter(Boolean)
    if (tagIds.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM work_tags wt
        JOIN tags t ON t.id = wt.tag_id
        WHERE wt.work_id = w.id AND t.scope = 'work' AND wt.tag_id IN (${tagIds.map(() => '?').join(', ')})
      )`)
      params.push(...tagIds)
    }
  }
  if (req.query.folder_id) {
    conditions.push(`EXISTS (
      SELECT 1 FROM page_folders pf
      JOIN pages p ON p.id = pf.page_id
      WHERE p.work_id = w.id AND pf.folder_id = ?
    )`)
    params.push(String(req.query.folder_id))
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) AS count FROM works w ${where}`).get(...params).count
  const works = db.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM pages p WHERE p.work_id = w.id) AS page_count,
      (
        (SELECT COUNT(*) FROM pages p WHERE p.work_id = w.id) = 0
        AND EXISTS (
          SELECT 1 FROM upload_tasks t
          WHERE t.work_id = w.id AND t.status = 'error'
        )
      ) AS failed
    FROM works w
    ${where}
    ORDER BY w.created_at DESC, w.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)
  if (works.length === 0 && !keyword && !req.query.tag && !req.query.tagIds && !req.query.folder_id) {
    const legacyRow = db.prepare('SELECT data FROM app_state WHERE id = 1').get()
    if (legacyRow) {
      try {
        const legacy = JSON.parse(legacyRow.data)
        const legacyWorks = (legacy.works ?? [])
          .filter((work) => !work.deleted_at && !work.deletedAt)
          .map((work) => ({
          ...work,
          file_name: work.file_name || work.fileName || '',
          fileName: work.file_name || work.fileName || '',
          kind: work.kind || 'IMAGE',
          favorite: Boolean(work.favorite),
          failed: false,
          fileSize: 0,
          tags: work.tags ?? [],
          tagIds: [],
          }))
        res.json({ works: legacyWorks, total: legacyWorks.length, page, limit })
        return
      } catch {
        // Fall through to the empty response if legacy state is malformed.
      }
    }
  }
  res.json({
    works: works.map((work) => ({
      ...work,
      fileName: work.file_name,
      favorite: Boolean(work.favorite),
      failed: Boolean(work.failed),
      fileSize: workFileSize(work),
      tags: workTags(work.id),
      tagIds: workTagIds(work.id),
    })),
    total,
    page,
    limit,
  })
})

app.get('/api/works/:id', (req, res) => {
  const work = db.prepare(`
    SELECT w.*,
      (
        (SELECT COUNT(*) FROM pages p WHERE p.work_id = w.id) = 0
        AND EXISTS (
          SELECT 1 FROM upload_tasks t
          WHERE t.work_id = w.id AND t.status = 'error'
        )
      ) AS failed
    FROM works w
    WHERE w.id = ?
  `).get(req.params.id)
  if (!work) {
    const legacyRow = db.prepare('SELECT data FROM app_state WHERE id = 1').get()
    if (legacyRow) {
      try {
        const legacy = JSON.parse(legacyRow.data)
        const legacyWork = (legacy.works ?? []).find((item) => item.id === req.params.id)
        if (legacyWork) {
          res.json({
            ...legacyWork,
            file_name: legacyWork.file_name || legacyWork.fileName || '',
            fileName: legacyWork.file_name || legacyWork.fileName || '',
            kind: legacyWork.kind || 'IMAGE',
            favorite: Boolean(legacyWork.favorite),
            failed: false,
            fileSize: 0,
            tags: legacyWork.tags ?? [],
            tagIds: [],
            pages: legacyWork.pages ?? [],
          })
          return
        }
      } catch {
        // Fall through to 404 if legacy state is malformed.
      }
    }
    res.status(404).json({ error: 'work not found' })
    return
  }
  const pages = db.prepare('SELECT * FROM pages WHERE work_id = ? ORDER BY page_no').all(work.id)
  res.json({
    ...work,
    fileName: work.file_name,
    favorite: Boolean(work.favorite),
    failed: Boolean(work.failed),
    fileSize: workFileSize(work),
    tags: workTags(work.id),
    tagIds: workTagIds(work.id),
    pages: pages.map((page) => ({ ...page, tags: pageTags(page.id), tagIds: pageTagIds(page.id) })),
  })
})

app.patch('/api/works/:id', (req, res) => {
  const work = db.prepare('SELECT * FROM works WHERE id = ?').get(req.params.id)
  if (!work) {
    res.status(404).json({ error: 'work not found' })
    return
  }
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : work.title
  const description = typeof req.body.description === 'string' ? req.body.description : work.description
  const rating = Number.isFinite(Number(req.body.rating)) ? Math.max(0, Math.min(5, Number(req.body.rating))) : work.rating
  const favorite = typeof req.body.favorite === 'boolean' ? Number(req.body.favorite) : work.favorite
  db.prepare('UPDATE works SET title = ?, description = ?, rating = ?, favorite = ? WHERE id = ?')
    .run(title, description, rating, favorite, work.id)
  res.json({
    ...db.prepare('SELECT * FROM works WHERE id = ?').get(work.id),
    favorite: Boolean(favorite),
    fileSize: workFileSize(work),
    tags: workTags(work.id),
    tagIds: workTagIds(work.id),
  })
})

app.post('/api/works/:id/tags', (req, res) => {
  const work = db.prepare('SELECT id FROM works WHERE id = ?').get(req.params.id)
  if (!work) {
    res.status(400).json({ error: 'invalid work or tag' })
    return
  }
  const tagIds = Array.isArray(req.body.tagIds) ? req.body.tagIds.map(String) : []
  const tagId = req.body.tagId ? String(req.body.tagId) : ''
  const name = String(req.body.tag ?? '').trim()
  const insert = db.prepare('INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)')
  const finalTagIds = new Set()
  let missingTag = false
  for (const id of tagIds) {
    const tag = db.prepare(`SELECT id FROM tags WHERE id = ? AND scope = 'work'`).get(id)
    if (tag) {
      insert.run(work.id, tag.id)
      finalTagIds.add(tag.id)
    }
  }
  if (tagId) {
    const tag = db.prepare(`SELECT id FROM tags WHERE id = ? AND scope = 'work'`).get(tagId)
    if (tag) {
      insert.run(work.id, tag.id)
      finalTagIds.add(tag.id)
    }
  }
  if (name) {
    const existingId = findTagId(name, 'work')
    if (existingId) {
      insert.run(work.id, existingId)
      finalTagIds.add(existingId)
    } else {
      missingTag = true
    }
  }
  const existing = workTagIds(work.id)
  existing.forEach((id) => finalTagIds.add(id))
  res.json({ tags: workTags(work.id), tagIds: Array.from(finalTagIds), missingTag })
})

app.delete('/api/works/:id/tags/:tagName', (req, res) => {
  const raw = decodeURIComponent(req.params.tagName)
  const byId = db.prepare(`SELECT id FROM tags WHERE id = ? AND scope = 'work'`).get(raw)
  const tagId = byId?.id ?? db.prepare(`SELECT id FROM tags WHERE name = ? AND scope = 'work'`).get(raw)?.id
  if (tagId) {
    db.prepare('DELETE FROM work_tags WHERE work_id = ? AND tag_id = ?').run(req.params.id, tagId)
  }
  res.json({ tags: workTags(req.params.id), tagIds: workTagIds(req.params.id) })
})

app.post('/api/works/tags/batch', (req, res) => {
  const workIds = Array.isArray(req.body.workIds) ? req.body.workIds.map(String) : []
  const tagIds = Array.isArray(req.body.tagIds) ? req.body.tagIds.map(String) : []
  const action = req.body.action === 'remove' ? 'remove' : 'add'
  if (workIds.length === 0 || tagIds.length === 0) {
    res.status(400).json({ error: 'workIds and tagIds are required' })
    return
  }
  const insert = db.prepare('INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)')
  const remove = db.prepare('DELETE FROM work_tags WHERE work_id = ? AND tag_id = ?')
  for (const workId of workIds) {
    for (const tagId of tagIds) {
      const tag = db.prepare(`SELECT id FROM tags WHERE id = ? AND scope = 'work'`).get(tagId)
      if (!tag) continue
      if (action === 'remove') remove.run(workId, tag.id)
      else insert.run(workId, tag.id)
    }
  }
  res.json({ ok: true })
})

app.delete('/api/works/:id', (req, res) => {
  const work = db.prepare('SELECT id FROM works WHERE id = ?').get(req.params.id)
  if (!work) {
    const deletedAt = new Date().toISOString()
    if (markWorkDeletedInLegacyState(req.params.id, deletedAt)) {
      res.json({ ok: true, deletedAt })
      return
    }
    res.status(404).json({ error: 'work not found' })
    return
  }
  const deletedAt = new Date().toISOString()
  db.prepare('UPDATE works SET deleted_at = ? WHERE id = ?').run(deletedAt, work.id)
  markWorkDeletedInLegacyState(work.id, deletedAt)
  res.json({ ok: true, deletedAt })
})

app.get('/api/trash', (_req, res) => {
  const works = db.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM pages p WHERE p.work_id = w.id) AS page_count,
      (SELECT p.id FROM pages p WHERE p.work_id = w.id ORDER BY p.page_no LIMIT 1) AS first_page_id
    FROM works w
    WHERE w.deleted_at IS NOT NULL
    ORDER BY w.deleted_at DESC, w.id DESC
  `).all()
  const legacyWorks = legacyTrashWorks().map((work) => ({
    ...work,
    file_name: work.file_name || work.fileName || '',
    fileName: work.file_name || work.fileName || '',
    deleted_at: work.deleted_at || work.deletedAt || null,
    page_count: work.page_count || work.pages?.length || 0,
    favorite: Boolean(work.favorite),
    fileSize: 0,
    tags: work.tags ?? [],
    tagIds: [],
  }))
  res.json({
    works: [...legacyWorks, ...works.map((work) => ({
      ...work,
      favorite: Boolean(work.favorite),
      fileSize: workFileSize(work),
      tags: workTags(work.id),
      coverPageId: work.first_page_id ?? null,
      coverThumbnailUrl: work.first_page_id ? `/api/pages/${work.first_page_id}/thumbnail` : null,
      coverPreviewUrl: work.first_page_id ? `/api/pages/${work.first_page_id}/preview?v=1` : null,
    }))],
  })
})

app.get('/api/trash/:id', (req, res) => {
  const work = db.prepare('SELECT * FROM works WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id)
  if (!work) {
    const legacyWork = legacyTrashWorks().find((item) => item.id === req.params.id)
    if (legacyWork) {
      res.json({
        ...legacyWork,
        file_name: legacyWork.file_name || legacyWork.fileName || '',
        fileName: legacyWork.file_name || legacyWork.fileName || '',
        deleted_at: legacyWork.deleted_at || legacyWork.deletedAt || null,
        tags: legacyWork.tags ?? [],
        pages: legacyWork.pages ?? [],
      })
      return
    }
    res.status(404).json({ error: 'work not found in trash' })
    return
  }
  const pages = db.prepare('SELECT * FROM pages WHERE work_id = ? ORDER BY page_no').all(work.id)
  res.json({
    ...work,
    tags: workTags(work.id),
    pages: pages.map((page) => ({
      ...page,
      tags: pageTags(page.id),
      thumbnailUrl: `/api/pages/${page.id}/thumbnail`,
      previewUrl: `/api/pages/${page.id}/preview?v=1`,
      originalUrl: `/api/pages/${page.id}/original?v=1`,
    })),
  })
})

app.post('/api/trash/:id/restore', (req, res) => {
  const result = db.prepare('UPDATE works SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL').run(req.params.id)
  if (result.changes === 0) {
    if (restoreWorkInLegacyState(req.params.id)) {
      res.json({ ok: true })
      return
    }
    res.status(404).json({ error: 'work not found in trash' })
    return
  }
  res.json({ ok: true })
})

app.delete('/api/trash/:id', (req, res) => {
  const deleted = permanentlyDeleteWork(req.params.id)
  if (!deleted) {
    if (removeWorkFromLegacyState(req.params.id)) {
      res.json({ ok: true })
      return
    }
    res.status(404).json({ error: 'work not found' })
    return
  }
  res.json({ ok: true })
})

app.delete('/api/trash', (_req, res) => {
  const works = db.prepare('SELECT id FROM works WHERE deleted_at IS NOT NULL').all()
  const legacyWorks = legacyTrashWorks()
  for (const work of legacyWorks) removeWorkFromLegacyState(work.id)
  works.forEach((work) => permanentlyDeleteWork(work.id))
  res.json({ ok: true, deleted: works.length + legacyWorks.length })
})

app.get('/api/folders', (_req, res) => {
  const folders = db.prepare(`
    SELECT f.*, (
      SELECT COUNT(*) FROM page_folders pf
      JOIN pages p ON p.id = pf.page_id
      JOIN works w ON w.id = p.work_id
      WHERE pf.folder_id = f.id AND w.deleted_at IS NULL
    ) AS page_count
    FROM folders f
    ORDER BY COALESCE(f.parent_id, ''), f.sort_order, f.created_at
  `).all()
  res.json({ folders })
})

app.post('/api/folders', (req, res) => {
  const name = String(req.body.name ?? '').trim() || '新文件夹'
  const parentId = req.body.parentId ? String(req.body.parentId) : null
  const id = req.body.id ? String(req.body.id) : `f-${Date.now()}`
  const sortOrder = Number(db.prepare('SELECT COUNT(*) AS count FROM folders WHERE parent_id IS ?').get(parentId).count)
  db.prepare(`
    INSERT OR REPLACE INTO folders (id, name, parent_id, description, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM folders WHERE id = ?), ?))
  `).run(id, name, parentId, String(req.body.description ?? ''), sortOrder, id, new Date().toISOString())
  res.status(201).json(db.prepare('SELECT * FROM folders WHERE id = ?').get(id))
})

app.patch('/api/folders/:id', (req, res) => {
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id)
  if (!folder) {
    res.status(404).json({ error: 'folder not found' })
    return
  }
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : folder.name
  const description = typeof req.body.description === 'string' ? req.body.description : folder.description
  const parentId = typeof req.body.parentId === 'string' ? req.body.parentId : folder.parent_id
  const sortOrder = Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : folder.sort_order
  db.prepare('UPDATE folders SET name = ?, description = ?, parent_id = ?, sort_order = ? WHERE id = ?')
    .run(name, description, parentId, sortOrder, folder.id)
  res.json(db.prepare('SELECT * FROM folders WHERE id = ?').get(folder.id))
})

app.delete('/api/folders/:id', (req, res) => {
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id)
  if (!folder) {
    res.status(404).json({ error: 'folder not found' })
    return
  }
  db.prepare('UPDATE folders SET parent_id = ? WHERE parent_id = ?').run(folder.parent_id, folder.id)
  db.prepare('DELETE FROM page_folders WHERE folder_id = ?').run(folder.id)
  db.prepare('DELETE FROM folders WHERE id = ?').run(folder.id)
  res.json({ ok: true, deleted: 1 })
})

app.post('/api/folders/reorder', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : []
  const update = db.prepare('UPDATE folders SET sort_order = ? WHERE id = ?')
  ids.forEach((id, index) => update.run(index, id))
  res.json({ ok: true })
})

app.get('/api/pages', (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 200)
  const conditions = ['w.deleted_at IS NULL']
  const params = []
  if (req.query.work_id) {
    conditions.push('p.work_id = ?')
    params.push(String(req.query.work_id))
  }
  if (req.query.folder_id) {
    conditions.push('EXISTS (SELECT 1 FROM page_folders pf WHERE pf.page_id = p.id AND pf.folder_id = ?)')
    params.push(String(req.query.folder_id))
  }
  if (req.query.tag) {
    conditions.push('EXISTS (SELECT 1 FROM page_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.page_id = p.id AND t.name = ? AND t.scope = \'page\')')
    params.push(String(req.query.tag))
  }
  if (req.query.tagIds) {
    const tagIds = String(req.query.tagIds).split(',').map((id) => id.trim()).filter(Boolean)
    if (tagIds.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM page_tags pt
        JOIN tags t ON t.id = pt.tag_id
        WHERE pt.page_id = p.id AND t.scope = 'page' AND pt.tag_id IN (${tagIds.map(() => '?').join(', ')})
      )`)
      params.push(...tagIds)
    }
  }
  const keyword = String(req.query.keyword ?? '').trim().toLowerCase()
  if (keyword) {
    conditions.push('(LOWER(p.title) LIKE ? OR LOWER(p.id) LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = db.prepare(`
    SELECT COUNT(*) AS count FROM pages p
    JOIN works w ON w.id = p.work_id
    ${where}
  `).get(...params).count
  const pages = db.prepare(`
    SELECT p.*, w.title AS work_title, w.kind AS work_kind
    FROM pages p
    JOIN works w ON w.id = p.work_id
    ${where}
    ORDER BY p.work_id, p.page_no
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)
  res.json({
    pages: pages.map((page) => ({
      ...page,
      tags: pageTags(page.id),
      tagIds: pageTagIds(page.id),
      folderIds: pageFolderIds(page.id),
    })),
    total,
    page,
    limit,
  })
})

app.get('/api/pages/:id', (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id)
  if (!page) {
    res.status(404).json({ error: 'page not found' })
    return
  }
  res.json({ ...page, tags: pageTags(page.id), tagIds: pageTagIds(page.id), folderIds: pageFolderIds(page.id) })
})

app.get('/api/pages/:id/thumbnail', (req, res) => {
  const page = db.prepare('SELECT thumbnail_path FROM pages WHERE id = ?').get(req.params.id)
  sendStoredFile(res, page?.thumbnail_path, true)
})

app.get('/api/pages/:id/preview', (req, res) => {
  const page = db.prepare('SELECT original_path, preview_path FROM pages WHERE id = ?').get(req.params.id)
  void (async () => {
    try {
      if (await sendPreviewFromOriginal(req, res, page?.original_path, req.params.id)) return
      sendStoredFile(res, page?.preview_path, true)
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: error instanceof Error ? error.message : '预览生成失败' })
      }
    }
  })()
})

app.get('/api/pages/:id/original', (req, res) => {
  const page = db.prepare('SELECT original_path FROM pages WHERE id = ?').get(req.params.id)
  sendStoredFile(res, page?.original_path)
})

app.post('/api/pages/:id/rate', (req, res) => {
  const rating = Math.max(0, Math.min(5, Number(req.body.rating) || 0))
  const result = db.prepare('UPDATE pages SET rating = ? WHERE id = ?').run(rating, req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ error: 'page not found' })
    return
  }
  res.json({ ok: true })
})

app.get('/api/tags', (req, res) => {
  const scope = req.query.scope === 'page' ? 'page' : req.query.scope === 'work' ? 'work' : null
  const tags = db.prepare(`
    SELECT t.id, t.name, t.parent_id, t.tag_group, t.color, t.scope,
      (SELECT COUNT(DISTINCT wt.work_id) FROM work_tags wt WHERE wt.tag_id = t.id) AS work_count,
      (SELECT COUNT(DISTINCT pt.page_id) FROM page_tags pt WHERE pt.tag_id = t.id) AS page_count
    FROM tags t
    WHERE (? IS NULL OR t.scope = ?)
    ORDER BY t.scope, t.tag_group, t.sort_order, t.name
  `).all(scope, scope)
  res.json({ tags })
})

app.get('/api/tags/tree', (req, res) => {
  const scope = req.query.scope === 'page' ? 'page' : req.query.scope === 'work' ? 'work' : null
  res.json({ tags: getTagTree(scope) })
})

app.post('/api/tags', (req, res) => {
  const name = String(req.body.name ?? '').trim()
  if (!name) {
    res.status(400).json({ error: 'tag name is required' })
    return
  }
  const scope = req.body.scope === 'page' ? 'page' : req.body.scope === 'work' ? 'work' : (req.body.group === '页面' ? 'page' : 'work')
  const parentId = req.body.parentId ? String(req.body.parentId) : null
  if (parentId) {
    const parent = db.prepare('SELECT id, scope FROM tags WHERE id = ?').get(parentId)
    if (!parent || parent.scope !== scope) {
      res.status(400).json({ error: 'parent tag scope does not match' })
      return
    }
  }
  const id = `t-${randomUUID()}`
  db.prepare(`
    INSERT INTO tags (id, name, parent_id, tag_group, color, sort_order, scope)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    parentId,
    String(req.body.group ?? (scope === 'page' ? '页面' : '自定义')),
    req.body.color ? String(req.body.color) : null,
    Number(req.body.sortOrder) || 0,
    scope,
  )
  const created = db.prepare('SELECT * FROM tags WHERE id = ?').get(id)
  res.status(201).json({ ...created, scope })
})

app.patch('/api/tags/:id', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id)
  if (!tag) {
    res.status(404).json({ error: 'tag not found' })
    return
  }
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : tag.name
  if (!name) {
    res.status(400).json({ error: 'tag name is required' })
    return
  }
  const parentId = typeof req.body.parentId === 'string' ? req.body.parentId : tag.parent_id
  if (parentId === tag.id) {
    res.status(400).json({ error: 'tag cannot be its own parent' })
    return
  }
  if (parentId) {
    const parent = db.prepare('SELECT id, scope FROM tags WHERE id = ?').get(parentId)
    if (!parent || parent.scope !== tag.scope) {
      res.status(400).json({ error: 'parent tag scope does not match' })
      return
    }
  }
  db.prepare(`
    UPDATE tags SET name = ?, parent_id = ?, tag_group = ?, color = ?, sort_order = ?
    WHERE id = ?
  `).run(
    name,
    parentId,
    typeof req.body.group === 'string' ? req.body.group : tag.tag_group,
    typeof req.body.color === 'string' ? req.body.color : tag.color,
    Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : tag.sort_order,
    tag.id,
  )
  res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id))
})

app.post('/api/tags/:id/merge', (req, res) => {
  const source = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id)
  const targetName = String(req.body.targetName ?? '').trim()
  const target = targetName ? db.prepare('SELECT id FROM tags WHERE name = ? AND scope = ?').get(targetName, source?.scope) : null
  if (!source || !target || target.id === source.id) {
    res.status(400).json({ error: 'invalid merge target' })
    return
  }
  db.prepare(`
    INSERT OR IGNORE INTO work_tags (work_id, tag_id)
    SELECT work_id, ? FROM work_tags WHERE tag_id = ?
  `).run(target.id, source.id)
  db.prepare('DELETE FROM work_tags WHERE tag_id = ?').run(source.id)
  db.prepare(`
    INSERT OR IGNORE INTO page_tags (page_id, tag_id)
    SELECT page_id, ? FROM page_tags WHERE tag_id = ?
  `).run(target.id, source.id)
  db.prepare('DELETE FROM page_tags WHERE tag_id = ?').run(source.id)
  db.prepare('UPDATE tags SET parent_id = ? WHERE parent_id = ?').run(target.id, source.id)
  db.prepare('DELETE FROM tags WHERE id = ?').run(source.id)
  res.json({ ok: true })
})

app.delete('/api/tags/:id', (req, res) => {
  const tag = db.prepare('SELECT id, scope FROM tags WHERE id = ?').get(req.params.id)
  if (!tag) {
    res.status(404).json({ error: 'tag not found' })
    return
  }
  db.prepare('UPDATE tags SET parent_id = NULL WHERE parent_id = ? AND scope = ?').run(tag.id, tag.scope)
  if (tag.scope === 'page') db.prepare('DELETE FROM page_tags WHERE tag_id = ?').run(tag.id)
  if (tag.scope === 'work') db.prepare('DELETE FROM work_tags WHERE tag_id = ?').run(tag.id)
  db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id)
  res.json({ ok: true })
})

app.post('/api/tags/reorder', (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : []
  const scope = req.body.scope === 'page' ? 'page' : 'work'
  const update = db.prepare(`UPDATE tags SET parent_id = ?, sort_order = ? WHERE id = ? AND scope = ?`)
  items.forEach((item, index) => {
    if (!item?.id) return
    const sortOrder = Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index
    update.run(item.parentId ? String(item.parentId) : null, sortOrder, String(item.id), scope)
  })
  res.json({ ok: true })
})

app.get('/api/tags/:id/resources', (req, res) => {
  const tag = db.prepare('SELECT id, scope FROM tags WHERE id = ?').get(req.params.id)
  if (!tag) {
    res.status(404).json({ error: 'tag not found' })
    return
  }
  if (tag.scope === 'work') {
    const works = db.prepare(`
      SELECT w.id, w.title, w.kind, w.created_at,
        (SELECT COUNT(*) FROM pages p WHERE p.work_id = w.id) AS page_count
      FROM works w
      JOIN work_tags wt ON wt.work_id = w.id
      WHERE wt.tag_id = ? AND w.deleted_at IS NULL
      ORDER BY w.created_at DESC
    `).all(tag.id)
    res.json({ scope: 'work', resources: works })
    return
  }
  const pages = db.prepare(`
    SELECT p.id, p.title, p.page_no, p.work_id
    FROM pages p
    JOIN page_tags pt ON pt.page_id = p.id
    WHERE pt.tag_id = ?
    ORDER BY p.work_id, p.page_no
  `).all(tag.id)
  res.json({ scope: 'page', resources: pages })
})

app.post('/api/pages/:id/tags', (req, res) => {
  const page = db.prepare('SELECT id FROM pages WHERE id = ?').get(req.params.id)
  if (!page) {
    res.status(400).json({ error: 'invalid page or tag' })
    return
  }
  const tagIds = Array.isArray(req.body.tagIds) ? req.body.tagIds.map(String) : []
  const tagId = req.body.tagId ? String(req.body.tagId) : ''
  const name = String(req.body.tag ?? '').trim()
  const insert = db.prepare('INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES (?, ?)')
  const finalTagIds = new Set()
  let missingTag = false
  for (const id of tagIds) {
    const tag = db.prepare(`SELECT id FROM tags WHERE id = ? AND scope = 'page'`).get(id)
    if (tag) {
      insert.run(page.id, tag.id)
      finalTagIds.add(tag.id)
    }
  }
  if (tagId) {
    const tag = db.prepare(`SELECT id FROM tags WHERE id = ? AND scope = 'page'`).get(tagId)
    if (tag) {
      insert.run(page.id, tag.id)
      finalTagIds.add(tag.id)
    }
  }
  if (name) {
    const existingId = findTagId(name, 'page')
    if (existingId) {
      insert.run(page.id, existingId)
      finalTagIds.add(existingId)
    } else {
      missingTag = true
    }
  }
  const existing = pageTagIds(page.id)
  existing.forEach((id) => finalTagIds.add(id))
  res.json({ tags: pageTags(page.id), tagIds: Array.from(finalTagIds), missingTag })
})

app.delete('/api/pages/:id/tags/:tagName', (req, res) => {
  const raw = decodeURIComponent(req.params.tagName)
  const byId = db.prepare(`SELECT id FROM tags WHERE id = ? AND scope = 'page'`).get(raw)
  const tagId = byId?.id ?? db.prepare(`SELECT id FROM tags WHERE name = ? AND scope = 'page'`).get(raw)?.id
  if (tagId) {
    db.prepare('DELETE FROM page_tags WHERE page_id = ? AND tag_id = ?').run(req.params.id, tagId)
  }
  res.json({ tags: pageTags(req.params.id), tagIds: pageTagIds(req.params.id) })
})

app.post('/api/pages/tags/batch', (req, res) => {
  const pageIds = Array.isArray(req.body.pageIds) ? req.body.pageIds.map(String) : []
  const tagIds = Array.isArray(req.body.tagIds) ? req.body.tagIds.map(String) : []
  const action = req.body.action === 'remove' ? 'remove' : 'add'
  if (pageIds.length === 0 || tagIds.length === 0) {
    res.status(400).json({ error: 'pageIds and tagIds are required' })
    return
  }
  const insert = db.prepare('INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES (?, ?)')
  const remove = db.prepare('DELETE FROM page_tags WHERE page_id = ? AND tag_id = ?')
  for (const pageId of pageIds) {
    for (const tagId of tagIds) {
      const tag = db.prepare(`SELECT id FROM tags WHERE id = ? AND scope = 'page'`).get(tagId)
      if (!tag) continue
      if (action === 'remove') remove.run(pageId, tag.id)
      else insert.run(pageId, tag.id)
    }
  }
  res.json({ ok: true })
})

app.post('/api/pages/folder', (req, res) => {
  const pageIds = Array.isArray(req.body.pageIds) ? req.body.pageIds.map(String) : []
  const folderId = String(req.body.folderId ?? '')
  if (!folderId || pageIds.length === 0) {
    res.status(400).json({ error: 'pageIds and folderId are required' })
    return
  }
  const insert = db.prepare('INSERT OR IGNORE INTO page_folders (page_id, folder_id) VALUES (?, ?)')
  pageIds.forEach((pageId) => insert.run(pageId, folderId))
  res.json({ ok: true })
})

app.delete('/api/pages/folder', (req, res) => {
  const pageIds = Array.isArray(req.body.pageIds) ? req.body.pageIds.map(String) : []
  const folderId = String(req.body.folderId ?? '')
  if (!folderId || pageIds.length === 0) {
    res.status(400).json({ error: 'pageIds and folderId are required' })
    return
  }
  const placeholders = pageIds.map(() => '?').join(',')
  db.prepare(`DELETE FROM page_folders WHERE folder_id = ? AND page_id IN (${placeholders})`).run(folderId, ...pageIds)
  res.json({ ok: true })
})

const getKindFromName = (fileName) => {
  const name = fileName.toLowerCase()
  if (name.endsWith('.pdf')) return 'PDF'
  if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z')) return 'ZIP'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp') || name.endsWith('.gif')) return 'IMAGE'
  return 'PPT'
}

const compareMediaEntries = (a, b) => {
  const an = Number(a.name.match(/(\d+)/)?.[1] ?? 0)
  const bn = Number(b.name.match(/(\d+)/)?.[1] ?? 0)
  if (an !== bn) return an - bn
  return a.name.localeCompare(b.name, 'zh-CN')
}

const isSlideMediaEntry = (entryName) => {
  if (!/\.(png|jpe?g|webp|gif)$/i.test(entryName)) return false
  const baseName = entryName.split('/').pop().toLowerCase()
  return !/^(thumbnail|cover|preview)[._-]?/.test(baseName)
}

const isAnimatedImageFile = async (sourcePath) => {
  try {
    const metadata = await sharp(sourcePath, { animated: true, limitInputPixels: false }).metadata()
    return (metadata.pages ?? 1) > 1
  } catch {
    return false
  }
}

const generatePageFiles = async (sourcePath, pageId, options = {}) => {
  const { maxWidth = 0, animatedMaxWidth = 0, pageQuality = 92 } = options
  const animated = await isAnimatedImageFile(sourcePath)
  const sourceExt = path.extname(sourcePath).toLowerCase() || '.png'
  const fallbackOriginal = path.join(storageDirs.originals, `${pageId}${sourceExt}`)
  const thumbnail = path.join(storageDirs.thumbnails, `${pageId}.webp`)

  const writeThumbnail = async () => {
    try {
      await sharp(sourcePath, { page: 0, limitInputPixels: false })
        .resize({ width: 480, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(thumbnail)
    } catch {
      fs.copyFileSync(sourcePath, thumbnail)
    }
  }

  if (animated) {
    const gifPath = path.join(storageDirs.originals, `${pageId}.gif`)
    try {
      const metadata = await sharp(sourcePath, { animated: true, limitInputPixels: false }).metadata()
      const gifOptions = { effort: 2, loop: 1 }
      if (Array.isArray(metadata.delay) && metadata.delay.length > 0) {
        gifOptions.delay = metadata.delay.map((value) => Math.max(120, Math.round(Number(value) || 120)))
      }
      await sharp(sourcePath, { animated: true, limitInputPixels: false }).gif(gifOptions).toFile(gifPath)
      await writeThumbnail()
      return { original: gifPath, preview: gifPath, thumbnail }
    } catch {
      fs.rmSync(gifPath, { force: true })
      fs.copyFileSync(sourcePath, fallbackOriginal)
      await writeThumbnail()
      return { original: fallbackOriginal, preview: fallbackOriginal, thumbnail }
    }
  }

  if (maxWidth > 0) {
    const webpOriginal = path.join(storageDirs.originals, `${pageId}.webp`)
    try {
      await sharp(sourcePath, { limitInputPixels: false })
        .resize({ width: maxWidth, withoutEnlargement: true })
        .webp({ quality: pageQuality, effort: 4 })
        .toFile(webpOriginal)
      await writeThumbnail()
      return { original: webpOriginal, preview: webpOriginal, thumbnail }
    } catch {
      fs.rmSync(webpOriginal, { force: true })
    }
  }

  fs.copyFileSync(sourcePath, fallbackOriginal)
  await writeThumbnail()
  return { original: fallbackOriginal, preview: fallbackOriginal, thumbnail }
}

const insertUploadedPage = (workId, pageNo, title, files) => {
  const pageId = `${workId}-p${pageNo}`
  db.prepare(`
    INSERT INTO pages (id, work_id, page_no, title, thumbnail_path, preview_path, original_path, rating, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(pageId, workId, pageNo, title, files.thumbnail, files.preview, files.original, new Date().toISOString())
  return pageId
}

const updateTaskProgress = (taskId, progress, stage, processed = 0, total = 0) => {
  db.prepare(`
    UPDATE upload_tasks
    SET progress = ?, stage = ?, processed = ?, total = ?, updated_at = ?
    WHERE id = ?
  `).run(Math.max(0, Math.min(100, progress)), stage, processed, total, new Date().toISOString(), taskId)
}

const getPdfPageCount = (filePath) =>
  new Promise((resolve, reject) => {
    execFileAsync('pdfinfo', [filePath], {
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, FONTCONFIG_FILE: path.join(__dirname, 'config', 'fonts.conf') },
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }
      const match = String(stdout).match(/^Pages:\s+(\d+)/m)
      resolve(match ? Number(match[1]) : 0)
    })
  }).catch(() => getPdfPageCountJs(filePath))

const renderPdfRange = (uploadPath, prefix, start, end, onProgress) =>
  new Promise((resolve, reject) => {
    execFileAsync('pdftoppm', [
      '-jpeg',
      '-jpegopt', 'quality=92',
      '-scale-to', '1920',
      '-f', String(start),
      '-l', String(end),
      uploadPath,
      prefix,
    ], {
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, FONTCONFIG_FILE: path.join(__dirname, 'config', 'fonts.conf') },
    }, (error, _stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message))
      else {
        if (onProgress) onProgress(end - start + 1, end - start + 1)
        resolve()
      }
    })
  }).catch(() => renderPdfRangeJs(uploadPath, prefix, start, end, 1920, onProgress))

const processUploadedFile = async (workId, uploadPath, fileName, kind, taskId) => {
  ensureUploadNotCancelled(taskId)

  if (kind === 'IMAGE') {
    updateTaskProgress(taskId, 8, '读取图片', 0, 1)
    const files = await generatePageFiles(uploadPath, `${workId}-p1`)
    updateTaskProgress(taskId, 78, '生成缩略图', 1, 1)
    insertUploadedPage(workId, 1, fileName.replace(/\.[^.]+$/, ''), files)
    db.prepare("UPDATE works SET status = '已入库' WHERE id = ?").run(workId)
    updateTaskProgress(taskId, 100, '完成', 1, 1)
    cleanupUploadedFiles(uploadPath, workId)
    return
  }

  if (kind === 'ZIP') {
    updateTaskProgress(taskId, 5, '读取压缩包', 0, 0)
    const zip = await JSZip.loadAsync(fs.readFileSync(uploadPath))
    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir && isSlideMediaEntry(entry.name))
      .sort(compareMediaEntries)
      .slice(0, 200)
    const total = entries.length
    updateTaskProgress(taskId, 8, `解析压缩包 ${total} 页`, 0, total)
    let index = 1
    for (const entry of entries) {
      ensureUploadNotCancelled(taskId)
      updateTaskProgress(taskId, 12 + Math.floor(((index - 1) / Math.max(1, total)) * 78), `处理页面 ${index}/${total}`, index - 1, total)
      const blob = await entry.async('nodebuffer')
      const tempPath = path.join(storageDirs.uploads, `${workId}-${index}${path.extname(entry.name)}`)
      fs.writeFileSync(tempPath, blob)
      const files = await generatePageFiles(tempPath, `${workId}-p${index}`, { maxWidth: 1920, animatedMaxWidth: 1280, pageQuality: 92 })
      insertUploadedPage(workId, index, entry.name.split('/').pop() ?? `页面 ${index}`, files)
      index += 1
    }
    applyCoverBackTags(workId, index - 1)
    db.prepare("UPDATE works SET status = '已入库' WHERE id = ?").run(workId)
    updateTaskProgress(taskId, 100, '完成', total, total)
    cleanupUploadedFiles(uploadPath, workId)
    return
  }

  if (kind === 'PDF') {
    const prefix = path.join(storageDirs.uploads, workId)
    updateTaskProgress(taskId, 8, '开始渲染 PDF', 0, 0)
    let pageCount = 0
    try {
      pageCount = await getPdfPageCount(uploadPath)
    } catch {
      pageCount = 0
    }
    if (pageCount > 0) {
      const renderConcurrency = Math.max(1, Math.min(3, Math.max(1, os.cpus().length - 4)))
      const chunkSize = Math.max(10, Math.ceil(pageCount / (renderConcurrency * 2)))
      const ranges = []
      for (let start = 1; start <= pageCount; start += chunkSize) {
        ranges.push([start, Math.min(pageCount, start + chunkSize - 1)])
      }
      let rangeIndex = 0
      let renderedPdfPages = 0
      const onPdfRangeProgress = (delta) => {
        renderedPdfPages += Math.max(0, delta)
        const total = pageCount > 0 ? pageCount : Math.max(renderedPdfPages, 1)
        updateTaskProgress(
          taskId,
          Math.min(18, Math.round(8 + (renderedPdfPages / total) * 10)),
          `渲染 PDF ${renderedPdfPages}/${pageCount || '...'} 页`,
          renderedPdfPages,
          total,
        )
      }
      const renderWorker = async () => {
        while (rangeIndex < ranges.length) {
          ensureUploadNotCancelled(taskId)
          const [start, end] = ranges[rangeIndex]
          rangeIndex += 1
          await renderPdfRange(uploadPath, prefix, start, end, onPdfRangeProgress)
        }
      }
      await Promise.all(Array.from({ length: Math.min(renderConcurrency, ranges.length) }, () => renderWorker()))
    } else {
      await renderPdfRange(uploadPath, prefix, 1, 100000, () => {
        updateTaskProgress(taskId, 18, '渲染 PDF', 0, 0)
      })
    }
    const rendered = fs
      .readdirSync(storageDirs.uploads)
      .filter((file) => file.startsWith(`${workId}-`) && (file.endsWith('.jpg') || file.endsWith('.jpeg')))
      .sort((a, b) => {
        const an = Number(a.replace(`${workId}-`, '').replace(/\.jpe?g$/, '')) || 0
        const bn = Number(b.replace(`${workId}-`, '').replace(/\.jpe?g$/, '')) || 0
        return an - bn
      })
    const total = Math.min(rendered.length, 200)
    updateTaskProgress(taskId, 18, `渲染完成 ${total} 页`, 0, total)
    let index = 1
    for (const file of rendered.slice(0, 200)) {
      ensureUploadNotCancelled(taskId)
      updateTaskProgress(taskId, 22 + Math.floor(((index - 1) / Math.max(1, total)) * 72), `处理页面 ${index}/${total}`, index - 1, total)
      const tempPath = path.join(storageDirs.uploads, file)
      const files = await generatePageFiles(tempPath, `${workId}-p${index}`, { maxWidth: 1920, animatedMaxWidth: 1280, pageQuality: 92 })
      insertUploadedPage(workId, index, `PDF 第 ${index} 页`, files)
      index += 1
    }
    applyCoverBackTags(workId, index - 1)
    db.prepare("UPDATE works SET status = '已入库' WHERE id = ?").run(workId)
    updateTaskProgress(taskId, 100, '完成', total, total)
    cleanupUploadedFiles(uploadPath, workId)
    return
  }

  if (kind === 'PPT' && fileName.toLowerCase().endsWith('.pptx')) {
    updateTaskProgress(taskId, 5, '读取 PPTX', 0, 0)
    const zip = await JSZip.loadAsync(fs.readFileSync(uploadPath))
    const slidePaths = await getPptxSlidePaths(zip)
    const slideSize = await getPptxSlideSize(zip)
    if (slidePaths.length > 0) {
      const totalSlides = slidePaths.length
      updateTaskProgress(taskId, 8, `解析 PPTX ${totalSlides} 页`, 0, totalSlides)
      let index = 1
      for (const slidePath of slidePaths) {
        ensureUploadNotCancelled(taskId)
        updateTaskProgress(taskId, 12 + Math.floor(((index - 1) / totalSlides) * 78), `处理页面 ${index}/${totalSlides}`, index - 1, totalSlides)
        const layers = await getPptxSlideLayers(zip, slidePath)
        if (layers.length === 0) continue
        const composite = await compositePptxLayers(layers, slideSize)
        const compositeMeta = await sharp(composite, { limitInputPixels: false }).metadata()
        const tempExt = compositeMeta.format === 'gif' ? '.gif' : compositeMeta.pages > 1 ? '.webp' : '.png'
        const tempPath = path.join(storageDirs.uploads, `${workId}-slide-${index}${tempExt}`)
        fs.writeFileSync(tempPath, composite)
        const files = await generatePageFiles(tempPath, `${workId}-p${index}`, { maxWidth: 1920, animatedMaxWidth: 1280, pageQuality: 92 })
        insertUploadedPage(workId, index, `PPT 第 ${index} 页`, files)
        index += 1
      }
      if (index > 1) {
        applyCoverBackTags(workId, index - 1)
        db.prepare("UPDATE works SET status = '已入库' WHERE id = ?").run(workId)
        updateTaskProgress(taskId, 100, '完成', index - 1, totalSlides)
        cleanupUploadedFiles(uploadPath, workId)
        return
      }
    }
    const entries = Object.values(zip.files)
      .filter(
        (entry) =>
          !entry.dir &&
          entry.name.startsWith('ppt/media/') &&
          isSlideMediaEntry(entry.name),
      )
      .sort(compareMediaEntries)
      .slice(0, 200)
    const total = entries.length
    updateTaskProgress(taskId, 8, `解析 PPTX ${total} 页`, 0, total)
    let index = 1
    for (const entry of entries) {
      ensureUploadNotCancelled(taskId)
      updateTaskProgress(taskId, 12 + Math.floor(((index - 1) / Math.max(1, total)) * 78), `处理页面 ${index}/${total}`, index - 1, total)
      const blob = await entry.async('nodebuffer')
      const tempPath = path.join(storageDirs.uploads, `${workId}-${index}${path.extname(entry.name)}`)
      fs.writeFileSync(tempPath, blob)
      const files = await generatePageFiles(tempPath, `${workId}-p${index}`, { maxWidth: 1920, animatedMaxWidth: 1280, pageQuality: 92 })
      insertUploadedPage(workId, index, entry.name.split('/').pop() ?? `页面 ${index}`, files)
      index += 1
    }
    if (index > 1) {
      applyCoverBackTags(workId, index - 1)
      db.prepare("UPDATE works SET status = '已入库' WHERE id = ?").run(workId)
    }
    updateTaskProgress(taskId, 100, '完成', total, total)
    cleanupUploadedFiles(uploadPath, workId)
    return
  }

  updateTaskProgress(taskId, 100, '完成', 0, 0)
  db.prepare("UPDATE works SET status = '待整理' WHERE id = ?").run(workId)
  cleanupUploadedFiles(uploadPath, workId)
}

const backfillFileHashes = async () => {
  const works = db.prepare(`
    SELECT id, source_path, kind
    FROM works
    WHERE deleted_at IS NULL AND (file_hash IS NULL OR file_hash = '')
  `).all()
  let updated = 0
  for (const work of works) {
    const source = resolveStoredPath(work.source_path)
    let filePath = source && fs.existsSync(source) ? source : null
    if (!filePath && work.kind === 'IMAGE') {
      const page = db.prepare('SELECT original_path FROM pages WHERE work_id = ? ORDER BY page_no LIMIT 1').get(work.id)
      const original = page?.original_path ? resolveStoredPath(page.original_path) : null
      if (original && fs.existsSync(original)) filePath = original
    }
    if (!filePath) continue
    try {
      const fileHash = await hashFile(filePath)
      db.prepare('UPDATE works SET file_hash = ? WHERE id = ?').run(fileHash, work.id)
      updated += 1
    } catch {
      // Keep unhashed files for a later pass.
    }
  }
  return updated
}

const repairMissingPages = async () => {
  const pages = db.prepare(`
    SELECT p.id, p.page_no, p.work_id, p.original_path, p.thumbnail_path,
      w.source_path, w.kind
    FROM pages p
    JOIN works w ON w.id = p.work_id
    WHERE w.deleted_at IS NULL
  `).all()
  let repaired = 0
  let skipped = 0

  const worksByKind = new Map()
  for (const page of pages) {
    const originalExists = page.original_path && fs.existsSync(resolveStoredPath(page.original_path))
    const thumbnailExists = page.thumbnail_path && fs.existsSync(resolveStoredPath(page.thumbnail_path))
    if (originalExists && thumbnailExists) continue

    if (!originalExists) {
      const sourcePath = resolveStoredPath(page.source_path)
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        skipped += 1
        continue
      }
      const key = `${page.work_id}:${page.kind}`
      if (!worksByKind.has(key)) worksByKind.set(key, [])
      worksByKind.get(key).push(page)
    } else {
      try {
        const thumbnail = path.join(storageDirs.thumbnails, `${page.id}.webp`)
        await sharp(resolveStoredPath(page.original_path), { limitInputPixels: false })
          .resize({ width: 480, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(thumbnail)
        db.prepare('UPDATE pages SET thumbnail_path = ? WHERE id = ?').run(thumbnail, page.id)
        repaired += 1
      } catch {
        skipped += 1
      }
    }
  }

  for (const [key, group] of worksByKind.entries()) {
    const [workId, kind] = key.split(':')
    const sourcePath = resolveStoredPath(group[0].source_path)
    if (!sourcePath || !fs.existsSync(sourcePath)) continue
    try {
      if (kind === 'PPT' && sourcePath.toLowerCase().endsWith('.pptx')) {
        const zip = await JSZip.loadAsync(fs.readFileSync(sourcePath))
        const slidePaths = await getPptxSlidePaths(zip)
        const slideSize = await getPptxSlideSize(zip)
        for (const page of group) {
          const slidePath = slidePaths[page.page_no - 1]
          if (!slidePath) {
            skipped += 1
            continue
          }
          try {
            const layers = await getPptxSlideLayers(zip, slidePath)
            const composite = layers.length > 0 ? await compositePptxLayers(layers, slideSize) : null
            if (!composite) {
              skipped += 1
              continue
            }
            const meta = await sharp(composite, { limitInputPixels: false }).metadata()
            const tempExt = meta.format === 'gif' ? '.gif' : meta.pages > 1 ? '.webp' : '.png'
            const tempPath = path.join(storageDirs.uploads, `${workId}-repair-${page.id}${tempExt}`)
            fs.writeFileSync(tempPath, composite)
            const files = await generatePageFiles(tempPath, page.id, { maxWidth: 1920, animatedMaxWidth: 1280, pageQuality: 92 })
            db.prepare('UPDATE pages SET original_path = ?, preview_path = ?, thumbnail_path = ? WHERE id = ?')
              .run(files.original, files.preview, files.thumbnail, page.id)
            fs.rmSync(tempPath, { force: true })
            repaired += 1
          } catch {
            skipped += 1
          }
        }
      } else if (kind === 'PDF') {
        for (const page of group) {
          const prefix = path.join(storageDirs.uploads, `${workId}-repair-${page.id}`)
          try {
            await new Promise((resolve, reject) => {
              execFileAsync('pdftoppm', [
                '-f', String(page.page_no),
                '-l', String(page.page_no),
                '-jpeg', '-jpegopt', 'quality=92',
                '-scale-to', '1920',
                sourcePath, prefix,
              ], {
                maxBuffer: 64 * 1024 * 1024,
                env: { ...process.env, FONTCONFIG_FILE: path.join(__dirname, 'config', 'fonts.conf') },
              }, (error, _stdout, stderr) => {
                if (error) reject(new Error(stderr || error.message))
                else resolve()
              })
            })
            const rendered = fs.readdirSync(storageDirs.uploads)
              .find((file) => file.startsWith(`${path.basename(prefix)}-`) && /\.jpe?g$/i.test(file))
            if (!rendered) {
              skipped += 1
              continue
            }
            const tempPath = path.join(storageDirs.uploads, rendered)
            const files = await generatePageFiles(tempPath, page.id, { maxWidth: 1920, animatedMaxWidth: 1280, pageQuality: 92 })
            db.prepare('UPDATE pages SET original_path = ?, preview_path = ?, thumbnail_path = ? WHERE id = ?')
              .run(files.original, files.preview, files.thumbnail, page.id)
            fs.rmSync(tempPath, { force: true })
            repaired += 1
          } catch {
            skipped += 1
          }
        }
      } else {
        skipped += group.length
      }
    } catch {
      skipped += group.length
    }
  }

  return { repaired, skipped }
}

app.post('/api/uploads', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file is required' })
    return
  }
  const fileHash = req.file.hash || await hashFile(req.file.path)
  const duplicate = db.prepare('SELECT id, title, file_name FROM works WHERE file_hash = ? AND deleted_at IS NULL').get(fileHash)
  if (duplicate) {
    cleanupUploadedFiles(req.file.path, null)
    res.status(409).json({
      error: 'duplicate',
      duplicateId: duplicate.id,
      duplicateTitle: duplicate.title,
      duplicateFileName: duplicate.file_name,
    })
    return
  }
  const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
  const kind = getKindFromName(fileName)
  const workId = `w-${Date.now()}-${randomUUID().slice(0, 6)}`
  const filePath = req.file.path
  db.prepare(`
    INSERT INTO works (id, title, file_name, source_path, kind, status, quality, rating, description, created_at, file_hash)
    VALUES (?, ?, ?, ?, ?, 'pending', '待筛选', 0, '', ?, ?)
  `).run(workId, fileName.replace(/\.[^.]+$/, ''), fileName, null, kind, new Date().toISOString(), fileHash)
  const taskId = `task-${Date.now()}`
  db.prepare(`
    INSERT INTO upload_tasks (id, work_id, status, error, progress, stage, processed, total, created_at, updated_at)
    VALUES (?, ?, 'processing', NULL, 0, '等待处理', 0, 0, ?, ?)
  `).run(taskId, workId, new Date().toISOString(), new Date().toISOString())

  enqueueProcessing(async () => {
    try {
      ensureUploadNotCancelled(taskId)
      await processUploadedFile(workId, filePath, fileName, kind, taskId)
      db.prepare(`
        UPDATE upload_tasks SET status = 'done', progress = 100, stage = '完成', updated_at = ? WHERE id = ?
      `).run(new Date().toISOString(), taskId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'upload failed'
      try {
        cleanupUploadedFiles(filePath, workId)
      } catch {
        // Cleanup is best-effort and must not mask the real task result.
      }
      if (cancelledUploadTaskIds.has(taskId)) {
        db.prepare('DELETE FROM upload_tasks WHERE id = ?').run(taskId)
        db.prepare('DELETE FROM works WHERE id = ?').run(workId)
      } else {
        const pageCount = db.prepare('SELECT COUNT(*) AS count FROM pages WHERE work_id = ?').get(workId).count
        if (pageCount > 0) {
          db.prepare(`
            UPDATE upload_tasks SET status = 'done', progress = 100, stage = '完成', error = NULL, updated_at = ? WHERE id = ?
          `).run(new Date().toISOString(), taskId)
          console.error(`Upload task ${taskId} finished with pages but reported an issue: ${message}`)
        } else {
          db.prepare(`
            UPDATE upload_tasks SET status = 'error', error = ?, stage = '处理失败', updated_at = ? WHERE id = ?
          `).run(message, new Date().toISOString(), taskId)
        }
      }
    }
  })
  res.status(201).json({ taskId, workId })
})

app.post('/api/maintenance/repair-missing-pages', async (_req, res) => {
  try {
    const result = await repairMissingPages()
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '补页失败' })
  }
})

app.get('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM upload_tasks WHERE id = ?').get(req.params.id)
  if (!task) {
    res.status(404).json({ error: 'task not found' })
    return
  }
  res.json(task)
})

app.post('/api/tasks/:id/cancel', (req, res) => {
  const task = db.prepare('SELECT id, status FROM upload_tasks WHERE id = ?').get(req.params.id)
  if (!task) {
    res.status(404).json({ error: 'task not found' })
    return
  }
  if (task.status !== 'done') {
    cancelledUploadTaskIds.add(task.id)
    db.prepare(`
      UPDATE upload_tasks
      SET status = 'error', error = '用户已取消', stage = '已取消', updated_at = ?
      WHERE id = ? AND status != 'done'
    `).run(new Date().toISOString(), task.id)
  }
  res.json({ ok: true })
})

app.get('/api/export/folder/:id', async (req, res) => {
  const rootId = req.params.id
  const collectFolderIds = (folderId) => {
    const children = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(folderId)
    return [folderId, ...children.flatMap((child) => collectFolderIds(child.id))]
  }
  const folderIds = collectFolderIds(rootId)
  const placeholders = folderIds.map(() => '?').join(',')
  const pages = db.prepare(`
    SELECT p.id, p.page_no, p.original_path, w.title AS work_title
    FROM pages p
    JOIN works w ON w.id = p.work_id
    JOIN page_folders pf ON pf.page_id = p.id
    WHERE pf.folder_id IN (${placeholders})
      AND w.deleted_at IS NULL
    ORDER BY w.title, p.page_no
  `).all(...folderIds)
  const zip = new JSZip()
  for (const page of pages) {
    const filePath = resolveStoredPath(page.original_path)
    if (!filePath || !fs.existsSync(filePath)) continue
    const safeName = `${page.work_title}-${String(page.page_no).padStart(2, '0')}${path.extname(filePath)}`
    zip.file(safeName.replace(/[\\/:*?"<>|]/g, '-'), fs.readFileSync(filePath))
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${rootId}.zip"`)
  res.send(buffer)
})

const distDir = path.join(__dirname, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next()
      return
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((err, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  console.error(err)
  res.status(500).json({ error: err instanceof Error ? err.message : 'internal server error' })
})

const runStorageMaintenance = async () => {
  if (activeUploads > 0 || processingQueue.length > 0) return
  try {
    const compact = await compactPageOriginals()
    const clean = cleanOrphanFiles()
    const repair = await repairMissingPages()
    const hashed = await backfillFileHashes()
    if (compact.compressed > 0 || clean.deleted > 0 || repair.repaired > 0 || hashed > 0) {
      console.log(
        `Storage maintenance: compressed ${compact.compressed}, cleaned ${clean.deleted}, repaired ${repair.repaired}, hashed ${hashed}, freed ${(compact.freedBytes + clean.freedBytes) / 1024 / 1024} MB`,
      )
    }
  } catch (error) {
    console.error('Storage maintenance failed:', error)
  }
}

export const startNormixServer = async ({ host = '127.0.0.1', port = 0 } = {}) => {
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance))
    instance.on('error', reject)
  })
  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  recoverInterruptedUploads()
  reconcileCompletedUploadTasks()
  clearSourceStorage()
  setImmediate(runStorageMaintenance)
  setInterval(runStorageMaintenance, 6 * 60 * 60 * 1000).unref()
  return { server, port: actualPort, url: `http://${host}:${actualPort}` }
}

if (!process.env.NORMIX_DESKTOP) {
  const port = Number(process.env.PORT ?? 4000)
  void startNormixServer({ host: '0.0.0.0', port }).then(({ port: actualPort }) => {
    console.log(`SQLite API running on http://0.0.0.0:${actualPort}`)
  })
}
