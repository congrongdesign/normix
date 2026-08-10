export type ExportImageItem = {
  title: string
  blob: Blob
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-')

export const blobToPng = async (blob: Blob): Promise<Blob> => {
  if (blob.type === 'image/png') return blob
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return blob
    }
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return png ?? blob
  } catch {
    return blob
  }
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read blob failed'))
    reader.readAsDataURL(blob)
  })

export const exportPagesAsPdf = async (items: ExportImageItem[], fileName: string) => {
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.create()

  for (const item of items) {
    const png = await blobToPng(item.blob)
    const image = await pdf.embedPng(await png.arrayBuffer())
    const pageWidth = 960
    const pageHeight = Math.min(1200, Math.max(540, pageWidth / (image.width / image.height)))
    const page = pdf.addPage([pageWidth, pageHeight])
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    })
  }

  const bytes = await pdf.save()
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), safeFileName(fileName))
}

export const exportPagesAsPptx = async (items: ExportImageItem[], fileName: string) => {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'IMG', width: 13.333, height: 7.5 })
  pptx.layout = 'IMG'

  for (const item of items) {
    const png = await blobToPng(item.blob)
    const dataUrl = await blobToDataUrl(png)
    const slide = pptx.addSlide()
    slide.addImage({
      data: dataUrl,
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
      sizing: { type: 'cover', w: 13.333, h: 7.5 },
    })
  }

  await pptx.writeFile({ fileName: safeFileName(fileName) })
}
