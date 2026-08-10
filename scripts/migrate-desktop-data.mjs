import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const desktopDataDir = process.env.NORMIX_DESKTOP_DATA_DIR
  ? path.resolve(process.env.NORMIX_DESKTOP_DATA_DIR)
  : (() => {
      const home = os.homedir()
      if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Normix')
      if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Normix')
      return path.join(home, '.normix')
    })()

const targetData = path.join(desktopDataDir, 'data')
const targetStorage = path.join(desktopDataDir, 'storage')
const sourceData = path.join(rootDir, 'data')
const sourceStorage = path.join(rootDir, 'storage')

fs.mkdirSync(targetData, { recursive: true })
fs.mkdirSync(targetStorage, { recursive: true })

let copied = 0

if (fs.existsSync(sourceData) && !fs.existsSync(path.join(targetData, 'app.db'))) {
  fs.cpSync(sourceData, targetData, { recursive: true })
  copied += 1
}

if (fs.existsSync(sourceStorage) && fs.readdirSync(targetStorage).length === 0) {
  fs.cpSync(sourceStorage, targetStorage, { recursive: true })
  copied += 1
}

console.log(`Desktop data directory: ${desktopDataDir}`)
console.log(copied > 0 ? 'Existing data copied.' : 'No data migration needed.')
