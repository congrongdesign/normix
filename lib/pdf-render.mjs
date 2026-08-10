import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const getPdfPageCountJs = async (filePath) => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('@napi-rs/canvas')
  const data = new Uint8Array(fs.readFileSync(filePath))
  const pdfJsRoot = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist')
  const loadingTask = getDocument({
    data,
    cMapPacked: true,
    cMapUrl: path.join(pdfJsRoot, 'cmaps') + path.sep,
    standardFontDataUrl: path.join(pdfJsRoot, 'standard_fonts') + path.sep,
  })
  const pdf = await loadingTask.promise
  const count = pdf.numPages
  await loadingTask.destroy()
  return count
}

export const renderPdfPageJs = async (filePath, pageNo, outputPath, maxWidth = 1920) => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('@napi-rs/canvas')
  const data = new Uint8Array(fs.readFileSync(filePath))
  const pdfJsRoot = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist')
  const loadingTask = getDocument({
    data,
    cMapPacked: true,
    cMapUrl: path.join(pdfJsRoot, 'cmaps') + path.sep,
    standardFontDataUrl: path.join(pdfJsRoot, 'standard_fonts') + path.sep,
  })
  const pdf = await loadingTask.promise
  try {
    const page = await pdf.getPage(pageNo)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = Math.min(1, maxWidth / baseViewport.width)
    const viewport = page.getViewport({ scale })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport }).promise
    fs.writeFileSync(outputPath, canvas.toBuffer('image/jpeg', { quality: 92 }))
  } finally {
    await loadingTask.destroy()
  }
}

export const renderPdfRangeJs = async (filePath, prefix, start, end, maxWidth = 1920) => {
  for (let pageNo = start; pageNo <= end; pageNo += 1) {
    const outputPath = `${prefix}-${pageNo}.jpg`
    await renderPdfPageJs(filePath, pageNo, outputPath, maxWidth)
  }
}
