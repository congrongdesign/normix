import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const getPdfPageCountJs = async (filePath) => {
  const { pdf, loadingTask } = await loadPdfDocument(filePath)
  const count = pdf.numPages
  await loadingTask.destroy()
  return count
}

const loadPdfDocument = async (filePath) => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('@napi-rs/canvas')
  const data = new Uint8Array(fs.readFileSync(filePath))
  const pdfJsRoot = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist')
  const loadingTask = getDocument({
    data,
    cMapPacked: true,
    cMapUrl: path.join(pdfJsRoot, 'cmaps').replace(/\\/g, '/') + '/',
    standardFontDataUrl: path.join(pdfJsRoot, 'standard_fonts').replace(/\\/g, '/') + '/',
  })
  const pdf = await loadingTask.promise
  return { pdf, loadingTask, createCanvas }
}

const renderPdfPageWithDocument = async (pdf, pageNo, outputPath, maxWidth, createCanvas) => {
  const page = await pdf.getPage(pageNo)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.min(1, maxWidth / Math.max(1, baseViewport.width))
  const viewport = page.getViewport({ scale })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const context = canvas.getContext('2d')
  await page.render({ canvasContext: context, viewport }).promise
  fs.writeFileSync(outputPath, canvas.toBuffer('image/jpeg', { quality: 92 }))
}

export const renderPdfPageJs = async (filePath, pageNo, outputPath, maxWidth = 1920) => {
  const { pdf, loadingTask, createCanvas } = await loadPdfDocument(filePath)
  try {
    await renderPdfPageWithDocument(pdf, pageNo, outputPath, maxWidth, createCanvas)
  } finally {
    await loadingTask.destroy()
  }
}

export const renderPdfRangeJs = async (filePath, prefix, start, end, maxWidth = 1920, onProgress) => {
  const { pdf, loadingTask, createCanvas } = await loadPdfDocument(filePath)
  const actualEnd = Math.min(end, pdf.numPages)
  const total = Math.max(0, actualEnd - start + 1)
  const concurrency = Math.max(1, Math.min(4, Math.max(1, os.cpus().length - 2)))
  let nextPage = start
  let completed = 0
  try {
    if (total <= 0) return
    const worker = async () => {
      while (nextPage <= actualEnd) {
        const pageNo = nextPage
        nextPage += 1
        await renderPdfPageWithDocument(pdf, pageNo, `${prefix}-${pageNo}.jpg`, maxWidth, createCanvas)
        completed += 1
        if (onProgress) onProgress(1, total)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()))
  } finally {
    await loadingTask.destroy()
  }
}
