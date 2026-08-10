import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'normix-smoke-'))
const port = Number(process.env.SMOKE_PORT ?? 4310)
const apiBase = `http://127.0.0.1:${port}`

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const startServer = () => new Promise((resolve, reject) => {
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: path.join(tmpDir, 'data'),
      STORAGE_DIR: path.join(tmpDir, 'storage'),
      PATH: process.platform === 'win32' ? 'C:\\nonexistent' : '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const timeout = setTimeout(() => {
    server.kill()
    reject(new Error('smoke server start timed out'))
  }, 15000)

  server.stdout.on('data', (chunk) => {
    output += String(chunk)
    if (output.includes('SQLite API running')) {
      clearTimeout(timeout)
      resolve(server)
    }
  })
  server.stderr.on('data', (chunk) => {
    output += String(chunk)
  })
  server.on('exit', (code) => {
    clearTimeout(timeout)
    reject(new Error(`smoke server exited early with ${code}: ${output}`))
  })
})

const runSmoke = (server) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/smoke-test.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      API_BASE: apiBase,
    },
    stdio: 'inherit',
  })
  child.on('exit', async (code) => {
    server.kill()
    await wait(500)
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Temporary files may already be cleaned.
    }
    if (code === 0) resolve()
    else reject(new Error(`smoke test failed with ${code}`))
  })
})

try {
  const server = await startServer()
  await runSmoke(server)
  console.log('smoke suite passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
