import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const deployDir = path.join(rootDir, 'deploy')
const zipPath = path.join(deployDir, 'ppt-inspiration-catalog.zip')

execSync('npm run build', { cwd: rootDir, stdio: 'inherit' })
fs.mkdirSync(deployDir, { recursive: true })

const zip = new JSZip()
const addFile = (file) => {
  const rel = path.relative(rootDir, file)
  if (fs.statSync(file).isDirectory()) {
    fs.readdirSync(file).forEach((name) => addFile(path.join(file, name)))
  } else {
    zip.file(rel, fs.readFileSync(file))
  }
}

;['package.json', 'package-lock.json', 'server.mjs', 'dist', 'scripts'].forEach((name) => {
  const file = path.join(rootDir, name)
  if (fs.existsSync(file)) addFile(file)
})

const buffer = await zip.generateAsync({ type: 'nodebuffer' })
fs.writeFileSync(zipPath, buffer)
console.log(`deploy package created: ${zipPath}`)
