import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  ChangeEvent,
  DragEvent as ReactDragEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  WheelEvent,
} from 'react'
import {
  CheckCircle2,
  CalendarDays,
  ArrowLeft,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Filter,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  Library,
  Maximize2,
  Minus,
  Palette,
  Presentation,
  Plus,
  Search,
  Settings,
  Shapes,
  Star,
  Tags,
  Tag,
  Trash2,
  RotateCcw,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import './App.css'
import { blobToPng, exportPagesAsPdf, exportPagesAsPptx } from './exportImages'
import { CollectionFolderIcon, PageMaterialIcon, TagCountIcon, WorksDocumentIcon } from './homeStatIcons'

type FileKind = 'PPT' | 'PDF' | 'ZIP' | 'IMAGE'
type ViewKey = 'home' | 'library' | 'work' | 'collections' | 'tags' | 'trash' | 'settings'
type Quality = 'S' | 'A' | 'B' | '待筛选'
type PreviewKind = 'image' | 'cover' | 'split' | 'data' | 'grid' | 'timeline'

type GalleryPage = {
  id: string
  pageNumber: number
  title: string
  layout: string
  tags: string[]
  tagIds?: string[]
  note: string
  palette: string
  previewKind: PreviewKind
  imageUrl?: string
  previewUrl?: string
  originalUrl?: string
  saved: boolean
  rating?: number
}

type Work = {
  id: string
  title: string
  fileName: string
  file_name?: string
  kind: FileKind
  pages: GalleryPage[]
  uploader: string
  uploadedAt: string
  industry: string
  purpose: string
  style: string
  color: string
  quality: Quality
  copyright: string
  tags: string[]
  tagIds?: string[]
  status: '已入库' | '解析中' | '待整理' | 'pending' | 'error'
  description: string
  fileData?: string
  rating?: number
  favorite?: boolean
  fileSize?: number
  failed?: boolean
}

type UploadJob = {
  id: string
  fileName: string
  size: number
  status: 'queued' | 'uploading' | 'parsing' | 'done' | 'failed' | 'duplicate'
  percent: number
  eta?: string
}

type Collection = {
  id: string
  name: string
  description: string
  pageIds: string[]
  owner: string
  parentId?: string
  order?: number
}

type TrashWork = {
  id: string
  title: string
  fileName: string
  kind: FileKind
  pageCount: number
  deletedAt: string
  tags: string[]
  tagIds?: string[]
  rating?: number
  favorite?: boolean
  fileSize?: number
  coverPageId?: string
  coverThumbnailUrl?: string
  coverPreviewUrl?: string
}

type TagNode = {
  id: string
  name: string
  scope?: 'work' | 'page'
  parent_id?: string | null
  group?: string | null
  color?: string | null
  sort_order?: number
  work_count?: number
  page_count?: number
  children: TagNode[]
}

const filterTagTreeByScope = (nodes: TagNode[], scope: 'work' | 'page'): TagNode[] =>
  nodes.flatMap((node) => {
    if (node.scope && node.scope !== scope) return []
    const children = filterTagTreeByScope(node.children, scope)
    return [{ ...node, children }]
  })

type ImageColorProfile = {
  categories: string[]
  colors: Array<{ hex: string; ratio: number }>
  hueRatios: Record<number, number>
  colorFamilyRatios: Record<string, number>
  dominantFamilies: string[]
  neutralRatio: number
}

const industries = ['全部行业', '科技', '金融', '医疗', '教育', '地产', '消费品', '政企']
const styles = ['全部风格', '科技感', '极简', '商务', '高端', '杂志感', '数据可视化', '国潮']
const purposes = ['路演', '发布会', '招商', '汇报', '年终总结', '培训', '产品介绍']
const colors = ['蓝色', '黑金', '白色', '红色', '绿色', '紫色', '多彩']

const colorFamilyPresets = [
  { key: '黑色', label: '黑色', swatch: '#18181b' },
  { key: '白色', label: '白色', swatch: '#fafafa' },
  { key: '灰色', label: '灰色', swatch: '#a1a1aa' },
  { key: '红色', label: '红色', swatch: '#dc2626' },
  { key: '橙色', label: '橙色', swatch: '#f97316' },
  { key: '黄色', label: '黄色', swatch: '#eab308' },
  { key: '绿色', label: '绿色', swatch: '#16a34a' },
  { key: '蓝色', label: '蓝色', swatch: '#2563eb' },
  { key: '紫色', label: '紫色', swatch: '#7c3aed' },
  { key: '粉色', label: '粉色', swatch: '#ec4899' },
  { key: '棕色', label: '棕色', swatch: '#8b5e34' },
  { key: '多彩', label: '多彩', swatch: 'linear-gradient(135deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #8b5cf6)' },
  { key: '中性', label: '中性', swatch: '#d4d4d8' },
]

const tagColorPalette = [
  { color: '#0f766e', background: '#ccfbf1', border: '#99f6e4' },
  { color: '#b45309', background: '#fef3c7', border: '#fde68a' },
  { color: '#15803d', background: '#dcfce7', border: '#bbf7d0' },
  { color: '#be123c', background: '#ffe4e6', border: '#fecdd3' },
  { color: '#c2410c', background: '#ffedd5', border: '#fed7aa' },
  { color: '#475569', background: '#e2e8f0', border: '#cbd5e1' },
]

const tagColorStyle = (tag: string): CSSProperties => {
  const hash = Array.from(tag).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const palette = tagColorPalette[hash % tagColorPalette.length] ?? tagColorPalette[0]
  return {
    color: palette.color,
    background: palette.background,
    borderColor: palette.border,
  }
}

const navItems: Array<{ key: ViewKey | 'tags'; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'home', label: '首页', icon: LayoutDashboard },
  { key: 'library', label: '作品库', icon: Library },
  { key: 'collections', label: '灵感集', icon: ImageIcon },
  { key: 'tags', label: '标签管理', icon: Tags },
  { key: 'trash', label: '回收站', icon: Trash2 },
  { key: 'settings', label: '设置', icon: Settings },
]

const TRASH_RETENTION_DAYS = 30

const previewKinds: PreviewKind[] = ['cover', 'split', 'data', 'grid', 'timeline']

const gradientMap = [
  'linear-gradient(135deg, #111111 0%, #3f3f46 55%, #ffffff 100%)',
  'linear-gradient(135deg, #f8fafc 0%, #e5e7eb 50%, #2563eb 100%)',
  'linear-gradient(135deg, #171717 0%, #525252 58%, #d4d4d4 100%)',
  'linear-gradient(135deg, #fafafa 0%, #d1d5db 48%, #0f766e 100%)',
  'linear-gradient(135deg, #18181b 0%, #78716c 55%, #f5f5f4 100%)',
  'linear-gradient(135deg, #f5f5f5 0%, #cbd5e1 54%, #334155 100%)',
]

const makePages = (workId: string, count: number, seed = 0): GalleryPage[] =>
  Array.from({ length: count }, (_, index) => {
    const layout = index === 0 ? '封面' : '页面'
    return {
      id: `${workId}-p${index + 1}`,
      pageNumber: index + 1,
      title: `第 ${index + 1} 页`,
      layout,
      tags: [],
      note: '待分类',
      palette: gradientMap[(index + seed) % gradientMap.length],
      previewKind: previewKinds[(index + seed) % previewKinds.length],
      saved: index % 5 === 0,
    }
  })

const initialWorks: Work[] = []

const initialCollections: Collection[] = []

const cloneCollections = (items: Collection[]): Collection[] =>
  items.map((item) => ({ ...item, pageIds: [...item.pageIds] }))

const collectionsEqual = (a: Collection[], b: Collection[]): boolean => {
  if (a.length !== b.length) return false
  const key = (item: Collection) => JSON.stringify({
    id: item.id,
    name: item.name,
    parentId: item.parentId ?? null,
    description: item.description ?? '',
    order: item.order ?? 0,
    pageIds: [...item.pageIds].sort(),
  })
  return a.every((item, index) => key(item) === key(b[index]))
}

const getKind = (fileName: string): FileKind => {
  const name = fileName.toLowerCase()
  if (name.endsWith('.pdf')) return 'PDF'
  if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z')) return 'ZIP'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp') || name.endsWith('.gif')) return 'IMAGE'
  return 'PPT'
}

const guessPageCount = (kind: FileKind) => {
  if (kind === 'IMAGE') return 1
  if (kind === 'PDF') return 12
  if (kind === 'ZIP') return 20
  return 16
}

const isImageName = (name: string) => /\.(png|jpe?g|webp|gif)$/i.test(name)
const isPdfName = (name: string) => /\.pdf$/i.test(name)
const maxRenderedPages = 36

const isSlideImageEntry = (entryName: string) => {
  if (!isImageName(entryName)) return false
  const baseName = entryName.split('/').pop()?.toLowerCase() ?? ''
  return !/^(thumbnail|cover|preview)[._-]?/.test(baseName)
}

const dataUrlFromBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

const uploadFileWithProgress = (file: File, onProgress: (fraction: number) => void) =>
  new Promise<{
    taskId?: string
    workId?: string
    duplicate?: boolean
    duplicateId?: string
    duplicateTitle?: string
    duplicateFileName?: string
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/uploads')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      const data = (() => {
        try {
          return JSON.parse(xhr.responseText) as {
            taskId?: string
            workId?: string
            duplicate?: boolean
            duplicateId?: string
            duplicateTitle?: string
            duplicateFileName?: string
          }
        } catch {
          return null
        }
      })()
      if (xhr.status === 409 && data?.duplicate) {
        resolve({
          duplicate: true,
          duplicateId: data.duplicateId,
          duplicateTitle: data.duplicateTitle,
          duplicateFileName: data.duplicateFileName,
        })
        return
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.taskId) {
        resolve({ taskId: data.taskId, workId: data.workId })
        return
      }
      reject(new Error('upload failed'))
    }
    xhr.onerror = () => reject(new Error('upload failed'))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const uploadFileWithRetry = (file: File, onProgress: (fraction: number) => void) => {
  let attempt = 0
  const run = async (): Promise<Awaited<ReturnType<typeof uploadFileWithProgress>>> => {
    try {
      return await uploadFileWithProgress(file, onProgress)
    } catch (error) {
      if (attempt >= 2) throw error
      attempt += 1
      await wait(250 * attempt)
      return run()
    }
  }
  return run()
}

const UPLOAD_CONCURRENCY = Math.max(
  2,
  Math.min(
    6,
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? Math.ceil(navigator.hardwareConcurrency / 2)
      : 4,
  ),
)

const uploadPhaseWeight = (files: File[]) => {
  const totalMB = files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024
  const hasHeavyFiles = files.some((file) => /\.(pptx|pdf|zip|rar|7z)$/i.test(file.name))
  if (hasHeavyFiles) return totalMB > 200 ? 0.25 : 0.18
  return totalMB > 200 ? 0.35 : 0.25
}

const pageFromImage = (workId: string, pageNumber: number, imageUrl: string, name: string, seed: number, tags: string[] = []): GalleryPage => ({
  id: `${workId}-p${pageNumber}`,
  pageNumber,
  title: name.replace(/\.[^.]+$/, '') || `页面 ${pageNumber}`,
  layout: pageNumber === 1 ? '封面' : '页面',
  tags,
  note: '已读取原文件预览',
  palette: gradientMap[(pageNumber + seed) % gradientMap.length],
  previewKind: 'image',
  imageUrl,
  saved: false,
})

const withCoverBackTags = (pages: GalleryPage[]) => {
  if (pages.length < 2) return pages
  return pages.map((page, index) => {
    if (index === 0) return { ...page, tags: Array.from(new Set([...page.tags, '封面'])) }
    if (index === pages.length - 1) return { ...page, tags: Array.from(new Set([...page.tags, '封底'])) }
    return page
  })
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
const loadPdfjs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjs
    })()
  }
  return pdfjsPromise
}

const renderPdfPages = async (file: Blob, workId: string, seed: number): Promise<GalleryPage[]> => {
  const source = await file.arrayBuffer()
  const pdfjs = await loadPdfjs()
  const pdf = await pdfjs.getDocument({ data: source }).promise
  const limit = Math.min(pdf.numPages, maxRenderedPages)
  const renderedPages: GalleryPage[] = []

  for (let index = 1; index <= limit; index += 1) {
    const page = await pdf.getPage(index)
    const baseViewport = page.getViewport({ scale: 1 })
    const maxSide = Math.max(baseViewport.width, baseViewport.height)
    const scale = Math.min(2, 4096 / maxSide)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) continue

    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, canvasContext: context, viewport }).promise

    renderedPages.push(
      pageFromImage(
        workId,
        index,
        canvas.toDataURL('image/png'),
        `PDF 第 ${index} 页`,
        seed,
        [],
      ),
    )
  }

  return renderedPages.length > 0 ? renderedPages : makePages(workId, guessPageCount('PDF'), seed)
}

const extractZipPages = async (file: File, workId: string, seed: number): Promise<GalleryPage[]> => {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file)
  const imageEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && isSlideImageEntry(entry.name))
    .sort(
      (a, b) =>
        numericNameIndex(a.name) - numericNameIndex(b.name) ||
        a.name.localeCompare(b.name, 'zh-CN'),
    )
    .slice(0, maxRenderedPages)

  const pages: GalleryPage[] = []
  for (const [index, entry] of imageEntries.entries()) {
    const blob = await entry.async('blob')
    pages.push(
      pageFromImage(
        workId,
        index + 1,
        await dataUrlFromBlob(blob),
        entry.name.split('/').pop() ?? entry.name,
        seed,
        [],
      ),
    )
  }

  if (pages.length > 0) return pages

  const pdfEntry = Object.values(zip.files).find((entry) => !entry.dir && isPdfName(entry.name))
  if (pdfEntry) {
    return renderPdfPages(await pdfEntry.async('blob'), workId, seed)
  }

  return makePages(workId, guessPageCount('ZIP'), seed)
}

const numericNameIndex = (name: string) => {
  const match = name.match(/(\d+)/)
  return match ? Number(match[1]) : 0
}

const extractPptxPages = async (file: File, workId: string, seed: number): Promise<GalleryPage[]> => {
  try {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(file)
    const mediaEntries = Object.values(zip.files)
      .filter((entry) => !entry.dir && isSlideImageEntry(entry.name) && entry.name.toLowerCase().startsWith('ppt/media/'))
      .sort(
        (a, b) =>
          numericNameIndex(a.name) - numericNameIndex(b.name) ||
          a.name.localeCompare(b.name, 'zh-CN'),
      )
      .slice(0, maxRenderedPages)

    if (mediaEntries.length > 0) {
      const pages: GalleryPage[] = []
      for (const [index, entry] of mediaEntries.entries()) {
        const blob = await entry.async('blob')
        pages.push(
          pageFromImage(
            workId,
            index + 1,
            await dataUrlFromBlob(blob),
            entry.name.split('/').pop() ?? entry.name,
            seed,
            [],
          ),
        )
      }
      return pages
    }

    const imageEntries = Object.values(zip.files)
      .filter((entry) => !entry.dir && isSlideImageEntry(entry.name))
      .sort(
        (a, b) =>
          numericNameIndex(a.name) - numericNameIndex(b.name) ||
          a.name.localeCompare(b.name, 'zh-CN'),
      )
      .slice(0, maxRenderedPages)

    if (imageEntries.length > 0) {
      const pages: GalleryPage[] = []
      for (const [index, entry] of imageEntries.entries()) {
        const blob = await entry.async('blob')
        pages.push(
          pageFromImage(
            workId,
            index + 1,
            await dataUrlFromBlob(blob),
            entry.name.split('/').pop() ?? entry.name,
            seed,
            [],
          ),
        )
      }
      return pages
    }
  } catch {
    // Legacy .ppt files are not ZIP packages and cannot be rendered in-browser.
  }

  return makePages(workId, guessPageCount('PPT'), seed)
}

const paletteStops = (pageNumber: number) => {
  const palettes = [
    ['#111111', '#3f3f46', '#ffffff'],
    ['#f8fafc', '#e5e7eb', '#2563eb'],
    ['#171717', '#525252', '#d4d4d4'],
    ['#fafafa', '#d1d5db', '#0f766e'],
    ['#18181b', '#78716c', '#f5f5f4'],
    ['#f5f5f5', '#cbd5e1', '#334155'],
  ]

  return palettes[pageNumber % palettes.length]
}

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('导出失败'))
    }, 'image/png')
  })

const imageUrlToBlob = async (imageUrl: string) => {
  const response = await fetch(imageUrl)
  return response.blob()
}

const renderMockPageToBlob = async (page: GalleryPage) => {
  const width = 1920
  const height = 1080
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建画布')

  canvas.width = width
  canvas.height = height

  const gradient = context.createLinearGradient(0, 0, width, height)
  paletteStops(page.pageNumber).forEach((color, index) => gradient.addColorStop(index / 2, color))
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)

  context.fillStyle = 'rgba(255, 255, 255, 0.86)'
  context.fillRect(160, 720, 820, 34)
  context.fillRect(160, 790, 620, 22)
  context.fillRect(160, 842, 500, 22)

  context.fillStyle = 'rgba(255, 255, 255, 0.22)'
  context.fillRect(1160, 220, 520, 520)
  context.fillStyle = 'rgba(0, 0, 0, 0.18)'
  context.fillRect(1188, 250, 464, 464)

  context.fillStyle = '#ffffff'
  context.font = '700 92px system-ui, sans-serif'
  context.fillText(page.layout, 160, 650)
  context.font = '600 34px system-ui, sans-serif'
  context.fillText(String(page.pageNumber).padStart(2, '0'), 160, 150)

  return canvasToBlob(canvas)
}

const getPageBlob = (page: GalleryPage) => {
  const source = page.originalUrl ?? page.previewUrl ?? page.imageUrl
  return source ? imageUrlToBlob(source) : renderMockPageToBlob(page)
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const formatEta = (seconds: number | undefined) => {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined
  if (seconds < 60) return `约 ${Math.max(1, Math.round(seconds))} 秒`
  if (seconds < 3600) return `约 ${Math.max(1, Math.round(seconds / 60))} 分钟`
  return `约 ${(seconds / 3600).toFixed(1)} 小时`
}

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-')

const blobUrlToDataUrl = async (url?: string): Promise<string | undefined> => {
  if (!url) return undefined
  if (url.startsWith('data:')) return url
  try {
    const blob = await fetch(url).then((response) => response.blob())
    return dataUrlFromBlob(blob)
  } catch {
    return url
  }
}

const serializeAppState = async (works: Work[], collections: Collection[]) => {
  const serializedWorks = await Promise.all(
    works.map(async (work) => ({
      ...work,
      fileData: undefined,
      pages: await Promise.all(
        work.pages.map(async (page) => ({
          ...page,
          imageUrl: await blobUrlToDataUrl(page.imageUrl),
        })),
      ),
    })),
  )
  return { works: serializedWorks, collections }
}

const persistAppState = async (works: Work[], collections: Collection[]) => {
  const payload = await serializeAppState(works, collections)
  const response = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error('save failed')
}

const classifyRgbColor = (r: number, g: number, b: number): string => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const lightness = (max + min) / 2 / 255
  const saturation = delta === 0 ? 0 : delta / (255 - Math.abs(2 * lightness * 255 - 255))

  if (lightness < 0.08) return '黑色'
  if (lightness > 0.92 && saturation < 0.24) return '白色'
  if (saturation < 0.18) return lightness > 0.72 ? '白色' : lightness < 0.24 ? '黑色' : '灰色'

  let hue = 0
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }

  if (hue < 15 || hue >= 350) return '红色'
  if (hue < 45) return saturation < 0.52 && lightness < 0.68 ? '棕色' : '橙色'
  if (hue < 70) return saturation < 0.52 && lightness < 0.72 ? '棕色' : '黄色'
  if (hue < 160) return '绿色'
  if (hue < 255) return '蓝色'
  if (hue < 330) return '紫色'
  if (lightness > 0.62) return '粉色'
  return '红色'
}

const getHueBucket = (hue: number) => Math.round(hue / 30) * 30 % 360

const analyzeImageColors = (imageUrl: string): Promise<ImageColorProfile> =>
  new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const size = 96
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) {
          resolve({ categories: [], colors: [], hueRatios: {}, colorFamilyRatios: {}, dominantFamilies: [], neutralRatio: 0 })
          return
        }
        context.drawImage(image, 0, 0, size, size)
        const data = context.getImageData(0, 0, size, size).data

        const categoryCounts: Record<string, number> = {}
        const hueCounts: Record<number, number> = {}
        const paletteCounts = new Map<string, { hex: string; count: number }>()
        let total = 0
        let neutralCount = 0

        for (let index = 0; index < data.length; index += 12) {
          const r = data[index]
          const g = data[index + 1]
          const b = data[index + 2]
          const category = classifyRgbColor(r, g, b)
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const lightness = (max + min) / 2 / 255
          const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(2 * lightness * 255 - 255))

          categoryCounts[category] = (categoryCounts[category] ?? 0) + 1
          total += 1

          const qr = Math.min(255, Math.round(r / 16) * 16)
          const qg = Math.min(255, Math.round(g / 16) * 16)
          const qb = Math.min(255, Math.round(b / 16) * 16)
          const key = `${qr},${qg},${qb}`
          const hex = `#${[qr, qg, qb].map((value) => value.toString(16).padStart(2, '0')).join('')}`
          const existing = paletteCounts.get(key)
          if (existing) existing.count += 1
          else paletteCounts.set(key, { hex, count: 1 })

          if (saturation < 0.18 || lightness > 0.9 || lightness < 0.1) {
            neutralCount += 1
            continue
          }

          let hue = 0
          const delta = max - min
          if (delta !== 0) {
            if (max === r) hue = ((g - b) / delta) % 6
            else if (max === g) hue = (b - r) / delta + 2
            else hue = (r - g) / delta + 4
            hue *= 60
            if (hue < 0) hue += 360
          }
          const bucket = getHueBucket(hue)
          hueCounts[bucket] = (hueCounts[bucket] ?? 0) + 1
        }

        const hueRatios: Record<number, number> = {}
        Object.entries(hueCounts).forEach(([bucket, count]) => {
          hueRatios[Number(bucket)] = count / total
        })

        const colors = Array.from(paletteCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 8)
          .map((entry) => ({ hex: entry.hex, ratio: entry.count / total }))

        const neutralRatio = neutralCount / total
        const colorFamilyRatios: Record<string, number> = {}
        Object.entries(categoryCounts).forEach(([name, count]) => {
          colorFamilyRatios[name] = count / total
        })
        const dominantFamilies = Object.entries(colorFamilyRatios)
          .filter(([, ratio]) => ratio >= 0.15)
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => name)
        if (dominantFamilies.length === 0) dominantFamilies.push('中性')
        const hasBlack = (colorFamilyRatios['黑色'] ?? 0) >= 0.12
        const hasGold = (colorFamilyRatios['黄色'] ?? 0) >= 0.08
        const categories = dominantFamilies.length >= 3
          ? ['多彩', ...dominantFamilies.slice(0, 2)]
          : hasBlack && hasGold
            ? ['黑金', ...dominantFamilies.filter((name) => name !== '黑色' && name !== '黄色')]
            : dominantFamilies.slice(0, 2)
        resolve({
          categories,
          colors,
          hueRatios,
          colorFamilyRatios,
          dominantFamilies,
          neutralRatio,
        })
      } catch {
        resolve({ categories: [], colors: [], hueRatios: {}, colorFamilyRatios: {}, dominantFamilies: [], neutralRatio: 0 })
      }
    }
    image.onerror = () => resolve({ categories: [], colors: [], hueRatios: {}, colorFamilyRatios: {}, dominantFamilies: [], neutralRatio: 0 })
    image.src = imageUrl
  })

const useImageColorProfiles = (sources: Array<{ id: string; url?: string }>) => {
  const cacheRef = useRef<Record<string, ImageColorProfile>>({})
  const [profiles, setProfiles] = useState<Record<string, ImageColorProfile>>({})

  useEffect(() => {
    const pending = sources.filter((source) => source.url && !cacheRef.current[source.id])
    if (pending.length === 0) return

    let active = true
    let cursor = 0
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      flushTimer = null
      if (active) setProfiles({ ...cacheRef.current })
    }
    const scheduleFlush = () => {
      if (flushTimer !== null) return
      flushTimer = setTimeout(flush, 30)
    }
    const worker = async () => {
      while (active && cursor < pending.length) {
        const source = pending[cursor]
        cursor += 1
        if (!source.url) continue
        const profile = await analyzeImageColors(source.url)
        if (!active) return
        cacheRef.current[source.id] = profile
        scheduleFlush()
      }
    }
    Array.from({ length: Math.min(4, pending.length) }, () => {
      void worker()
    })

    return () => {
      active = false
      if (flushTimer !== null) clearTimeout(flushTimer)
    }
  }, [sources])

  return profiles
}

function EmptyStateIllustration({ alt, compact = false }: { alt: string; compact?: boolean }) {
  return <img className={`empty-state-illustration${compact ? ' compact' : ''}`} src="/illustrations/empty-state-flower.svg" alt={alt} />
}

function HomePage({
  works,
  collections,
  tagTree,
  onImport,
  onOpenWork,
  onOpenLibrary,
}: {
  works: Work[]
  collections: Collection[]
  tagTree: TagNode[]
  onImport: () => void
  onOpenWork: (workId: string) => void
  onOpenLibrary: () => void
}) {
  const allPages = works.reduce((sum, work) => sum + work.pages.length, 0)
  const leafTags = useMemo(() => {
    let count = 0
    const walk = (nodes: TagNode[]) => {
      nodes.forEach((node) => {
        if (node.children.length === 0 && (node.work_count ?? 0) > 0) count += 1
        else walk(node.children)
      })
    }
    walk(filterTagTreeByScope(tagTree, 'work'))
    return count
  }, [tagTree])

  const carouselWorks = useMemo(() => {
    return [...works]
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
      .slice(0, 32)
  }, [works])

  const topCarouselWorks = useMemo(() => {
    const selected = carouselWorks.filter((_, index) => index % 2 === 0)
    return [...selected, ...selected]
  }, [carouselWorks])

  const bottomCarouselWorks = useMemo(() => {
    const selected = carouselWorks.filter((_, index) => index % 2 === 1)
    const fallback = selected.length > 0 ? selected : carouselWorks.slice(0, Math.ceil(carouselWorks.length / 2))
    return [...fallback, ...fallback]
  }, [carouselWorks])

  const relativeTime = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value.slice(0, 10)
    const diff = Date.now() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 小时前`
    if (hours < 48) return '昨天'
    return value.slice(0, 10)
  }

  const categoryOf = (work: Work) =>
    collections
      .filter((collection) => collection.pageIds.some((pageId) => work.pages.some((page) => page.id === pageId)))
      .map((collection) => collection.name)
      .slice(0, 2)
      .join(' / ') || '未分类'

  return (
    <section className="home-page home-case-page">
      <div className="home-case-banner">
        <div className="home-case-banner-copy">
          <span className="home-eyebrow">Normix · PPT 灵感集管理平台</span>
          <h1 className="home-case-banner-title">让最佳实践，持续发生</h1>
          <p>汇聚灵感，高效沉淀，让每一次创作都有迹可循。</p>
          <button className="primary-button" onClick={onImport} type="button">
            <UploadCloud size={15} />
            快速上传
          </button>
        </div>
        <div className="home-case-banner-art" aria-hidden="true">
          <img alt="" src="/home-banner-illustration.png" />
        </div>
        <div className="home-case-banner-light" aria-hidden="true">
          <i className="home-case-particle p1" />
          <i className="home-case-particle p2" />
          <i className="home-case-particle p3" />
          <i className="home-case-particle p4" />
          <i className="home-case-particle p5" />
          <i className="home-case-particle p6" />
          <i className="home-case-particle p7" />
          <i className="home-case-particle p8" />
          <i className="home-case-particle p9" />
          <i className="home-case-particle p10" />
        </div>
        <div className="home-case-banner-waves" aria-hidden="true">
          <i className="wave-a" />
          <i className="wave-b" />
          <i className="wave-c" />
        </div>
      </div>

      <div className="home-case-stats">
        <div className="home-case-stat">
          <i><WorksDocumentIcon /></i>
          <span>全部作品</span>
          <b>{works.length}</b>
          <small>本周新增 {works.length}</small>
        </div>
        <div className="home-case-stat">
          <i><CollectionFolderIcon /></i>
          <span>分类数量</span>
          <b>{collections.length}</b>
          <small>当前文件夹</small>
        </div>
        <div className="home-case-stat">
          <i><TagCountIcon /></i>
          <span>标签数量</span>
          <b>{leafTags}</b>
          <small>实际使用标签</small>
        </div>
        <div className="home-case-stat">
          <i><PageMaterialIcon /></i>
          <span>页面素材</span>
          <b>{allPages}</b>
          <small>全部页面</small>
        </div>
      </div>

      <div className="home-case-section-head">
        <strong>最新作品</strong>
        <button className="ghost-button" onClick={onOpenLibrary} type="button">
          查看全部
        </button>
      </div>

      {carouselWorks.length > 0 ? (
        <div className="home-case-stagger-shell">
          <div className="home-case-stagger-glow" aria-hidden="true" />
          <div className="home-case-stagger-stage">
            <div className="home-case-stagger-row home-case-stagger-row-top">
              <div className="home-case-stagger-track">
                {topCarouselWorks.map((work, index) => (
                  <button
                    aria-label={`${work.title}，双击打开预览`}
                    className="home-case-stagger-card"
                    data-kind={work.kind}
                    key={`${work.id}-top-${index}`}
                    onDoubleClick={() => onOpenWork(work.id)}
                    title="双击打开预览"
                    type="button"
                  >
                    <div className="home-case-stagger-cover">
                      {work.pages[0] ? <SlidePreview page={work.pages[0]} /> : <div className="empty-cover" />}
                      <span className="home-case-stagger-kind">{work.kind}</span>
                    </div>
                    <div className="home-case-stagger-info">
                      <strong>{work.title}</strong>
                      <small>{categoryOf(work)} · {work.pages.length} 页 · {relativeTime(work.uploadedAt)}</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="home-case-stagger-row home-case-stagger-row-bottom">
              <div className="home-case-stagger-track">
                {bottomCarouselWorks.map((work, index) => (
                  <button
                    aria-label={`${work.title}，双击打开预览`}
                    className="home-case-stagger-card"
                    data-kind={work.kind}
                    key={`${work.id}-bottom-${index}`}
                    onDoubleClick={() => onOpenWork(work.id)}
                    title="双击打开预览"
                    type="button"
                  >
                    <div className="home-case-stagger-cover">
                      {work.pages[0] ? <SlidePreview page={work.pages[0]} /> : <div className="empty-cover" />}
                      <span className="home-case-stagger-kind">{work.kind}</span>
                    </div>
                    <div className="home-case-stagger-info">
                      <strong>{work.title}</strong>
                      <small>{categoryOf(work)} · {work.pages.length} 页 · {relativeTime(work.uploadedAt)}</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="home-case-grid">
          <div className="home-case-empty">
            <EmptyStateIllustration compact alt="暂无作品" />
            <strong>暂无作品</strong>
            <button className="ghost-button" onClick={onImport} type="button">
              去上传
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function HomePageLegacy({
  works,
  collections,
  tagTree,
  onImport,
  onOpenWork,
  onOpenLibrary,
}: {
  works: Work[]
  collections: Collection[]
  tagTree: TagNode[]
  onImport: () => void
  onOpenWork: (workId: string) => void
  onOpenLibrary: () => void
}) {
  const [statConfigOpen, setStatConfigOpen] = useState(false)
  const [statGroupId, setStatGroupId] = useState(() => localStorage.getItem('normix-home-stat-group') ?? '')
  useEffect(() => {
    if (statGroupId) localStorage.setItem('normix-home-stat-group', statGroupId)
  }, [statGroupId])
  const allPages = works.reduce((sum, work) => sum + work.pages.length, 0)
  const workTagTree = useMemo(() => filterTagTreeByScope(tagTree, 'work'), [tagTree])
  const leafTags = (() => {
    let count = 0
    const walk = (nodes: TagNode[]) => {
      nodes.forEach((node) => {
        if (node.children.length === 0 && (node.work_count ?? 0) > 0) count += 1
        else walk(node.children)
      })
    }
    walk(workTagTree)
    return count
  })()
  const recentWorks = [...works]
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 5)
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>()
    works.forEach((work) => (work.tags ?? []).forEach((tag) => map.set(tag, (map.get(tag) ?? 0) + 1)))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [works])
  const tagPathsByName = useMemo(() => {
    const map = new Map<string, string[][]>()
    const walk = (nodes: TagNode[], ancestors: string[] = []) => {
      nodes.forEach((node) => {
        const prefix = ancestors.length > 0
          ? ancestors
          : node.group && node.group !== node.name
            ? [node.group]
            : []
        const path = [...prefix, node.name]
        const existing = map.get(node.name) ?? []
        existing.push(path)
        map.set(node.name, existing)
        walk(node.children, path)
      })
    }
    walk(workTagTree)
    return map
  }, [workTagTree])
  const statGroupOptions = useMemo(() => {
    const options: Array<{ id: string; name: string; depth: number }> = []
    const seen = new Set<string>()
    const addGroup = (id: string, name: string, depth: number) => {
      const key = `group:${name}`
      if (seen.has(key)) return
      seen.add(key)
      options.push({ id, name, depth })
    }
    const walk = (nodes: TagNode[], depth: number) => {
      nodes.forEach((node) => {
        const isGroup = node.children.length > 0 || (node.group != null && node.name === node.group)
        if (isGroup) addGroup(node.id, node.name, depth)
        walk(node.children, depth + 1)
      })
    }
    walk(workTagTree, 0)
    workTagTree.forEach((node) => {
      if (node.parent_id || node.children.length > 0 || node.name === node.group) return
      if (node.group) addGroup(`group:${node.group}`, node.group, 0)
    })
    return options
  }, [workTagTree])
  const selectedStatGroup = useMemo(
    () => statGroupOptions.find((group) => group.id === statGroupId) ?? statGroupOptions[0] ?? null,
    [statGroupOptions, statGroupId],
  )
  useEffect(() => {
    if (statGroupOptions.length > 0 && !statGroupOptions.some((group) => group.id === statGroupId)) {
      setStatGroupId(statGroupOptions[0].id)
    }
  }, [statGroupOptions, statGroupId])
  const tagPathByNodeId = useMemo(() => {
    const map = new Map<string, string[]>()
    const walk = (nodes: TagNode[], ancestors: string[] = []) => {
      nodes.forEach((node) => {
        const path = [...ancestors, node.name]
        map.set(node.id, path)
        walk(node.children, path)
      })
    }
    walk(workTagTree)
    return map
  }, [workTagTree])
  const selectedGroupTagCounts = useMemo(() => {
    if (!selectedStatGroup) return []
    const selectedPath = tagPathByNodeId.get(selectedStatGroup.id) ?? [selectedStatGroup.name]
    const map = new Map<string, number>()
    works.forEach((work) => (work.tags ?? []).forEach((tag) => {
      const inside = (tagPathsByName.get(tag) ?? []).some((path) =>
        path.length > selectedPath.length && selectedPath.every((name, index) => path[index] === name))
      if (inside) map.set(tag, (map.get(tag) ?? 0) + 1)
    }))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [selectedStatGroup, tagPathByNodeId, tagPathsByName, works])
  const maxTag = Math.max(1, ...tagCounts.map(([, count]) => count))
  const ratingCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0]
    works.forEach((work) => {
      const rating = Math.max(0, Math.min(5, work.rating ?? 0))
      counts[rating] += 1
    })
    return counts
  }, [works])
  const maxRating = Math.max(1, ...ratingCounts)
  const donutColors = ['#6f7ce0', '#7fd7e5', '#d9a441', '#f2b8c4', '#15102c', '#eef1ff']
  const homeChartColors = ['#6f7ce0', '#7fd7e5', '#d9a441', '#ef8f9f', '#8f98e8', '#9ca4b5']
  const makeDonut = (label: string, entries: Array<[string, number]>, totalLabel: string) => {
    const list = entries.slice(0, 5)
    const total = entries.reduce((sum, [, count]) => sum + count, 0)
    const shownTotal = list.reduce((sum, [, count]) => sum + count, 0)
    let donutCursor = 0
    const segments = list.map(([name, count], index) => {
      const start = donutCursor
      donutCursor += (count / Math.max(1, total)) * 100
      return { label: name, count, color: donutColors[index % donutColors.length], start, end: donutCursor }
    })
    if (total > shownTotal) {
      const start = donutCursor
      donutCursor = 100
      segments.push({ label: '其他', count: total - shownTotal, color: '#d4d4d8', start, end: donutCursor })
    }
    const style: CSSProperties = total > 0
      ? {
          background: `conic-gradient(${segments
            .map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`)
            .join(', ')})`,
        }
      : { background: '#ececee' }
    return { label, total, totalLabel, segments, style }
  }
  const groupStatData = makeDonut(selectedStatGroup?.name ?? '未选择标签组', selectedGroupTagCounts, '作品')
  const worksThisWeek = works.filter((work) => {
    const time = new Date(work.uploadedAt).getTime()
    return Number.isFinite(time) && Date.now() - time < 7 * 24 * 60 * 60 * 1000
  }).length
  const relativeUploadTime = (value: string) => {
    const time = new Date(value).getTime()
    if (!Number.isFinite(time)) return value
    const diff = Date.now() - time
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    if (hours < 24) return `${hours} 小时前`
    if (hours < 48) return '昨天'
    return value.slice(0, 10)
  }


  return (
    <section className="home-page">
      <header className="home-topbar">
        <div className="home-topbar-title">
          <strong>首页</strong>
          <span>作品库、分类、标签与整体趋势</span>
        </div>
        <div className="home-topbar-actions">
          <label className="home-search-box">
            <Search size={14} />
            <input
              onKeyDown={(event) => {
                if (event.key === 'Enter') onOpenLibrary()
              }}
              placeholder="搜索作品、分类、标签"
            />
          </label>
        </div>
      </header>

      <div className="home-dashboard">
        <div className="home-left">
          <div className="home-hero">
            <div className="home-hero-copy">
              <span className="home-eyebrow">Normix · PPT 灵感集管理平台</span>
              <h1>让最佳实践，持续发生</h1>
              <p>汇聚灵感，高效沉淀，让每一次创作都有迹可循。</p>
              <button className="home-hero-upload" onClick={onImport} type="button">
                <UploadCloud size={18} />
                快速上传
              </button>
            </div>
            <div className="home-hero-illustration" aria-hidden="true">
              <img alt="" src="/home-banner-illustration.png" />
            </div>
            <div className="home-hero-light" aria-hidden="true">
              <i className="home-hero-particle particle-a" />
              <i className="home-hero-particle particle-b" />
              <i className="home-hero-particle particle-c" />
              <i className="home-hero-particle particle-d" />
              <i className="home-hero-particle particle-e" />
              <i className="home-hero-particle particle-f" />
            </div>
          </div>

          <div className="home-panel">
            <div className="home-panel-head">
              <div>
                <strong>最近上传</strong>
                <span>最近 5 个作品</span>
              </div>
              <button className="ghost-button" onClick={onOpenLibrary} type="button">
                查看全部
              </button>
            </div>
            <div className="home-recent-list">
              {recentWorks.length === 0 && <em>暂无作品</em>}
              {recentWorks.map((work) => (
                <button className="home-recent-item" key={work.id} onClick={() => onOpenWork(work.id)} type="button">
                  <div className="home-recent-cover">
                    {work.pages[0] ? <SlidePreview page={work.pages[0]} /> : <div className="empty-cover" />}
                  </div>
                  <span>
                    <strong>{work.title}</strong>
                    <small>{work.kind} · {work.pages.length} 页 · {relativeUploadTime(work.uploadedAt)}</small>
                  </span>
                  <i className="home-recent-avatar">{work.kind.slice(0, 1)}</i>
                  <em>{work.kind}</em>
                </button>
              ))}
            </div>
          </div>

        </div>

        <div className="home-right">
          <div className="home-stats">
            <div className="home-stat-card accent-blue">
              <i className="home-stat-icon"><Library size={28} /></i>
              <span>作品总数</span>
              <b>{works.length}</b>
              <small className="home-stat-trend neutral">本周新增 {worksThisWeek}</small>
            </div>
            <div className="home-stat-card accent-teal">
              <i className="home-stat-icon"><Tags size={28} /></i>
              <span>标签数量</span>
              <b>{leafTags}</b>
              <small className="home-stat-trend neutral">实际使用标签</small>
            </div>
            <div className="home-stat-card accent-amber">
              <i className="home-stat-icon"><FolderKanban size={28} /></i>
              <span>分类数量</span>
              <b>{collections.length}</b>
              <small className="home-stat-trend neutral">当前文件夹</small>
            </div>
            <div className="home-stat-card accent-rose">
              <i className="home-stat-icon"><ImageIcon size={28} /></i>
              <span>页面素材</span>
              <b>{allPages}</b>
              <small className="home-stat-trend neutral">全部页面</small>
            </div>
          </div>

          <div className="home-panel">
            <div className="home-panel-head">
              <div>
                <strong>分类统计</strong>
                <span>按标签组统计</span>
              </div>
              <button className="ghost-button" onClick={() => setStatConfigOpen((open) => !open)} type="button">
                配置标签组
              </button>
            </div>
            <div className="home-donut-wrap">
              <div className="home-mini-donut">
                <div className="home-donut small" style={groupStatData.style}>
                  <div className="home-donut-center">
                    <b>{groupStatData.total}</b>
                    <span>{groupStatData.totalLabel}</span>
                  </div>
                </div>
                <small>{groupStatData.label}</small>
              </div>
              <div className="home-donut-legend">
                {groupStatData.segments.map((segment) => (
                  <div key={segment.label}>
                    <i style={{ background: segment.color }} />
                    <span>{segment.label}</span>
                    <b>{segment.count}</b>
                    <em>{Math.round(segment.end - segment.start)}%</em>
                  </div>
                ))}
                {groupStatData.segments.length === 0 && <em>暂无数据</em>}
              </div>
            </div>
            {statConfigOpen && (
              <div className="home-stat-config">
                <div className="home-stat-config-title">选择标签组</div>
                {statGroupOptions.length === 0 ? (
                  <em>暂无标签组，请先在标签管理中创建分组</em>
                ) : statGroupOptions.map((group) => (
                  <button
                    className={`home-stat-group-option${group.id === selectedStatGroup?.id ? ' active' : ''}`}
                    key={group.id}
                    onClick={() => setStatGroupId(group.id)}
                    style={{ paddingLeft: `${10 + group.depth * 16}px` }}
                    type="button"
                  >
                    <span>{group.name}</span>
                    <em>标签组</em>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="home-insight-grid">
            <div className="home-panel">
              <div className="home-panel-head">
                <div>
                  <strong>热门标签</strong>
                  <span>按作品标签统计</span>
                </div>
                <button className="ghost-button" onClick={onOpenLibrary} type="button">
                  查看全部
                </button>
              </div>
              <div className="home-column-chart">
                {tagCounts.map(([tag, count], index) => (
                  <div className="home-column-item" key={tag} title={tag}>
                    <i><b style={{ height: `${(count / maxTag) * 100}%`, background: homeChartColors[index % homeChartColors.length] }} /></i>
                    <span>{tag}</span>
                    <em>{count}</em>
                  </div>
                ))}
                {tagCounts.length === 0 && <em className="home-chart-empty">暂无标签</em>}
              </div>
            </div>

            <div className="home-panel">
              <div className="home-panel-head">
                <div>
                  <strong>作品类型分析</strong>
                  <span>按作品标签统计</span>
                </div>
              </div>
              <div className="home-column-chart">
                {tagCounts.map(([tag, count], index) => (
                  <div className="home-column-item" key={tag} title={tag}>
                    <i><b style={{ height: `${(count / maxTag) * 100}%`, background: homeChartColors[(index + 1) % homeChartColors.length] }} /></i>
                    <span>{tag}</span>
                    <em>{count}</em>
                  </div>
                ))}
                {tagCounts.length === 0 && <em className="home-chart-empty">暂无作品类型</em>}
              </div>
            </div>

            <div className="home-panel">
              <div className="home-panel-head">
                <div>
                  <strong>作品评分</strong>
                  <span>质量概览</span>
                </div>
              </div>
              <div className="home-column-chart">
                {['未评分', '1 星', '2 星', '3 星', '4 星', '5 星'].map((label, index) => (
                  <div className="home-column-item" key={label}>
                    <i><b style={{ height: `${(ratingCounts[index] / maxRating) * 100}%`, background: homeChartColors[(index + 2) % homeChartColors.length] }} /></i>
                    <span>{label}</span>
                    <em>{ratingCounts[index]}</em>
                  </div>
                ))}
              </div>
            </div>
          </div>
      </div>
      </div>
    </section>
  )
}

void HomePageLegacy

function SettingsPage() {
  const [info, setInfo] = useState<{
    storageDir: string
    defaultStorageDir: string
    dataDir: string
    usage: Record<string, number>
  } | null>(null)
  const [targetDir, setTargetDir] = useState('')
  const [migrating, setMigrating] = useState(false)
  const [message, setMessage] = useState('')

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings')
      if (!response.ok) throw new Error('加载设置失败')
      setInfo(await response.json())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载设置失败')
    }
  }

  useEffect(() => {
    void loadSettings()
  }, [])

  const pickFolder = async () => {
    setMessage('')
    try {
      const response = await fetch('/api/settings/pick-folder', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '无法选择文件夹')
      setTargetDir(data.path)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法选择文件夹')
    }
  }

  const migrate = async () => {
    const nextDir = targetDir.trim()
    if (!nextDir || migrating) return
    setMigrating(true)
    setMessage('')
    try {
      const response = await fetch('/api/settings/storage/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageDir: nextDir }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '迁移失败')
      setInfo((current) => current ? { ...current, storageDir: data.storageDir } : current)
      setTargetDir('')
      setMessage('已迁移到新位置')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '迁移失败')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <section className="settings-page">
      <div className="settings-page-head">
        <strong>设置</strong>
        <span>文件存储位置</span>
      </div>
      <div className="settings-card">
        <div className="settings-card-title">
          <span>当前存储目录</span>
          <b>{info?.storageDir ?? '加载中...'}</b>
        </div>
        <div className="settings-card-title">
          <span>默认目录</span>
          <b>{info?.defaultStorageDir ?? '加载中...'}</b>
        </div>
        <div className="settings-card-title">
          <span>数据库目录</span>
          <b>{info?.dataDir ?? '加载中...'}</b>
        </div>
        <div className="settings-usage">
          {info && Object.entries(info.usage).map(([key, value]) => (
            <div key={key}>
              <span>{({ uploads: '上传缓存', thumbnails: '缩略图', previews: '旧预览图', originals: '原图', sources: '源文件', total: '总计' } as Record<string, string>)[key] ?? key}</span>
              <b>{formatBytes(value)}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-card-title">
          <span>新的存储目录</span>
          <div className="settings-dir-picker">
            <b>{targetDir || '尚未选择'}</b>
            <button className="ghost-button" onClick={() => void pickFolder()} type="button">
              选择存储文件夹
            </button>
          </div>
        </div>
        <button className="primary-button" disabled={migrating || !targetDir.trim()} onClick={() => void migrate()} type="button">
          {migrating ? '迁移中...' : '迁移到新位置'}
        </button>
        {message && <p className="settings-message">{message}</p>}
      </div>
    </section>
  )
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('home')
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem('normix-sidebar-collapsed') === '1',
  )
  const [collectionsFolderRequest, setCollectionsFolderRequest] = useState('')
  const [libraryReturnState, setLibraryReturnState] = useState<{ selectedWorkIds: string[]; scrollTop: number } | null>(null)
  const [works, setWorks] = useState<Work[]>(initialWorks)
  const [collections, setCollections] = useState<Collection[]>(initialCollections)
  const [selectedWorkId, setSelectedWorkId] = useState('')
  const [notice, setNotice] = useState('')
  const [trashWorks, setTrashWorks] = useState<TrashWork[]>([])
  const [tagTree, setTagTree] = useState<TagNode[]>([])
  const [tagResourceRequest, setTagResourceRequest] = useState<{ scope: 'work' | 'page'; tagId: string; tagName: string } | null>(null)
  const [lastTrashedIds, setLastTrashedIds] = useState<string[]>([])
  const [viewerTrashWorkId, setViewerTrashWorkId] = useState('')
  const [uploadProgress, setUploadProgress] = useState<{
    current: number
    total: number
    fileName: string
    phase: 'upload' | 'parse'
    percent: number
    stage?: string
    processed?: number
    pageTotal?: number
    speed?: number
    bytesLoaded?: number
    bytesTotal?: number
    eta?: string
  } | null>(null)
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([])
  const lastUploadProgressRef = useRef(0)
  const lastUploadCurrentRef = useRef(0)
  const uploadBytesTotalRef = useRef(0)
  const uploadBytesLoadedRef = useRef(new Map<File, number>())
  const uploadSpeedSamplesRef = useRef<Array<{ time: number; bytes: number }>>([])
  const completedUploadsRef = useRef(0)
  const uploadCancelledRef = useRef(false)
  const activeTaskIdsRef = useRef<string[]>([])
  const uploadOverallPercentRef = useRef(0)
  const updateUploadProgress = (next: {
    current: number
    total: number
    fileName: string
    phase: 'upload' | 'parse'
    percent: number
    stage?: string
    processed?: number
    pageTotal?: number
    speed?: number
    bytesLoaded?: number
    bytesTotal?: number
    eta?: string
  }) => {
    const percent = Math.max(next.percent, lastUploadProgressRef.current)
    const current = Math.max(next.current, lastUploadCurrentRef.current)
    lastUploadProgressRef.current = percent
    lastUploadCurrentRef.current = current
    setUploadProgress({ ...next, current, percent })
  }
  const updateUploadJob = (id: string, patch: Partial<UploadJob>) => {
    setUploadJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)))
  }
  const [dragImportActive, setDragImportActive] = useState(false)
  const [viewerPage, setViewerPage] = useState<GalleryPage | null>(null)
  const [viewerPages, setViewerPages] = useState<GalleryPage[]>([])
  const [viewerPageIndex, setViewerPageIndex] = useState(0)
  const [viewerZoom, setViewerZoom] = useState(100)
  const [workZoom, setWorkZoom] = useState(100)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    localStorage.setItem('normix-sidebar-collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
    })
    return () => cancelAnimationFrame(frame)
  }, [activeView])
  useEffect(() => {
    localStorage.removeItem('normix-upload-history')
  }, [])
  useEffect(() => {
    const syncVisibility = () => {
      document.documentElement.classList.toggle('document-hidden', document.hidden)
    }
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => document.removeEventListener('visibilitychange', syncVisibility)
  }, [])
  const skipNextAutoSaveRef = useRef(false)
  const worksRef = useRef<Work[]>([])
  const collectionsRef = useRef<Collection[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingImportFolderRef = useRef<string | null>(null)
  const collectionsUndoRef = useRef<Collection[][]>([])
  const collectionsRedoRef = useRef<Collection[][]>([])

  worksRef.current = works
  collectionsRef.current = collections

  const allPages = useMemo(() => works.flatMap((work) => work.pages), [works])
  const selectedWork = works.find((work) => work.id === selectedWorkId) ?? works[0]

  useEffect(() => {
    let active = true
    const loadRelationalState = async () => {
      const [worksResponse, foldersResponse, trashResponse, tagTreeResponse] = await Promise.all([
        fetch('/api/works?page=1&limit=1000'),
        fetch('/api/folders'),
        fetch('/api/trash'),
        fetch('/api/tags/tree'),
      ])
      if (!worksResponse.ok || !foldersResponse.ok || !trashResponse.ok || !tagTreeResponse.ok) throw new Error('load failed')
      const [worksData, foldersData, trashData, tagTreeData] = await Promise.all([
        worksResponse.json(),
        foldersResponse.json(),
        trashResponse.json(),
        tagTreeResponse.json(),
      ])
      const relationalPages: Array<{
        id: string
        work_id: string
        page_no: number
        title?: string
        thumbnail_path: string
        preview_path: string
        original_path: string
        rating?: number
        tags?: string[]
        tagIds?: string[]
        folderIds?: string[]
      }> = []
      let pageIndex = 1
      let totalPages = Infinity
      while (pageIndex * 200 < totalPages + 200) {
        const pagesResponse = await fetch(`/api/pages?page=${pageIndex}&limit=200`)
        if (!pagesResponse.ok) throw new Error('load failed')
        const pagesData = await pagesResponse.json()
        relationalPages.push(...pagesData.pages)
        totalPages = pagesData.total
        if (pageIndex * 200 >= totalPages) break
        pageIndex += 1
      }
      const nextWorks: Work[] = (worksData.works as Array<Work & { created_at?: string }>).map((work) => {
        const workPages = relationalPages
          .filter((page) => page.work_id === work.id)
          .sort((a, b) => a.page_no - b.page_no)
          .map<GalleryPage>((page) => ({
            id: page.id,
            pageNumber: page.page_no,
            title: page.title || `第 ${page.page_no} 页`,
            layout: page.page_no === 1 ? '封面' : '页面',
            tags: page.tags ?? [],
            tagIds: page.tagIds ?? [],
            note: '',
            palette: '',
            previewKind: 'image',
            imageUrl: `/api/pages/${page.id}/thumbnail`,
            previewUrl: `/api/pages/${page.id}/preview?v=1`,
            originalUrl: `/api/pages/${page.id}/original?v=1`,
            saved: true,
            rating: page.rating ?? 0,
          }))
        return {
          ...work,
          fileName: work.fileName || work.file_name || '',
          kind: work.kind,
          pages: workPages,
          uploader: '当前用户',
          uploadedAt: work.uploadedAt || String(work.created_at ?? '').slice(0, 10),
          tags: work.tags ?? [],
          status: work.status || '已入库',
          failed: work.failed,
          description: work.description || '',
        }
      })
      const nextCollections: Collection[] = (foldersData.folders as Array<{
        id: string
        name: string
        description?: string
        parent_id?: string
        sort_order?: number
      }>).map((folder) => ({
        id: folder.id,
        name: folder.name,
        description: folder.description ?? '',
        pageIds: relationalPages.filter((page) => page.folderIds?.includes(folder.id)).map((page) => page.id),
        owner: '当前用户',
        parentId: folder.parent_id || undefined,
        order: folder.sort_order ?? 0,
      }))
      if (!active) return
      if (nextWorks.length === 0) {
        const legacyResponse = await fetch('/api/state')
        if (legacyResponse.ok) {
          const legacyData = await legacyResponse.json()
          if (!active) return
          setWorks((legacyData.works ?? []).map((work: Work) => ({
            ...work,
            fileName: work.fileName || work.file_name || '',
            tags: work.tags ?? [],
            description: '',
          })))
          setCollections(legacyData.collections ?? [])
          setTrashWorks([])
          setTagTree([])
          if (legacyData.works?.[0]?.id) setSelectedWorkId(legacyData.works[0].id)
          setReady(true)
          return
        }
      }
      setWorks(nextWorks)
      setCollections(nextCollections)
      setTrashWorks((trashData.works ?? []).map((work: TrashWork) => ({
        ...work,
        pageCount: work.pageCount ?? 0,
        deletedAt: work.deletedAt ?? '',
        tags: work.tags ?? [],
      })))
      setTagTree((tagTreeData.tags ?? []) as TagNode[])
      if (nextWorks[0]?.id) setSelectedWorkId(nextWorks[0].id)
      setReady(true)
    }

    loadRelationalState().catch(() => {
      if (!active) return
      fetch('/api/state')
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load failed'))))
        .then((data) => {
          if (!active) return
          setWorks((data.works ?? []).map((work: Work) => ({ ...work, tags: work.tags ?? [], description: '' })))
          setCollections(data.collections ?? [])
          setTrashWorks([])
          setTagTree([])
          if (data.works?.[0]?.id) setSelectedWorkId(data.works[0].id)
          setReady(true)
        })
        .catch(() => {
          if (!active) return
          setReady(true)
        })
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (activeView !== 'trash') return
    let active = true
    fetch('/api/trash')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load failed'))))
      .then((data) => {
        if (!active) return
        setTrashWorks((data.works ?? []).map((work: TrashWork) => ({
          ...work,
          pageCount: work.pageCount ?? 0,
          deletedAt: work.deletedAt ?? '',
          tags: work.tags ?? [],
        })))
      })
      .catch(() => {
        if (active) setTrashWorks([])
      })
    return () => {
      active = false
    }
  }, [activeView])

  useEffect(() => {
    const rawNotice = sessionStorage.getItem('normix-upload-notice')
    if (rawNotice) {
      setNotice(rawNotice)
      sessionStorage.removeItem('normix-upload-notice')
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 2600)
    return () => clearTimeout(timer)
  }, [notice])

  const createWorksFromFiles = async (files: File[]) => {
    if (files.length === 0) return

    setNotice('正在解析文件...')

    const createdWorks: Work[] = await Promise.all(files.map(async (file, index) => {
      const kind = getKind(file.name)
      const id = `w-${Date.now()}-${index}`
      const seed = worksRef.current.length + index
      const workIndustry = industries[(seed % (industries.length - 1)) + 1]
      const workStyle = styles[(seed % (styles.length - 1)) + 1]
      const rawPages =
        kind === 'IMAGE'
          ? [pageFromImage(id, 1, URL.createObjectURL(file), file.name, seed, [])]
          : kind === 'PDF'
            ? await renderPdfPages(file, id, seed)
            : kind === 'ZIP'
              ? await extractZipPages(file, id, seed)
              : await extractPptxPages(file, id, seed)
      const pages = rawPages.length > 1 ? withCoverBackTags(rawPages) : rawPages

      const hasRealPreview = pages.some((page) => Boolean(page.imageUrl))

      return {
        id,
        title: file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        kind,
        pages,
        uploader: '当前用户',
        uploadedAt: new Date().toISOString().slice(0, 10),
        industry: workIndustry,
        purpose: purposes[seed % purposes.length],
        style: workStyle,
        color: colors[seed % colors.length],
        quality: '待筛选',
        copyright: '未知',
        tags: [],
        status: hasRealPreview ? '已入库' : '待整理',
        description: '',
      }
    }))

    const nextWorks = [...createdWorks, ...worksRef.current]
    skipNextAutoSaveRef.current = true
    setWorks(nextWorks)
    setSelectedWorkId(createdWorks[0].id)
    setActiveView('library')
    setNotice(`正在保存 ${createdWorks.length} 个文件...`)
    try {
      await persistAppState(nextWorks, collectionsRef.current)
      setNotice(`已导入 ${createdWorks.length} 个文件`)
    } catch {
      setNotice(`已导入 ${createdWorks.length} 个文件`)
    }
  }

  const importFiles = async (files: File[], folderId?: string) => {
    if (files.length === 0) return
    const phaseWeight = uploadPhaseWeight(files)
    setUploadJobs(files.map((file, index) => ({
      id: `${index}-${file.name}`,
      fileName: file.name,
      size: file.size,
      status: 'queued',
      percent: 0,
    })))
    uploadOverallPercentRef.current = 0
    lastUploadProgressRef.current = 0
    lastUploadCurrentRef.current = 0
    completedUploadsRef.current = 0
    uploadBytesTotalRef.current = files.reduce((sum, file) => sum + file.size, 0)
    uploadBytesLoadedRef.current = new Map()
    uploadSpeedSamplesRef.current = []
    uploadCancelledRef.current = false
    activeTaskIdsRef.current = []
    try {
      const tasks: Array<{ taskId: string; fileName: string; workId?: string; jobId: string; size: number }> = []
      const failedFiles: string[] = []
      const duplicateFiles: Array<{ fileName: string; duplicateTitle?: string }> = []
      const uploadResults: Array<{ index: number; taskId: string; fileName: string; workId?: string; jobId: string; size: number } | null> = new Array(files.length)
      let nextUploadIndex = 0
      let activeUploadCount = 0

      const refreshUploadProgress = (activeFile?: File, recordSample = true) => {
        let loadedBytes = 0
        for (const loaded of uploadBytesLoadedRef.current.values()) loadedBytes += loaded
        const totalBytes = uploadBytesTotalRef.current || 1
        const percent = Math.min(phaseWeight, phaseWeight * (loadedBytes / totalBytes))
        const now = performance.now()
        if (recordSample) {
          const samples = uploadSpeedSamplesRef.current
          samples.push({ time: now, bytes: loadedBytes })
          while (samples.length > 20 || (samples.length > 2 && now - samples[0].time > 2500)) samples.shift()
        }
        const samples = uploadSpeedSamplesRef.current
        const first = samples[0]
        const last = samples[samples.length - 1]
        const speed = first && last && last.time > first.time
          ? Math.max(0, ((last.bytes - first.bytes) / (last.time - first.time)) * 1000)
          : 0
        const remaining = Math.max(0, uploadBytesTotalRef.current - loadedBytes)
        const eta = formatEta(speed > 0 ? remaining / speed : 0)
        const current = Math.min(files.length, Math.max(1, completedUploadsRef.current + activeUploadCount))
        updateUploadProgress({
          current,
          total: files.length,
          fileName: '',
          phase: 'upload',
          percent,
          stage: activeFile ? '正在导入' : '导入文件',
          speed,
          eta,
          bytesLoaded: loadedBytes,
          bytesTotal: uploadBytesTotalRef.current,
        })
      }

      const uploadWorker = async () => {
        while (nextUploadIndex < files.length) {
          if (uploadCancelledRef.current) break
          const index = nextUploadIndex
          nextUploadIndex += 1
          const file = files[index]
          const jobId = `${index}-${file.name}`
          activeUploadCount += 1
          updateUploadJob(jobId, { status: 'uploading', percent: 0 })
          try {
            const data = await uploadFileWithRetry(file, (fraction) => {
              uploadBytesLoadedRef.current.set(file, Number.isFinite(fraction) ? file.size * Math.min(1, fraction) : file.size)
              updateUploadJob(jobId, {
                status: 'uploading',
                percent: Math.min(Math.round(phaseWeight * 100), Math.round((Number.isFinite(fraction) ? fraction : 1) * phaseWeight * 100)),
              })
              refreshUploadProgress(file)
            })
            uploadBytesLoadedRef.current.set(file, file.size)
            refreshUploadProgress(file)
            if (data.duplicate) {
              duplicateFiles.push({ fileName: file.name, duplicateTitle: data.duplicateTitle })
              updateUploadJob(jobId, { status: 'duplicate', percent: 100 })
            } else {
              uploadResults[index] = { index, taskId: data.taskId as string, fileName: file.name, workId: data.workId, jobId, size: file.size }
              activeTaskIdsRef.current.push(data.taskId as string)
              updateUploadJob(jobId, { status: 'parsing', percent: Math.round(phaseWeight * 100) })
              if (uploadCancelledRef.current) {
                void fetch(`/api/tasks/${encodeURIComponent(data.taskId as string)}/cancel`, { method: 'POST' }).catch(() => null)
              }
            }
          } catch {
            failedFiles.push(file.name)
            updateUploadJob(jobId, { status: 'failed' })
          } finally {
            uploadBytesLoadedRef.current.delete(file)
            completedUploadsRef.current += 1
            activeUploadCount -= 1
            refreshUploadProgress(undefined, false)
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, () => uploadWorker()))
      if (uploadCancelledRef.current) {
        setUploadProgress(null)
        return
      }
      for (const result of uploadResults
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => a.index - b.index)) {
        tasks.push({ taskId: result.taskId, fileName: result.fileName, workId: result.workId, jobId: result.jobId, size: result.size })
      }
      activeTaskIdsRef.current = tasks.map((task) => task.taskId)
      if (tasks.length === 0 && duplicateFiles.length > 0) {
        sessionStorage.setItem('normix-upload-notice', `已跳过 ${duplicateFiles.length} 个重复文件`)
        window.location.reload()
        return
      }
      if (tasks.length === 0) throw new Error('all uploads failed')
      const parseProgress = new Map<string, number>()
      const parseWorkState = new Map<string, { processed: number; total: number }>()
      let parseLastProgressTime = performance.now()
      let parseLastProcessedTotal = 0
      let parseEmaRate = 0
      let lastOverallEta = 0
      let completedParses = 0
      let nextParseIndex = 0
      const refreshParseProgress = (fileName: string, processed?: number, pageTotal?: number, stage = '处理中') => {
        let totalProgress = 0
        for (const progress of parseProgress.values()) totalProgress += progress
        let totalProcessed = 0
        let totalRemaining = 0
        for (const state of parseWorkState.values()) {
          totalProcessed += Math.min(state.processed, state.total)
          totalRemaining += Math.max(0, state.total - state.processed)
        }
        const now = performance.now()
        const elapsedSeconds = Math.max(0.25, (now - parseLastProgressTime) / 1000)
        const processedDelta = Math.max(0, totalProcessed - parseLastProcessedTotal)
        if (processedDelta > 0) {
          const rate = processedDelta / elapsedSeconds
          parseEmaRate = parseEmaRate === 0 ? rate : parseEmaRate * 0.75 + rate * 0.25
          parseLastProgressTime = now
          parseLastProcessedTotal = totalProcessed
        }
        const overallEta = parseEmaRate > 0 ? totalRemaining / parseEmaRate : undefined
        let smoothedEta = overallEta
        if (totalRemaining > 0 && overallEta !== undefined) {
          smoothedEta = lastOverallEta === 0 ? overallEta : lastOverallEta * 0.65 + overallEta * 0.35
          lastOverallEta = smoothedEta
        } else if (totalRemaining > 0 && lastOverallEta > 0) {
          smoothedEta = lastOverallEta
        } else {
          lastOverallEta = 0
        }
        const percent = Math.min(
          1,
          phaseWeight + (1 - phaseWeight) * (totalProgress / Math.max(1, tasks.length) / 100),
        )
        const current = Math.min(tasks.length, Math.max(completedParses + 1, Math.ceil(percent * tasks.length)))
        updateUploadProgress({
          current,
          total: files.length,
          fileName,
          phase: 'parse',
          percent,
          stage,
          processed,
          pageTotal,
          eta: formatEta(smoothedEta),
        })
      }
      const fetchTaskState = async (taskId: string) => {
        let attempt = 0
        for (;;) {
          try {
            const response = await fetch(`/api/tasks/${taskId}`)
            const taskState = (await response.json().catch(() => null)) as { status?: string; progress?: unknown; stage?: string; processed?: unknown; total?: unknown } | null
            if (!response.ok || !taskState) throw new Error('task failed')
            return taskState
          } catch (error) {
            if (attempt >= 2) throw error
            attempt += 1
            await wait(350 * attempt)
          }
        }
      }
      const parseWorker = async () => {
        while (nextParseIndex < tasks.length) {
          if (uploadCancelledRef.current) break
          const task = tasks[nextParseIndex]
          nextParseIndex += 1
          const startedAt = performance.now()
          let emaRate = 0
          let lastJobPercent = Math.round(phaseWeight * 100)
          try {
            for (;;) {
              if (uploadCancelledRef.current) throw new Error('cancelled')
              const taskState = await fetchTaskState(task.taskId)
              if (uploadCancelledRef.current) throw new Error('cancelled')
              if (taskState.status === 'done') break
              if (taskState.status === 'error') throw new Error('task failed')
              const taskProgress = Number(taskState.progress)
              const progress = Number.isFinite(taskProgress) ? Math.max(0, Math.min(100, taskProgress)) : 50
              parseProgress.set(task.taskId, progress)
              const processed = Number(taskState.processed) || 0
              const total = Number(taskState.total) || 0
              const now = performance.now()
              parseWorkState.set(task.taskId, { processed, total })
              let jobPercent = lastJobPercent
              let jobEta: string | undefined
              if (processed > 0 && total > 0) {
                const elapsedMs = Math.max(1, now - startedAt)
                const averageRate = processed / elapsedMs
                emaRate = emaRate === 0 ? averageRate : emaRate * 0.7 + averageRate * 0.3
                const remainingMs = (total - processed) / Math.max(0.001, emaRate)
                const timeRatio = Math.min(1, elapsedMs / (elapsedMs + remainingMs))
                jobPercent = Math.max(
                  lastJobPercent,
                  Math.min(100, Math.round(phaseWeight * 100 + (1 - phaseWeight) * 100 * timeRatio)),
                )
                jobEta = formatEta(remainingMs / 1000)
              } else {
                jobPercent = Math.max(
                  lastJobPercent,
                  Math.min(100, Math.round(phaseWeight * 100 + (1 - phaseWeight) * 100 * (progress / 100))),
                )
              }
              lastJobPercent = jobPercent
              updateUploadJob(task.jobId, {
                status: 'parsing',
                percent: jobPercent,
                eta: jobEta,
              })
              refreshParseProgress(
                task.fileName,
                Number(taskState.processed) || 0,
                Number(taskState.total) || 0,
                taskState.stage || '处理中',
              )
              await wait(350)
            }
            parseProgress.set(task.taskId, 100)
            const doneTotal = parseWorkState.get(task.taskId)?.total ?? 0
            parseWorkState.set(task.taskId, { processed: doneTotal, total: doneTotal })
            refreshParseProgress(task.fileName)
            updateUploadJob(task.jobId, { status: 'done', percent: 100, eta: undefined })
          } catch {
            if (!uploadCancelledRef.current) {
              failedFiles.push(task.fileName)
              const failedTotal = parseWorkState.get(task.taskId)?.total ?? 0
              parseWorkState.set(task.taskId, { processed: failedTotal, total: failedTotal })
              updateUploadJob(task.jobId, { status: 'failed', eta: undefined })
            }
          } finally {
            completedParses += 1
            refreshParseProgress(files[files.length - 1]?.name ?? '')
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, () => parseWorker()))
      if (uploadCancelledRef.current) {
        setUploadProgress(null)
        return
      }
      updateUploadProgress({
        current: tasks.length,
        total: files.length,
        fileName: files[files.length - 1]?.name ?? '',
        phase: 'parse',
        percent: failedFiles.length > 0 ? 0.99 : 1,
        stage: failedFiles.length > 0 ? '部分文件失败' : '完成',
      })
      await new Promise((resolve) => setTimeout(resolve, 300))
      if (folderId) {
        for (const task of tasks) {
          if (!task.workId) continue
          try {
            const detailResponse = await fetch(`/api/works/${task.workId}`)
            if (!detailResponse.ok) continue
            const detail = (await detailResponse.json()) as { pages?: Array<{ id: string }> }
            const pageIds = (detail.pages ?? []).map((page) => page.id)
            if (pageIds.length > 0) {
              await fetch('/api/pages/folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageIds, folderId }),
              })
            }
          } catch {
            // Folder assignment is best-effort; imported files remain accessible.
          }
        }
      }
      pendingImportFolderRef.current = null
      if (duplicateFiles.length > 0) {
        sessionStorage.setItem('normix-upload-notice', `已跳过 ${duplicateFiles.length} 个重复文件`)
      }
      setUploadProgress(null)
      window.location.reload()
    } catch {
      pendingImportFolderRef.current = null
      setUploadProgress(null)
      setNotice('后端解析失败，使用本地解析')
      await createWorksFromFiles(files)
    }
  }

  const cancelUpload = async () => {
    uploadCancelledRef.current = true
    const taskIds = activeTaskIdsRef.current
    activeTaskIdsRef.current = []
    await Promise.all(
      taskIds.map((taskId) =>
        fetch(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' }).catch(() => null),
      ),
    )
    setUploadProgress(null)
    setNotice('已取消导入')
  }

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (!ready) {
      event.target.value = ''
      setNotice('数据加载中，请稍后重试')
      return
    }
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void importFiles(files, pendingImportFolderRef.current ?? undefined)
  }

  const importFilesToFolder = (folderId: string) => {
    pendingImportFolderRef.current = folderId
    fileInputRef.current?.click()
  }

  const deleteWorks = async (workIds: string[]) => {
    if (workIds.length === 0) return
    const idSet = new Set(workIds)
    const trashedWorks = worksRef.current
      .filter((work) => idSet.has(work.id))
      .map((work): TrashWork => ({
        id: work.id,
        title: work.title,
        fileName: work.fileName,
        kind: work.kind,
        pageCount: work.pages.length,
        deletedAt: new Date().toISOString(),
        tags: work.tags ?? [],
        tagIds: work.tagIds ?? [],
      }))
    const nextWorks = worksRef.current.filter((work) => !idSet.has(work.id))
    setWorks(nextWorks)
    setTrashWorks((current) => [...trashedWorks, ...current.filter((work) => !idSet.has(work.id))])
    setSelectedWorkId((current) => (idSet.has(current) ? nextWorks[0]?.id ?? '' : current))
    setNotice('正在移入回收站...')
    try {
      const responses = await Promise.all(
        workIds.map((workId) =>
          fetch(`/api/works/${workId}`, { method: 'DELETE' }),
        ),
      )
      if (responses.some((response) => !response.ok)) {
        setNotice('部分作品删除失败，请刷新后重试')
        window.setTimeout(() => window.location.reload(), 600)
        return
      }
    } catch {
      setNotice('移入回收站失败')
      window.setTimeout(() => window.location.reload(), 600)
      return
    }
    setLastTrashedIds(workIds)
    setNotice(workIds.length > 1 ? `已移入回收站 ${workIds.length} 个作品` : '已移入回收站')
    window.setTimeout(() => {
      setLastTrashedIds((current) => current.filter((id) => !idSet.has(id)))
    }, 6000)
    if (activeView === 'work') setActiveView('library')
  }

  const deleteWork = (workId: string) => void deleteWorks([workId])

  const restoreTrashWorks = async (workIds: string[]) => {
    if (workIds.length === 0) return
    const idSet = new Set(workIds)
    await Promise.all(
      workIds.map((workId) =>
        fetch(`/api/trash/${workId}/restore`, {
          method: 'POST',
        }),
      ),
    )
    setTrashWorks((current) => current.filter((work) => !idSet.has(work.id)))
    setLastTrashedIds([])
    window.location.reload()
  }

  const permanentlyDeleteTrashWorks = async (workIds: string[]) => {
    if (workIds.length === 0) return
    const idSet = new Set(workIds)
    await Promise.all(
      workIds.map((workId) =>
        fetch(`/api/trash/${workId}`, {
          method: 'DELETE',
        }),
      ),
    )
    setTrashWorks((current) => current.filter((work) => !idSet.has(work.id)))
    setNotice(workIds.length > 1 ? `已永久删除 ${workIds.length} 个作品` : '已永久删除')
  }

  const clearTrash = async () => {
    await fetch('/api/trash', { method: 'DELETE' })
    setTrashWorks([])
    setNotice('回收站已清空')
  }

  const undoTrash = () => {
    if (lastTrashedIds.length === 0) return
    void restoreTrashWorks(lastTrashedIds)
  }

  const openTrashPreview = async (workId: string) => {
    try {
      const response = await fetch(`/api/trash/${workId}`)
      if (!response.ok) throw new Error('load failed')
      const detail = (await response.json()) as {
        pages?: Array<{
          id: string
          page_no: number
          title?: string
          tags?: string[]
          tagIds?: string[]
          rating?: number
          thumbnailUrl?: string
          previewUrl?: string
          originalUrl?: string
        }>
      }
      const pages: GalleryPage[] = (detail.pages ?? []).map((page) => ({
        id: page.id,
        pageNumber: page.page_no,
        title: page.title || `第 ${page.page_no} 页`,
        layout: page.page_no === 1 ? '封面' : '页面',
        tags: page.tags ?? [],
        tagIds: page.tagIds ?? [],
        note: '',
        palette: '',
        previewKind: 'image',
        imageUrl: page.thumbnailUrl,
        previewUrl: page.previewUrl,
        originalUrl: page.originalUrl,
        saved: false,
        rating: page.rating ?? 0,
      }))
      if (pages.length === 0) {
        setNotice('回收站作品没有可预览页面')
        return
      }
      setViewerTrashWorkId(workId)
      setViewerPages(pages)
      setViewerPageIndex(0)
      setViewerPage(pages[0])
      setViewerZoom(100)
    } catch {
      setNotice('预览失败')
    }
  }

  const reloadTagTree = async () => {
    try {
      const response = await fetch('/api/tags/tree')
      if (!response.ok) throw new Error('load failed')
      const data = (await response.json()) as { tags?: TagNode[] }
      setTagTree(data.tags ?? [])
    } catch {
      setNotice('标签加载失败')
    }
  }

  const persistCollectionsChange = async (next: Collection[], prevOverride?: Collection[]) => {
    const prev = prevOverride ?? collectionsRef.current
    const prevById = new Map(prev.map((item) => [item.id, item]))
    const nextById = new Map(next.map((item) => [item.id, item]))

    for (const item of prev) {
      if (nextById.has(item.id)) continue
      await fetch(`/api/folders/${item.id}`, { method: 'DELETE' })
    }

    for (const item of next) {
      const old = prevById.get(item.id)
      const payload = {
        id: item.id,
        name: item.name,
        parentId: item.parentId ?? null,
        description: item.description ?? '',
        sortOrder: item.order ?? 0,
      }
      if (!old) {
        await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else if (
        old.name !== item.name ||
        (old.parentId ?? null) !== (item.parentId ?? null) ||
        (old.description ?? '') !== (item.description ?? '') ||
        (old.order ?? 0) !== (item.order ?? 0)
      ) {
        await fetch(`/api/folders/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      const oldPageIds = new Set(old?.pageIds ?? [])
      const nextPageIds = new Set(item.pageIds)
      const added = item.pageIds.filter((pageId) => !oldPageIds.has(pageId))
      const removed = Array.from(oldPageIds).filter((pageId) => !nextPageIds.has(pageId))
      if (added.length > 0) {
        await fetch('/api/pages/folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageIds: added, folderId: item.id }),
        })
      }
      if (removed.length > 0) {
        await fetch('/api/pages/folder', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageIds: removed, folderId: item.id }),
        })
      }
    }
  }

  const handleCollectionsChange = (next: Collection[], prevOverride?: Collection[], recordUndo = true) => {
    const previous = cloneCollections(prevOverride ?? collectionsRef.current)
    if (collectionsEqual(previous, next)) return
    if (recordUndo) {
      collectionsUndoRef.current.push(previous)
      collectionsRedoRef.current = []
      if (collectionsUndoRef.current.length > 40) collectionsUndoRef.current.shift()
    }
    setCollections(next)
    void persistCollectionsChange(next, prevOverride).catch(() => setNotice('文件夹保存失败'))
  }

  const fetchCurrentCollectionsForUndo = async (): Promise<Collection[]> => {
    try {
      const response = await fetch('/api/folders')
      if (!response.ok) throw new Error('load failed')
      const data = (await response.json()) as { folders?: Array<{
        id: string
        name: string
        description?: string
        parent_id?: string | null
        sort_order?: number
      }> }
      const localById = new Map(collectionsRef.current.map((item) => [item.id, item]))
      return (data.folders ?? []).map((folder) => ({
        id: folder.id,
        name: folder.name,
        description: folder.description ?? '',
        pageIds: localById.get(folder.id)?.pageIds ?? [],
        owner: '当前用户',
        parentId: folder.parent_id ?? undefined,
        order: folder.sort_order ?? 0,
      }))
    } catch {
      return collectionsRef.current
    }
  }

  const applyFolderStructureDiff = async (target: Collection[]) => {
    const current = await fetchCurrentCollectionsForUndo()
    const targetById = new Map(target.map((item) => [item.id, item]))
    const currentById = new Map(current.map((item) => [item.id, item]))
    for (const item of current) {
      if (targetById.has(item.id)) continue
      await fetch(`/api/folders/${item.id}`, { method: 'DELETE' })
    }
    for (const item of target) {
      if (currentById.has(item.id)) continue
      await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          name: item.name,
          parentId: item.parentId ?? null,
          description: item.description ?? '',
          sortOrder: item.order ?? 0,
        }),
      })
    }
    return fetchCurrentCollectionsForUndo()
  }

  const undoCollections = async () => {
    const previous = collectionsUndoRef.current.pop()
    if (!previous) {
      setNotice('没有可撤销的文件夹操作')
      return
    }
    const beforeUndo = await fetchCurrentCollectionsForUndo()
    const current = await applyFolderStructureDiff(previous)
    collectionsRedoRef.current.push(cloneCollections(beforeUndo))
    handleCollectionsChange(previous, current, false)
    setNotice('已撤销文件夹操作')
  }

  const redoCollections = async () => {
    const next = collectionsRedoRef.current.pop()
    if (!next) {
      setNotice('没有可重做的文件夹操作')
      return
    }
    const beforeRedo = await fetchCurrentCollectionsForUndo()
    const current = await applyFolderStructureDiff(next)
    collectionsUndoRef.current.push(cloneCollections(beforeRedo))
    handleCollectionsChange(next, current, false)
    setNotice('已重做文件夹操作')
  }

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      if (event.shiftKey) void redoCollections()
      else void undoCollections()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const handleDeletePageTagIds = (tagIds: string[]) => {
    if (tagIds.length === 0) return
    const idSet = new Set(tagIds)
    const tagById = new Map<string, TagNode>()
    const walkTags = (nodes: TagNode[]) => {
      nodes.forEach((node) => {
        tagById.set(node.id, node)
        walkTags(node.children)
      })
    }
    walkTags(tagTree)
    setWorks((current) =>
      current.map((work) => ({
        ...work,
        pages: work.pages.map((page) => {
          const removedNames = new Set(
            (page.tagIds ?? [])
              .filter((id) => idSet.has(id))
              .map((id) => tagById.get(id)?.name)
              .filter((name): name is string => Boolean(name)),
          )
          return {
            ...page,
            tags: (page.tags ?? []).filter((tag) => !removedNames.has(tag)),
            tagIds: (page.tagIds ?? []).filter((id) => !idSet.has(id)),
          }
        }),
      })),
    )
  }

  const deletePage = (workId: string, pageId: string) => {
    setWorks((current) =>
      current.map((work) =>
        work.id === workId ? { ...work, pages: work.pages.filter((page) => page.id !== pageId) } : work,
      ),
    )
    setCollections((current) =>
      current.map((collection) => ({
        ...collection,
        pageIds: collection.pageIds.filter((id) => id !== pageId),
      })),
    )
    setNotice('页面已删除')
  }

  const tagPages = (pageIds: string[], tag: string) => {
    const cleanTag = tag.trim()
    if (pageIds.length === 0 || !cleanTag) return

    setWorks((current) =>
      current.map((work) => ({
        ...work,
        pages: work.pages.map((page) =>
          pageIds.includes(page.id) && !page.tags.includes(cleanTag) ? { ...page, tags: [cleanTag, ...page.tags] } : page,
        ),
      })),
    )
    pageIds.forEach((pageId) => {
      void fetch(`/api/pages/${pageId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: cleanTag }),
      }).then(async (response) => {
        if (!response.ok) return
        const data = await response.json().catch(() => null) as { tags?: string[]; tagIds?: string[]; missingTag?: boolean } | null
        if (!data) return
        if (data.missingTag) {
          setWorks((current) =>
            current.map((work) => ({
              ...work,
              pages: work.pages.map((page) =>
                page.id === pageId ? { ...page, tags: page.tags.filter((item) => item !== cleanTag) } : page,
              ),
            })),
          )
          setNotice(`标签“${cleanTag}”不在标签系统中，未同步`)
          return
        }
        setWorks((current) =>
          current.map((work) => ({
            ...work,
            pages: work.pages.map((page) =>
              page.id === pageId ? { ...page, tags: data.tags ?? page.tags, tagIds: data.tagIds ?? page.tagIds } : page,
            ),
          })),
        )
      })
    })
    setNotice(`已给 ${pageIds.length} 页添加标签：${cleanTag}`)
  }

  const untagPages = (pageIds: string[], tag: string) => {
    if (pageIds.length === 0 || !tag) return
    setWorks((current) =>
      current.map((work) => ({
        ...work,
        pages: work.pages.map((page) =>
          pageIds.includes(page.id) ? { ...page, tags: page.tags.filter((item) => item !== tag) } : page,
        ),
      })),
    )
    pageIds.forEach((pageId) => {
      void fetch(`/api/pages/${pageId}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' }).then(async (response) => {
        if (!response.ok) return
        const data = await response.json().catch(() => null) as { tags?: string[]; tagIds?: string[] } | null
        if (!data) return
        setWorks((current) =>
          current.map((work) => ({
            ...work,
            pages: work.pages.map((page) =>
              page.id === pageId ? { ...page, tags: data.tags ?? page.tags, tagIds: data.tagIds ?? page.tagIds } : page,
            ),
          })),
        )
      })
    })
    setNotice(`已从 ${pageIds.length} 页移除标签：${tag}`)
  }

  const ratePage = (pageId: string, rating: number) => {
    setWorks((current) =>
      current.map((work) => ({
        ...work,
        pages: work.pages.map((page) =>
          page.id === pageId ? { ...page, rating: rating || undefined } : page,
        ),
      })),
    )
    void fetch(`/api/pages/${pageId}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    })
    setNotice(rating ? `已评分 ${rating} 星` : '已清除评分')
  }

  const rateWork = (workId: string, rating: number) => {
    setWorks((current) =>
      current.map((work) =>
        work.id === workId ? { ...work, rating: rating || undefined } : work,
      ),
    )
    void fetch(`/api/works/${workId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    })
    setNotice(rating ? `已评分 ${rating} 星` : '已清除评分')
  }

  const toggleFavorite = (workId: string) => {
    const work = works.find((item) => item.id === workId)
    if (!work) return
    const nextFavorite = !work.favorite
    setWorks((current) =>
      current.map((item) =>
        item.id === workId ? { ...item, favorite: nextFavorite } : item,
      ),
    )
    void fetch(`/api/works/${workId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: nextFavorite }),
    })
    setNotice(nextFavorite ? '已加入收藏' : '已取消收藏')
  }

  const tagWork = (workId: string, tag: string) => {
    const cleanTag = tag.trim()
    if (!workId || !cleanTag) return
    setWorks((current) =>
      current.map((work) =>
        work.id === workId && !work.tags.includes(cleanTag)
          ? { ...work, tags: [cleanTag, ...work.tags] }
          : work,
      ),
    )
    void fetch(`/api/works/${workId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: cleanTag }),
    }).then(async (response) => {
      if (!response.ok) return
      const data = await response.json().catch(() => null) as { tags?: string[]; tagIds?: string[]; missingTag?: boolean } | null
      if (!data) return
      if (data.missingTag) {
        setWorks((current) =>
          current.map((work) =>
            work.id === workId ? { ...work, tags: work.tags.filter((item) => item !== cleanTag) } : work,
          ),
        )
        setNotice(`标签“${cleanTag}”不在标签系统中，未同步`)
        return
      }
      setWorks((current) =>
        current.map((work) =>
          work.id === workId ? { ...work, tags: data.tags ?? work.tags, tagIds: data.tagIds ?? work.tagIds } : work,
        ),
      )
    })
    setNotice(`作品标签已添加：${cleanTag}`)
  }

  const untagWork = (workId: string, tag: string) => {
    setWorks((current) =>
      current.map((work) =>
        work.id === workId ? { ...work, tags: work.tags.filter((item) => item !== tag) } : work,
      ),
    )
    void fetch(`/api/works/${workId}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    }).then(async (response) => {
      if (!response.ok) return
      const data = await response.json().catch(() => null) as { tags?: string[]; tagIds?: string[] } | null
      if (!data) return
      setWorks((current) =>
        current.map((work) =>
          work.id === workId ? { ...work, tags: data.tags ?? work.tags, tagIds: data.tagIds ?? work.tagIds } : work,
        ),
      )
    })
    setNotice(`作品标签已移除：${tag}`)
  }

  const exportPage = async (page: GalleryPage) => {
    try {
      const blob = await blobToPng(await getPageBlob(page))
      downloadBlob(blob, `${safeFileName(page.title)}-${String(page.pageNumber).padStart(2, '0')}.png`)
      setNotice('页面已导出')
    } catch {
      setNotice('导出失败')
    }
  }

  const copyPage = async (page: GalleryPage) => {
    try {
      const blob = await blobToPng(await getPageBlob(page))

      if (navigator.clipboard && 'write' in navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setNotice('页面已复制')
        return
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(page.imageUrl ?? URL.createObjectURL(blob))
        setNotice('已复制页面链接')
        return
      }

      setNotice('当前浏览器不支持复制')
    } catch {
      setNotice('复制失败，请检查浏览器剪贴板权限')
    }
  }

  const nextUploadOverallPercent = uploadJobs.length > 0
    ? Math.round(uploadJobs.reduce((sum, job) => sum + job.percent, 0) / uploadJobs.length)
    : uploadProgress ? Math.round(uploadProgress.percent * 100) : 0
  uploadOverallPercentRef.current = Math.max(uploadOverallPercentRef.current, nextUploadOverallPercent)
  const uploadOverallPercent = uploadOverallPercentRef.current

  const renderView = () => {
    if (activeView === 'tags') {
      return (
        <TagManagementPanel
          tags={tagTree}
          onChanged={() => void reloadTagTree()}
          onViewResources={(scope, tagId, tagName) => {
            setTagResourceRequest({ scope, tagId, tagName })
            setActiveView(scope === 'work' ? 'library' : 'collections')
          }}
        />
      )
    }

    if (activeView === 'home') {
      return (
        <HomePage
          works={works}
          collections={collections}
          tagTree={tagTree}
          onImport={() => fileInputRef.current?.click()}
          onOpenWork={(workId) => {
            setCollectionsFolderRequest(`work:${workId}`)
            setActiveView('collections')
          }}
          onOpenLibrary={() => setActiveView('library')}
        />
      )
    }

    if (activeView === 'trash') {
      return (
        <TrashView
          trashWorks={trashWorks}
          onRestore={(ids) => void restoreTrashWorks(ids)}
          onDelete={(ids) => void permanentlyDeleteTrashWorks(ids)}
          onClear={() => void clearTrash()}
          onPreview={(workId) => void openTrashPreview(workId)}
          onBack={() => setActiveView('library')}
        />
      )
    }

    if (activeView === 'settings') {
      return <SettingsPage />
    }

    if (activeView === 'work') {
      return (
        <WorkPreview
          work={selectedWork}
          zoom={workZoom}
          setZoom={setWorkZoom}
          goBack={() => setActiveView('library')}
          deleteWork={deleteWork}
          deletePage={deletePage}
          tagPages={tagPages}
          tagWork={tagWork}
          untagWork={untagWork}
          copyPage={copyPage}
          exportPage={exportPage}
        />
      )
    }

    if (activeView === 'collections') {
      return (
        <CollectionsView
          collections={collections}
          pages={allPages}
          works={works}
          tagTree={tagTree}
          initialTagRequest={tagResourceRequest?.scope === 'page' ? { ...tagResourceRequest, scope: 'page' as const } : null}
          onReloadTags={() => void reloadTagTree()}
          onDeletePageTagIds={handleDeletePageTagIds}
          initialFolderId={collectionsFolderRequest}
          viewerOpen={Boolean(viewerPage)}
          copyPage={copyPage}
          exportPage={exportPage}
          deletePage={deletePage}
          tagPages={tagPages}
          untagPages={untagPages}
          ratePage={ratePage}
          openViewer={(page, pages) => {
            const list = pages?.length ? pages : allPages
            const index = Math.max(0, list.findIndex((item) => item.id === page.id))
            setViewerPages(list)
            setViewerPageIndex(index)
            setViewerPage(page)
            setViewerZoom(100)
            setViewerTrashWorkId('')
          }}
          onCollectionsChange={handleCollectionsChange}
          onImportToFolder={importFilesToFolder}
          onBack={() => {
            setCollectionsFolderRequest('')
            setActiveView('library')
          }}
        />
      )
    }

    return (
        <LibraryView
        works={works}
        collections={collections}
        tagTree={tagTree}
        initialTagRequest={tagResourceRequest?.scope === 'work' ? { ...tagResourceRequest, scope: 'work' as const } : null}
        initialSelectedWorkIds={libraryReturnState?.selectedWorkIds}
        initialScrollTop={libraryReturnState?.scrollTop}
        onInitialStateConsumed={() => setLibraryReturnState(null)}
        onImport={() => fileInputRef.current?.click()}
        onCollectionsChange={handleCollectionsChange}
        openWork={(workId, snapshot) => {
          setLibraryReturnState(snapshot ?? { selectedWorkIds: [workId], scrollTop: 0 })
          setCollectionsFolderRequest(`work:${workId}`)
          setActiveView('collections')
        }}
        deleteWork={deleteWork}
        deleteWorks={deleteWorks}
        tagWork={tagWork}
        untagWork={untagWork}
        rateWork={rateWork}
        toggleFavorite={toggleFavorite}
        copyPage={copyPage}
        exportPage={exportPage}
      />
    )
  }

  return (
    <div
      className={[
        activeView === 'collections' ? 'app-shell collections-active' : 'app-shell',
        sidebarCollapsed ? 'sidebar-collapsed' : '',
      ].filter(Boolean).join(' ')}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragImportActive(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragImportActive(false)
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        setDragImportActive(false)
        const files = Array.from(event.dataTransfer.files ?? [])
        if (files.length > 0) void importFiles(files, pendingImportFolderRef.current ?? undefined)
      }}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img alt="Normix" src="/normix-mark.png" />
          </div>
          <div className="brand-copy">
            <img alt="Normix" className="brand-wordmark" src="/normix-wordmark.png" />
            <span>PPT 灵感集管理平台</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={activeView === item.key ? 'nav-item active' : 'nav-item'}
                key={item.key}
                onClick={() => {
                  if (item.key === 'tags') {
                    setActiveView('tags')
                    return
                  }
                  setTagResourceRequest(null)
                  if (item.key === 'collections') setCollectionsFolderRequest('')
                  setActiveView(item.key)
                }}
                title={item.label}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <button className="nav-item sidebar-upload primary-import" onClick={() => fileInputRef.current?.click()} title="导入作品" type="button">
          <UploadCloud size={18} />
          <span>导入作品</span>
        </button>
        <button
          className="sidebar-collapse-toggle"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          title={sidebarCollapsed ? '展开侧边栏' : '收缩侧边栏'}
          type="button"
        >
          {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!sidebarCollapsed && <span>收缩</span>}
        </button>
      </aside>

      <main className="workspace">
        <input
          ref={fileInputRef}
          className="global-upload-input"
          multiple
          onChange={handleFileInput}
          type="file"
          accept=".ppt,.pptx,.pdf,.zip,.rar,.7z,.png,.jpg,.jpeg,.webp,.gif"
        />

        {renderView()}
      </main>

      {dragImportActive && (
        <div className="import-drop-overlay">
          <div className="import-drop-box">
            <UploadCloud size={28} />
            <strong>松开导入作品</strong>
            <span>支持 PPT / PPTX / PDF / ZIP / PNG / JPG / WEBP / GIF</span>
          </div>
        </div>
      )}

      {uploadProgress && (
        <div className="upload-modal-backdrop">
          <div className="upload-modal">
            <div className="upload-modal-header">
              <div className="upload-modal-heading">
                <span className="upload-modal-kicker">{uploadProgress.phase === 'upload' ? '导入作品库' : '页面生成'}</span>
                <strong>{uploadProgress.phase === 'upload' ? '正在导入作品库' : '正在解析'}</strong>
              </div>
              <span className="upload-modal-percent">{uploadOverallPercent}%</span>
            </div>
            <div className="upload-modal-summary">
              <span>
                {uploadProgress.phase === 'upload'
                  ? `导入中 ${uploadProgress.current}/${uploadProgress.total} 个文件`
                  : uploadProgress.stage === '完成'
                    ? `处理完成 ${uploadProgress.current}/${uploadProgress.total} 个文件`
                    : uploadProgress.stage === '部分文件失败'
                      ? `处理完成，${uploadProgress.current}/${uploadProgress.total} 个文件`
                      : `正在解析 ${uploadProgress.current}/${uploadProgress.total} 个文件`}
              </span>
              <div className="upload-modal-summary-right">
                {uploadProgress.phase === 'upload' && uploadProgress.speed !== undefined && (
                  <span>{uploadProgress.speed > 0 ? `${formatBytes(uploadProgress.speed)}/s` : '计算速度中'}</span>
                )}
                {uploadProgress.eta && (
                  <span className="upload-eta">全部文件预计还需 {uploadProgress.eta}</span>
                )}
              </div>
            </div>
            {uploadJobs.length > 0 && (
              <div className="upload-job-list">
                {uploadJobs.map((job) => (
                  <div className="upload-job-row" key={job.id}>
                    <span className="upload-job-name" title={job.fileName}>{job.fileName}</span>
                    <div className="upload-job-track">
                      <div style={{ width: `${job.percent}%` }} />
                    </div>
                    <div className="upload-job-meta">
                      <strong>{job.status === 'done' || job.status === 'duplicate' ? '100%' : `${Math.round(job.percent)}%`}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {uploadProgress.phase === 'upload' && (
              <div className="upload-progress-detail">
                <span>已导入</span>
                <span>
                  {uploadProgress.bytesLoaded !== undefined && uploadProgress.bytesLoaded > 0 ? formatBytes(uploadProgress.bytesLoaded) : '0 B'} / {uploadProgress.bytesTotal !== undefined && uploadProgress.bytesTotal > 0 ? formatBytes(uploadProgress.bytesTotal) : '0 B'}
                </span>
              </div>
            )}
            {uploadProgress.phase === 'parse' && uploadProgress.stage && (
              <span className="upload-stage">
                {uploadProgress.stage}
              </span>
            )}
            <button className="upload-cancel-button" onClick={() => void cancelUpload()} type="button">
              取消导入
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="notice-toast" role="status" aria-live="polite">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
          {notice.includes('回收站') && lastTrashedIds.length > 0 && (
            <button className="notice-action" onClick={undoTrash} type="button">
              撤销
            </button>
          )}
        </div>
      )}

      {viewerPage && (
        <PageViewer
          page={viewerPage}
          pages={viewerPages}
          pageIndex={viewerPageIndex}
          onNavigate={(nextIndex) => {
            const nextPage = viewerPages[nextIndex]
            if (!nextPage) return
            setViewerPageIndex(nextIndex)
            setViewerPage(nextPage)
          }}
          zoom={viewerZoom}
          setZoom={setViewerZoom}
          close={() => {
            setViewerPage(null)
            setViewerTrashWorkId('')
          }}
          copyPage={() => void copyPage(viewerPage)}
          exportPage={() => void exportPage(viewerPage)}
          extraActions={viewerTrashWorkId ? (
            <>
              <button
                className="ghost-button"
                onClick={() => void restoreTrashWorks([viewerTrashWorkId])}
                type="button"
              >
                恢复
              </button>
              <button
                className="ghost-button danger"
                onClick={() => {
                  if (!window.confirm('确定永久删除这个作品？此操作不可恢复。')) return
                  void permanentlyDeleteTrashWorks([viewerTrashWorkId])
                  setViewerPage(null)
                  setViewerTrashWorkId('')
                }}
                type="button"
              >
                永久删除
              </button>
            </>
          ) : undefined}
        />
      )}
    </div>
  )
}

const hexToRgb = (hex: string) => {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value
  const number = Number.parseInt(full, 16)
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 }
}

const rgbToHsl = (r: number, g: number, b: number) => {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  let hue = 0
  let saturation = 0
  const lightness = (max + min) / 2

  if (max !== min) {
    const delta = max - min
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6
    else if (max === green) hue = ((blue - red) / delta + 2) / 6
    else hue = ((red - green) / delta + 4) / 6
  }

  return { h: hue * 360, s: saturation * 100, l: lightness * 100 }
}

const hexToHsl = (hex: string) => {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHsl(r, g, b)
}

const hslToRgb = (h: number, s: number, l: number) => {
  const hue = ((h % 360) + 360) % 360 / 360
  const saturation = s / 100
  const lightness = l / 100

  if (saturation === 0) {
    const value = Math.round(lightness * 255)
    return { r: value, g: value, b: value }
  }

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  const channel = (value: number) => {
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
  }

  return {
    r: Math.round(channel(hue + 1 / 3) * 255),
    g: Math.round(channel(hue) * 255),
    b: Math.round(channel(hue - 1 / 3) * 255),
  }
}

const hslToHex = (h: number, s: number, l: number) => {
  const { r, g, b } = hslToRgb(h, s, l)
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

const colorDistance = (a: string, b: string) => {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2)
}

const profileMatchesColor = (profile: ImageColorProfile | undefined, hex: string, tolerance: number, threshold: number) => {
  if (!profile) return false
  const matchedRatio = profile.colors.reduce((sum, entry) => {
    return colorDistance(entry.hex, hex) <= tolerance ? sum + entry.ratio : sum
  }, 0)
  return matchedRatio >= threshold
}

const profileMatchesFamily = (profile: ImageColorProfile | undefined, family: string, threshold: number) => {
  if (!profile) return false
  if (family === '多彩') return profileMatchesMultiColor(profile, threshold)
  if (family === '中性') return (profile.neutralRatio ?? 0) >= Math.max(0.55, threshold * 3)
  if (family === '黑金') {
    return (profile.colorFamilyRatios['黑色'] ?? 0) >= 0.12 && (profile.colorFamilyRatios['黄色'] ?? 0) >= 0.08
  }
  return (profile.colorFamilyRatios[family] ?? 0) >= threshold
}

const profileMatchesMultiColor = (profile: ImageColorProfile | undefined, threshold: number) => {
  if (!profile) return false
  if (profile.categories.includes('多彩')) return true
  const minimum = Math.min(Math.max(threshold, 0.08), 0.5)
  const chromaticFamilies = Object.entries(profile.colorFamilyRatios)
    .filter(([family, ratio]) => !['黑色', '白色', '灰色', '中性'].includes(family) && ratio >= minimum)
  return chromaticFamilies.length >= 3
}

const normalizeHex = (value: string) => {
  const compact = value.trim().replace(/^#/, '')
  const match = compact.match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const full = match[1].length === 3 ? match[1].split('').map((char) => char + char).join('') : match[1]
  return `#${full.toLowerCase()}`
}

const aggregateColorPalette = (profiles: Record<string, ImageColorProfile>, selectedHex: string | null) => {
  const appearances = new Map<string, number>()
  const scores = new Map<string, number>()

  Object.values(profiles).forEach((profile) => {
    profile.colors.forEach((entry) => {
      appearances.set(entry.hex, (appearances.get(entry.hex) ?? 0) + 1)
      scores.set(entry.hex, (scores.get(entry.hex) ?? 0) + entry.ratio)
    })
  })

  const sortedScores = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1] || (appearances.get(b[0]) ?? 0) - (appearances.get(a[0]) ?? 0))

  if (selectedHex) {
    const hue = hexToHsl(selectedHex)
    const shades = new Set<string>([selectedHex])
    ;[6, 12, 22, 34, 46, 58, 72, 86, 94].forEach((lightness) => {
      shades.add(hslToHex(hue.h, hue.s, lightness))
    })
    ;[100, 80, 60, 40, 20].forEach((saturation) => {
      shades.add(hslToHex(hue.h, saturation, hue.l))
    })
    ;[-24, 24].forEach((offset) => {
      shades.add(hslToHex(hue.h + offset, Math.max(hue.s, 70), Math.min(80, Math.max(20, hue.l))))
    })
    const matching = sortedScores
      .filter(([hex]) => colorDistance(hex, selectedHex) <= 90)
      .map(([hex]) => hex)
    return Array.from(new Set([selectedHex, ...matching, ...Array.from(shades)])).slice(0, 20)
  }

  const palette: string[] = []
  sortedScores.forEach(([hex]) => {
    if (palette.every((picked) => colorDistance(picked, hex) >= 48)) palette.push(hex)
  })
  return palette.slice(0, 20)
}

function ColorPaletteFilter({
  profiles,
  selectedHex,
  selectedColorFamily,
  colorMode,
  tolerance,
  minRatio,
  onSelectHex,
  onSelectColorFamily,
  onColorModeChange,
  onToleranceChange,
  onMinRatioChange,
  onClear,
}: {
  profiles: Record<string, ImageColorProfile>
  selectedHex: string | null
  selectedColorFamily: string | null
  colorMode: 'all' | 'neutral' | 'multi'
  tolerance: number
  minRatio: number
  onSelectHex: (hex: string | null) => void
  onSelectColorFamily: (family: string | null) => void
  onColorModeChange: (mode: 'all' | 'neutral' | 'multi') => void
  onToleranceChange: (value: number) => void
  onMinRatioChange: (value: number) => void
  onClear: () => void
}) {
  const [hexInput, setHexInput] = useState(selectedHex ? selectedHex.replace('#', '') : '')
  const palette = useMemo(() => aggregateColorPalette(profiles, selectedHex), [profiles, selectedHex])
  const pickerFieldRef = useRef<HTMLDivElement>(null)
  const pickerHueRef = useRef<HTMLDivElement>(null)
  const selectedHsl = useMemo(
    () => (selectedHex ? hexToHsl(selectedHex) : { h: 0, s: 100, l: 50 }),
    [selectedHex],
  )

  useEffect(() => {
    setHexInput(selectedHex ? selectedHex.replace('#', '') : '')
  }, [selectedHex])

  const pickFieldColor = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = pickerFieldRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const saturation = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const lightness = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height))
    const hex = hslToHex(selectedHsl.h, saturation * 100, lightness * 100)
    onSelectHex(hex)
    onSelectColorFamily(null)
    onColorModeChange('all')
  }

  const pickHueColor = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = pickerHueRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const hue = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) * 360
    const hex = hslToHex(hue, selectedHsl.s, selectedHsl.l)
    onSelectHex(hex)
    onSelectColorFamily(null)
    onColorModeChange('all')
  }

  const applyHex = (value: string) => {
    const hex = normalizeHex(value)
    if (hex) {
      onSelectHex(hex)
      onSelectColorFamily(null)
      onColorModeChange('all')
    }
  }

  const activeSwatch = selectedHex?.toLowerCase()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <div className="color-palette-filter compact">
      <div className="color-family-grid">
        {colorFamilyPresets.map((preset) => (
          <button
            className={selectedColorFamily === preset.key ? 'color-family active' : 'color-family'}
            key={preset.key}
            onClick={() => {
              onSelectColorFamily(selectedColorFamily === preset.key ? null : preset.key)
              onSelectHex(null)
              onColorModeChange('all')
            }}
            style={{ '--family-swatch': preset.swatch } as CSSProperties & Record<'--family-swatch', string>}
            title={preset.label}
            aria-label={preset.label}
            type="button"
          >
            <i />
          </button>
        ))}
      </div>
      <div className="color-palette-head">
        <div className="color-palette-title">
          <span>颜色</span>
          <small>
            {selectedColorFamily
              ? `${selectedColorFamily}系`
              : selectedHex
                ? selectedHex.toUpperCase()
                : colorMode === 'neutral'
                  ? '中性色'
                  : colorMode === 'multi'
                    ? '多彩'
                    : '全部色系'}
          </small>
        </div>
        <button className="color-clear-button" onClick={onClear} type="button">
          <X size={13} />
          清除
        </button>
      </div>

      <button
        className="color-advanced-toggle"
        onClick={() => setAdvancedOpen((open) => !open)}
        type="button"
      >
        <Palette size={13} />
        精确取色
        <ChevronDown
          className={advancedOpen ? 'color-advanced-chevron open' : 'color-advanced-chevron'}
          size={13}
        />
      </button>

      {advancedOpen && (
        <>
          <div className="color-swatches">
            {palette.map((hex) => (
              <button
                className={activeSwatch === hex.toLowerCase() ? 'color-swatch active' : 'color-swatch'}
                key={hex}
                onClick={() => {
                  const next = activeSwatch === hex.toLowerCase() ? null : hex
                  onSelectHex(next)
                  onSelectColorFamily(null)
                  if (next) onColorModeChange('all')
                }}
                style={{ '--swatch': hex } as CSSProperties & Record<'--swatch', string>}
                title={hex.toUpperCase()}
                type="button"
              />
            ))}
            {palette.length === 0 && <span className="color-palette-empty">暂无主色</span>}
          </div>

          <div className="color-picker-area">
            <div
              className="color-picker-field"
              ref={pickerFieldRef}
              onPointerDown={(event) => {
                event.preventDefault()
                pickerFieldRef.current?.setPointerCapture(event.pointerId)
                pickFieldColor(event)
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) pickFieldColor(event)
              }}
              style={{ '--picker-hue': `${selectedHsl.h}deg` } as CSSProperties & Record<'--picker-hue', string>}
            >
              <span
                className="color-picker-marker"
                style={{ left: `${selectedHsl.s}%`, top: `${100 - selectedHsl.l}%` }}
              />
            </div>
            <div
              className="color-picker-hue"
              ref={pickerHueRef}
              onPointerDown={(event) => {
                event.preventDefault()
                pickerHueRef.current?.setPointerCapture(event.pointerId)
                pickHueColor(event)
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) pickHueColor(event)
              }}
            >
              <span
                className="color-picker-hue-marker"
                style={{ top: `${selectedHsl.h / 360 * 100}%` }}
              />
            </div>
          </div>

          <div className="color-palette-controls">
            <label className="color-hex-input">
              <span>#</span>
              <input
                value={hexInput}
                onChange={(event) => {
                  const value = event.target.value
                  setHexInput(value)
                  const hex = normalizeHex(value)
                  if (hex) {
                    onSelectHex(hex)
                    onSelectColorFamily(null)
                    onColorModeChange('all')
                  }
                }}
                onBlur={() => setHexInput(selectedHex ? selectedHex.replace('#', '') : '')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyHex(hexInput)
                }}
                placeholder="FFFFFF"
                spellCheck={false}
              />
              <input
                aria-label="打开系统取色器"
                className="native-color-input"
                type="color"
                value={normalizeHex(selectedHex ?? '#888888') ?? '#888888'}
                onChange={(event) => {
                  const hex = event.target.value.toUpperCase()
                  onSelectHex(hex)
                  onSelectColorFamily(null)
                  onColorModeChange('all')
                  setHexInput(hex.replace('#', ''))
                }}
              />
            </label>

            <label className="color-range">
              <span>准确度 <b>{tolerance <= 50 ? '高' : tolerance <= 120 ? '中' : '低'}</b></span>
              <input
                min="0"
                max="200"
                step="5"
                type="range"
                value={tolerance}
                onChange={(event) => onToleranceChange(Number(event.target.value))}
              />
            </label>

            <label className="color-range">
              <span>颜色占比 <b>≥ {Math.round(minRatio * 100)}%</b></span>
              <input
                min="5"
                max="80"
                step="5"
                type="range"
                value={Math.round(minRatio * 100)}
                onChange={(event) => onMinRatioChange(Number(event.target.value) / 100)}
              />
            </label>
          </div>
        </>
      )}
    </div>
  )
}

function FilterSelect({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: typeof Palette
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="toolbar-select-anchor">
      <button
        className={value ? 'filter-button active' : 'filter-button'}
        onClick={() => setOpen((next) => !next)}
        type="button"
      >
        <Icon size={14} />
        {label}
      </button>
      {open && (
        <>
          <button
            aria-label={`关闭${label}`}
            className="color-filter-backdrop"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="toolbar-select-popover">
            <button
              className={!value ? 'active' : ''}
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              type="button"
            >
              {label}
            </button>
            {options.map((option) => (
              <button
                className={value === option.value ? 'active' : ''}
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FilterRail({
  search,
  onSearchChange,
  primaryLabel,
  primaryOptions,
  primaryValue,
  onPrimaryChange,
  secondary,
  profiles,
  selectedHex,
  selectedColorFamily,
  colorMode,
  colorTolerance,
  colorMinRatio,
  onSelectHex,
  onSelectColorFamily,
  onColorModeChange,
  onToleranceChange,
  onMinRatioChange,
  hasFilters,
  onClear,
  tagOptions,
  selectedTags,
  onTagToggle,
  tagMode,
  onTagModeChange,
  onColorFilterOpenChange,
  rating,
  onRatingChange,
}: {
  search: string
  onSearchChange: (value: string) => void
  primaryLabel: string
  primaryOptions: string[]
  primaryValue: string
  onPrimaryChange: (value: string) => void
  secondary?: {
    label: string
    options: string[]
    value: string
    onChange: (value: string) => void
  }
  profiles: Record<string, ImageColorProfile>
  selectedHex: string | null
  selectedColorFamily: string | null
  colorMode: 'all' | 'neutral' | 'multi'
  colorTolerance: number
  colorMinRatio: number
  onSelectHex: (hex: string | null) => void
  onSelectColorFamily: (family: string | null) => void
  onColorModeChange: (mode: 'all' | 'neutral' | 'multi') => void
  onToleranceChange: (value: number) => void
  onMinRatioChange: (value: number) => void
  hasFilters: boolean
  onClear: () => void
  tagOptions?: Array<[string, number]>
  selectedTags?: string[]
  onTagToggle?: (tag: string) => void
  tagMode?: 'AND' | 'OR'
  onTagModeChange?: (mode: 'AND' | 'OR') => void
  onColorFilterOpenChange?: (open: boolean) => void
  rating?: number
  onRatingChange?: (value: number) => void
}) {
  const [colorFilterOpen, setColorFilterOpen] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [ratingOpen, setRatingOpen] = useState(false)
  const hasColorFilter = Boolean(selectedHex || selectedColorFamily || colorMode !== 'all')

  return (
    <div className="filter-rail">
      <div className="filter-rail-row">
      <label className="search-box compact">
        <Search size={16} />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索" />
      </label>
      <div className="color-filter-anchor">
        <button
          className={hasColorFilter || colorFilterOpen ? 'color-filter-trigger active' : 'color-filter-trigger'}
          onClick={() => {
            setColorFilterOpen((open) => {
              const next = !open
              if (next) onColorFilterOpenChange?.(true)
              return next
            })
          }}
          type="button"
        >
          <Palette size={14} />
          颜色
          {selectedHex && <b>{selectedHex.toUpperCase()}</b>}
          {!selectedHex && selectedColorFamily && <b>{selectedColorFamily}系</b>}
          {!selectedHex && colorMode === 'neutral' && <b>中性色</b>}
          {!selectedHex && !selectedColorFamily && colorMode === 'multi' && <b>多色</b>}
        </button>
        {colorFilterOpen && (
          <>
            <button
              aria-label="关闭颜色筛选"
              className="color-filter-backdrop"
              onClick={() => setColorFilterOpen(false)}
              type="button"
            />
            <div className="color-filter-popover">
              <ColorPaletteFilter
                profiles={profiles}
                selectedHex={selectedHex}
                selectedColorFamily={selectedColorFamily}
                colorMode={colorMode}
                tolerance={colorTolerance}
                minRatio={colorMinRatio}
                onSelectHex={onSelectHex}
                onSelectColorFamily={onSelectColorFamily}
                onColorModeChange={onColorModeChange}
                onToleranceChange={onToleranceChange}
                onMinRatioChange={onMinRatioChange}
                onClear={() => {
                  onSelectHex(null)
                  onSelectColorFamily(null)
                  onColorModeChange('all')
                }}
              />
            </div>
          </>
        )}
      </div>
      <FilterSelect
        icon={Shapes}
        label={primaryLabel}
        value={primaryValue}
        options={primaryOptions.map((item) => ({ value: item, label: item }))}
        onChange={onPrimaryChange}
      />
      {secondary && (
        <FilterSelect
          icon={CalendarDays}
          label={secondary.label}
          value={secondary.value}
          options={secondary.options.map((item) => ({ value: item, label: item }))}
          onChange={secondary.onChange}
        />
      )}
      {rating !== undefined && onRatingChange && (
        <div className="filter-tag-anchor">
          <button
            className={rating || ratingOpen ? 'filter-button active' : 'filter-button'}
            onClick={() => setRatingOpen((open) => !open)}
            type="button"
          >
            <Star size={14} />
            评分
            {rating > 0 && <b>{rating}</b>}
          </button>
          {ratingOpen && (
            <>
              <button
                aria-label="关闭评分筛选"
                className="color-filter-backdrop"
                onClick={() => setRatingOpen(false)}
                type="button"
              />
              <div className="filter-tags-popover">
                <div className="rating-filter">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      className={rating >= value ? 'active' : ''}
                      key={value}
                      onClick={() => {
                        onRatingChange(rating === value ? 0 : value)
                        setRatingOpen(false)
                      }}
                      type="button"
                      title={`${value} 星`}
                    >
                      <Star size={18} fill={rating >= value ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {tagOptions && onTagToggle && (
        <div className="filter-tag-anchor">
          <button
            className={selectedTags?.length || tagOpen ? 'filter-button active' : 'filter-button'}
            onClick={() => setTagOpen((open) => !open)}
            type="button"
          >
            <Tags size={14} />
            标签
            {selectedTags && selectedTags.length > 0 && <b>{selectedTags.length}</b>}
          </button>
          {tagOpen && (
            <>
              <button
                aria-label="关闭标签筛选"
                className="color-filter-backdrop"
                onClick={() => setTagOpen(false)}
                type="button"
              />
              <div className="filter-tags-popover">
                <div className="filter-tags-head">
                  <button
                    className={tagMode === 'AND' ? 'active' : ''}
                    onClick={() => onTagModeChange?.('AND')}
                    type="button"
                  >
                    AND
                  </button>
                  <button
                    className={tagMode === 'OR' ? 'active' : ''}
                    onClick={() => onTagModeChange?.('OR')}
                    type="button"
                  >
                    OR
                  </button>
                </div>
                <div className="filter-tags-list">
                  {tagOptions.slice(0, 18).map(([tag, count]) => (
                    <button
                      className={selectedTags?.includes(tag) ? 'active' : ''}
                      key={tag}
                      onClick={() => onTagToggle(tag)}
                      style={tagColorStyle(tag)}
                      type="button"
                    >
                      {tag} <b>{count}</b>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {hasFilters && (
        <button className="ghost-button filter-clear" onClick={onClear} type="button">
          <X size={14} />
          清空
        </button>
      )}
      </div>
    </div>
  )
}

const defaultInspectorWidth = () => {
  return 260
}

function InspectorPanel({
  title,
  preview,
  format,
  fileSize,
  createdAt,
  favorite,
  sourceUrl,
  note,
  folders,
  folderTree,
  onAddToFolderById,
  tags,
  rating,
  onRatingChange,
  onToggleFavorite,
  onAddTag,
  onRemoveTag,
  onExport,
  onDelete,
  onOpen,
  width,
  onWidthChange,
}: {
  title: string
  preview?: GalleryPage
  format?: string
  fileSize?: number
  createdAt?: string
  favorite?: boolean
  sourceUrl?: string
  note?: string
  folders?: string[]
  folderTree?: Collection[]
  onAddToFolderById?: (folderId: string) => void
  tags: string[]
  rating?: number
  onRatingChange?: (rating: number) => void
  onToggleFavorite?: () => void
  onAddTag?: (tag: string) => void
  onRemoveTag?: (tag: string) => void
  onCopy?: () => void
  onExport?: () => void
  onDelete?: () => void
  onOpen?: () => void
  width?: number
  onWidthChange?: (width: number) => void
}) {
  const [tagInput, setTagInput] = useState('')
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [localPanelWidth, setLocalPanelWidth] = useState(defaultInspectorWidth)
  const panelWidth = width ?? localPanelWidth
  const changePanelWidth = (next: number) => {
    if (onWidthChange) onWidthChange(next)
    else setLocalPanelWidth(next)
  }
  const previewCanvasRef = useRef<HTMLDivElement>(null)
  const previewDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const [previewZoom, setPreviewZoom] = useState(100)
  const [previewPanX, setPreviewPanX] = useState(0)
  const [previewPanY, setPreviewPanY] = useState(0)

  useEffect(() => {
    document.documentElement.style.setProperty('--inspector-width', `${panelWidth}px`)
    return () => {
      document.documentElement.style.removeProperty('--inspector-width')
    }
  }, [panelWidth])

  useEffect(() => {
    if (width !== undefined) return
    const onResize = () => {
      setLocalPanelWidth((current) => Math.min(420, Math.max(220, current)))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [width])

  useEffect(() => {
    setPreviewZoom(100)
    setPreviewPanX(0)
    setPreviewPanY(0)
  }, [preview?.id])

  useEffect(() => {
    const element = previewCanvasRef.current
    if (!element) return
    const onWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const next = Math.min(600, Math.max(50, previewZoom + (event.deltaY < 0 ? 20 : -20)))
      const rect = element.getBoundingClientRect()
      const cursorX = event.clientX - rect.left
      const cursorY = event.clientY - rect.top
      const scale = previewZoom / 100
      const nextScale = next / 100
      const worldX = (cursorX - previewPanX) / scale
      const worldY = (cursorY - previewPanY) / scale
      setPreviewPanX(cursorX - worldX * nextScale)
      setPreviewPanY(cursorY - worldY * nextScale)
      setPreviewZoom(next)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [previewPanX, previewPanY, previewZoom])
  const commitTag = () => {
    const tag = tagInput.trim()
    if (tag && onAddTag) {
      onAddTag(tag)
      setTagInput('')
    }
  }
  const startResize = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panelWidth
    const onMove = (moveEvent: globalThis.MouseEvent) => {
      changePanelWidth(Math.min(420, Math.max(220, startWidth - (moveEvent.clientX - startX))))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const renderFolderChoice = (folder: Collection, depth = 0): Array<ReactElement> => {
    const children = (folderTree ?? []).filter((collection) => collection.parentId === folder.id)
    return [
      <button
        className="folder-choice-item"
        key={`${folder.id}-choice`}
        onClick={() => {
          onAddToFolderById?.(folder.id)
          setFolderPickerOpen(false)
        }}
        style={{ paddingLeft: 10 + depth * 14 }}
        type="button"
      >
        <FolderKanban size={14} />
        <span>{folder.name}</span>
      </button>,
      ...children.flatMap((child) => renderFolderChoice(child, depth + 1)),
    ]
  }

  return (
    <aside className="inspector-panel" style={{ width: `${panelWidth}px` }}>
      <div
        aria-label="拖动调整检查器宽度"
        className="inspector-resizer"
        onMouseDown={startResize}
        title="拖动调整宽度"
      />
      <div className="inspector-heading">
        <div className="inspector-heading-title">
          <strong>{title}</strong>
          {format && <span>{format}</span>}
        </div>
        <div className="inspector-heading-actions">
          {onToggleFavorite && (
            <button
              className={favorite ? 'icon-button active' : 'icon-button'}
              onClick={onToggleFavorite}
              title={favorite ? '取消收藏' : '收藏'}
              type="button"
            >
              <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
            </button>
          )}
          {onOpen && (
            <button className="icon-button" onClick={onOpen} title="打开预览" type="button">
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      </div>
      <div
        className="inspector-preview"
        ref={previewCanvasRef}
        onMouseDown={(event) => {
          if (event.button !== 0) return
          previewDragRef.current = { startX: event.clientX, startY: event.clientY, panX: previewPanX, panY: previewPanY }
        }}
        onMouseMove={(event) => {
          if (!previewDragRef.current) return
          setPreviewPanX(previewDragRef.current.panX + event.clientX - previewDragRef.current.startX)
          setPreviewPanY(previewDragRef.current.panY + event.clientY - previewDragRef.current.startY)
        }}
        onMouseUp={() => {
          previewDragRef.current = null
        }}
        onMouseLeave={() => {
          previewDragRef.current = null
        }}
      >
        <div
          className="inspector-preview-canvas"
          style={{ transform: `translate3d(${previewPanX}px, ${previewPanY}px, 0) scale(${previewZoom / 100})` }}
        >
          {preview ? <SlidePreview page={preview} preview /> : <div className="empty-cover" />}
        </div>
      </div>

      {(fileSize !== undefined || createdAt || format) && (
        <div className="inspector-section">
          <div className="inspector-section-title">
            <span>基本信息</span>
          </div>
          <div className="inspector-meta">
            {format && (
              <div className="inspector-meta-row">
                <span>类型</span>
                <strong>{format}</strong>
              </div>
            )}
            {fileSize !== undefined && (
              <div className="inspector-meta-row">
                <span>文件大小</span>
                <strong>{formatBytes(fileSize)}</strong>
              </div>
            )}
            {createdAt && (
              <div className="inspector-meta-row">
                <span>创建时间</span>
                <strong>{createdAt}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="inspector-section">
        <div className="inspector-section-title">
          <span>标签</span>
          {onAddTag && (
            <div className="inspector-tag-input">
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitTag()
                }}
                placeholder="添加"
              />
              <button className="icon-button" onClick={commitTag} type="button" title="添加标签">
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="inspector-tags">
          {tags.map((tag) => (
            <span key={tag} style={tagColorStyle(tag)}>
              {tag}
              {onRemoveTag && (
                <button onClick={() => onRemoveTag(tag)} type="button" title="移除标签">
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
          {tags.length === 0 && <em>暂无标签</em>}
        </div>
      </div>

      {(folders || folderTree || onAddToFolderById) && (
        <div className="inspector-section">
          <div className="inspector-section-title">
            <span>文件夹</span>
            {onAddToFolderById && (
              <button className="ghost-button" onClick={() => setFolderPickerOpen((open) => !open)} type="button">
                选择文件夹
              </button>
            )}
          </div>
          <div className="inspector-folder-list">
            {(folders ?? []).length > 0 ? (
              (folders ?? []).map((folder, folderIndex) => (
                <span key={`${folder}-${folderIndex}`}>
                  <FolderKanban size={12} />
                  {folder}
                </span>
              ))
            ) : (
              <em>未加入文件夹</em>
            )}
          </div>
          {folderPickerOpen && onAddToFolderById && folderTree && (
            <div className="folder-picker-popover">
              {folderTree.filter((collection) => !collection.parentId).map((folder) => renderFolderChoice(folder))}
              {folderTree.length === 0 && <em>暂无文件夹</em>}
            </div>
          )}
        </div>
      )}

      {(sourceUrl || (note && note !== '待分类')) && (
        <div className="inspector-section">
          <div className="inspector-section-title">
            <span>来源与注释</span>
          </div>
          {sourceUrl && <a className="inspector-source" href={sourceUrl} target="_blank" rel="noreferrer">{sourceUrl}</a>}
          {note && <p className="inspector-note">{note}</p>}
        </div>
      )}

      {onRatingChange && (
        <div className="inspector-section">
          <div className="inspector-section-title">
            <span>评分</span>
          </div>
          <div className="inspector-rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                className={rating && rating >= value ? 'active' : ''}
                key={value}
                onClick={() => onRatingChange(rating === value ? 0 : value)}
                type="button"
                title={`${value} 星`}
              >
                <Star size={18} fill={rating && rating >= value ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="inspector-actions">
        {onExport && (
          <button className="ghost-button" onClick={onExport} type="button">
            <Download size={14} />
            导出
          </button>
        )}
        {onDelete && (
          <button className="ghost-button danger" onClick={onDelete} type="button">
            <Trash2 size={14} />
            删除
          </button>
        )}
      </div>
    </aside>
  )
}


function TagManagementPanel({
  tags,
  onChanged,
  onViewResources,
}: {
  tags: TagNode[]
  onChanged: () => void
  onViewResources?: (scope: 'work' | 'page', tagId: string, tagName: string) => void
}) {
  const [tab, setTab] = useState<'work' | 'page'>('page')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [localTags, setLocalTags] = useState<TagNode[]>(tags)
  const [renamingId, setRenamingId] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [newName, setNewName] = useState('')
  const [inlineCreate, setInlineCreate] = useState<{ parentId: string; kind: 'group' | 'tag' } | null>(null)
  const [inlineCreateValue, setInlineCreateValue] = useState('')
  const [search, setSearch] = useState('')
  const [moveTarget, setMoveTarget] = useState<TagNode | null>(null)
  const [moveValue, setMoveValue] = useState('')
  const [tagContextMenu, setTagContextMenu] = useState<{ x: number; y: number; node: TagNode | null } | null>(null)
  const [dragTagId, setDragTagId] = useState<string | null>(null)
  const [tagDragPreview, setTagDragPreview] = useState<{ name: string; x: number; y: number } | null>(null)
  const [tagDropTarget, setTagDropTarget] = useState<{ id: string; position: 'before' | 'after' | 'inside' } | null>(null)

  useEffect(() => {
    setLocalTags(tags)
  }, [tags])

  useEffect(() => {
    const closeMenu = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.context-menu')) return
      setTagContextMenu(null)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setTagContextMenu(null)
    }
    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const request = async (path: string, options: RequestInit) => {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    })
    if (!response.ok) throw new Error('tag request failed')
    return response
  }

  const getNodeScope = (node: TagNode): 'work' | 'page' =>
    node.scope ?? (node.group === '页面' ? 'page' : 'work')

  const insertTagIntoTree = (nodes: TagNode[], parentId: string | null, tag: TagNode): TagNode[] =>
    nodes.map((node) => {
      if (parentId === null) return node
      if (node.id === parentId) return { ...node, children: [...node.children, { ...tag, children: tag.children ?? [] }] }
      return { ...node, children: insertTagIntoTree(node.children, parentId, tag) }
    })

  const removeTagFromTree = (nodes: TagNode[], tagId: string): TagNode[] =>
    nodes
      .filter((node) => node.id !== tagId)
      .map((node) => ({ ...node, children: removeTagFromTree(node.children, tagId) }))

  const updateTagInTree = (nodes: TagNode[], tagId: string, patch: Partial<TagNode>): TagNode[] =>
    nodes.map((node) =>
      node.id === tagId
        ? { ...node, ...patch }
        : { ...node, children: updateTagInTree(node.children, tagId, patch) },
    )

  const moveTagInTree = (nodes: TagNode[], tagId: string, parentId: string | null): TagNode[] => {
    let source: TagNode | null = null
    const removeAndFind = (list: TagNode[]): TagNode[] =>
      list.flatMap((node) => {
        if (node.id === tagId) {
          source = node
          return []
        }
        return [{ ...node, children: removeAndFind(node.children) }]
      })
    const withoutSource = removeAndFind(nodes)
    if (!source) return nodes
    const moved = { ...(source as TagNode), parent_id: parentId ?? null }
    return parentId ? insertTagIntoTree(withoutSource, parentId, moved) : [...withoutSource, moved]
  }

  const roots = useMemo(
    () => {
      const usedWork = (node: TagNode): boolean =>
        (node.work_count ?? 0) > 0 || node.children.some(usedWork)
      const usedPage = (node: TagNode): boolean =>
        (node.page_count ?? 0) > 0 || node.children.some(usedPage)
      return localTags.filter((tag) => {
        if (tag.parent_id) return false
        if (getNodeScope(tag) !== tab) return false
        const used = tab === 'work' ? usedWork(tag) : usedPage(tag)
        return used || tag.name === tag.group || tag.children.length > 0
      })
    },
    [tab, localTags],
  )

  const groupOptions = useMemo(() => {
    const result: TagNode[] = []
    const walk = (nodes: TagNode[]) => {
      nodes.forEach((node) => {
        if ((node.children.length > 0 || node.name === node.group) && getNodeScope(node) === tab) result.push(node)
        walk(node.children)
      })
    }
    walk(localTags)
    return result
  }, [tab, localTags])

  const visibleRoots = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return roots
    const hasMatch = (node: TagNode): boolean =>
      node.name.toLowerCase().includes(keyword) || node.children.some(hasMatch)
    return roots.filter(hasMatch)
  }, [roots, search])

  const leafCounts = useMemo(() => {
    let work = 0
    let page = 0
    const walk = (nodes: TagNode[]) => {
      nodes.forEach((node) => {
        if (node.children.length === 0) {
          if (getNodeScope(node) === 'work') work += 1
          else page += 1
        }
        walk(node.children)
      })
    }
    walk(localTags)
    return { work, page }
  }, [localTags])

  const findTagNode = (nodes: TagNode[], id: string): TagNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      const found = findTagNode(node.children, id)
      if (found) return found
    }
    return null
  }

  const isTagGroup = (node: TagNode | null | undefined): boolean =>
    Boolean(node && (node.children.length > 0 || node.name === node.group))

  const getDescendantTagIds = (node: TagNode): string[] => [
    node.id,
    ...node.children.flatMap((child) => getDescendantTagIds(child)),
  ]

  const startTagDrag = (event: ReactDragEvent<HTMLButtonElement>, node: TagNode) => {
    event.dataTransfer?.setData('text/plain', node.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    setDragTagId(node.id)
    setTagDragPreview({ name: node.name, x: event.clientX, y: event.clientY })
    const hideImage = new Image()
    hideImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    event.dataTransfer?.setDragImage(hideImage, 0, 0)
  }

  const endTagDrag = () => {
    setDragTagId(null)
    setTagDragPreview(null)
    setTagDropTarget(null)
  }

  const handleTagDragOver = (event: ReactDragEvent<HTMLDivElement>, targetId: string) => {
    if (!dragTagId || dragTagId === targetId) return
    event.preventDefault()
    const target = findTagNode(localTags, targetId)
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - rect.top) / Math.max(1, rect.height)
    const position = isTagGroup(target) && ratio > 0.3 && ratio < 0.7
      ? 'inside'
      : ratio < 0.35 ? 'before' : 'after'
    setTagDropTarget((current) => (current?.id === targetId && current.position === position ? current : { id: targetId, position }))
  }

  const reorderSiblings = async (sourceId: string, targetId: string, position: 'before' | 'after') => {
    const source = findTagNode(localTags, sourceId)
    const target = findTagNode(localTags, targetId)
    if (!source || !target) return
    const parentId = target.parent_id ?? null
    const siblings: TagNode[] = []
    const walk = (nodes: TagNode[]) => {
      nodes.forEach((node) => {
        if ((node.parent_id ?? null) === parentId) siblings.push(node)
        walk(node.children)
      })
    }
    walk(localTags)
    const withoutSource = siblings.filter((node) => node.id !== sourceId)
    const targetIndex = withoutSource.findIndex((node) => node.id === targetId)
    if (targetIndex < 0) return
    withoutSource.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, source)
    await request('/api/tags/reorder', {
      method: 'POST',
      body: JSON.stringify({
        scope: tab,
        items: withoutSource.map((node, index) => ({
          id: node.id,
          parentId: node.id === sourceId ? parentId : node.parent_id ?? null,
          sortOrder: index,
        })),
      }),
    })
  }

  const handleTagDrop = async (event: ReactDragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()
    const sourceId = dragTagId || event.dataTransfer.getData('text/plain')
    const target = tagDropTarget ? findTagNode(localTags, tagDropTarget.id) : findTagNode(localTags, targetId)
    if (!sourceId || !target) {
      endTagDrag()
      return
    }
    const source = findTagNode(localTags, sourceId)
    if (!source) {
      endTagDrag()
      return
    }
    const position = tagDropTarget?.position ?? 'inside'
    if (position === 'inside' && isTagGroup(target)) {
      if (getDescendantTagIds(target).includes(sourceId)) {
        endTagDrag()
        return
      }
      await request(`/api/tags/${sourceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ parentId: target.id }),
      })
      setLocalTags((current) => moveTagInTree(current, sourceId, target.id))
    } else {
      if (target.parent_id && findTagNode(localTags, target.parent_id) && getDescendantTagIds(findTagNode(localTags, target.parent_id) as TagNode).includes(sourceId)) {
        endTagDrag()
        return
      }
      await request(`/api/tags/${sourceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ parentId: target.parent_id ?? null }),
      })
      setLocalTags((current) => moveTagInTree(current, sourceId, target.parent_id ?? null))
      await reorderSiblings(sourceId, target.id, position === 'inside' ? 'after' : position)
    }
    endTagDrag()
    onChanged()
  }

  const openTagContextMenu = (event: MouseEvent, node: TagNode | null) => {
    event.preventDefault()
    event.stopPropagation()
    setTagContextMenu({ x: event.clientX, y: event.clientY, node })
  }

  const createGroup = async (parentId: string | null = null) => {
    const name = newName.trim() || '新分组'
    const response = await request('/api/tags', {
      method: 'POST',
      body: JSON.stringify({
        name,
        group: name,
        scope: tab,
        parentId,
        color: '#18181b',
      }),
    })
    const created = (await response.json()) as TagNode
    setNewName('')
    setSearch('')
    setLocalTags((current) =>
      parentId
        ? insertTagIntoTree(current, parentId, { ...created, children: [] })
        : [...current, { ...created, children: [] }],
    )
    if (parentId) setExpanded((current) => new Set([...current, parentId]))
    onChanged()
  }

  const submitInlineCreate = async () => {
    if (!inlineCreate) return
    const name = inlineCreateValue.trim() || (inlineCreate.kind === 'group' ? '新分组' : '新标签')
    const response = await request('/api/tags', {
      method: 'POST',
      body: JSON.stringify({
        name,
        group: inlineCreate.kind === 'group' ? name : (tab === 'page' ? '页面' : '自定义'),
        scope: tab,
        parentId: inlineCreate.parentId,
        color: '#18181b',
      }),
    })
    const created = (await response.json()) as TagNode
    setInlineCreate(null)
    setInlineCreateValue('')
    setSearch('')
    setLocalTags((current) => insertTagIntoTree(current, inlineCreate.parentId, { ...created, children: [] }))
    setExpanded((current) => new Set([...current, inlineCreate.parentId]))
    onChanged()
  }

  const startRename = (node: TagNode) => {
    setRenamingId(node.id)
    setRenameValue(node.name)
  }

  const commitRename = async (node: TagNode) => {
    const name = renameValue.trim()
    if (!name) {
      setRenamingId('')
      return
    }
    const response = await request(`/api/tags/${node.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
    const updated = (await response.json()) as TagNode
    setLocalTags((current) => updateTagInTree(current, node.id, { name: updated.name }))
    setRenamingId('')
    onChanged()
  }

  const deleteNode = async (node: TagNode) => {
    await request(`/api/tags/${node.id}`, { method: 'DELETE' })
    setLocalTags((current) => removeTagFromTree(current, node.id))
    if (moveTarget?.id === node.id) setMoveTarget(null)
    onChanged()
  }

  const moveNode = async (node: TagNode) => {
    await request(`/api/tags/${node.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: moveValue || null }),
    })
    setLocalTags((current) => moveTagInTree(current, node.id, moveValue || null))
    setMoveTarget(null)
    setMoveValue('')
    onChanged()
  }

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderNode = (node: TagNode, depth = 0): ReactElement => {
    const isGroup = node.children.length > 0 || node.name === node.group
    const count = tab === 'work' ? node.work_count ?? 0 : node.page_count ?? 0
    const isExpanded = expanded.has(node.id)
    return (
      <div className="tag-tree-branch" key={node.id}>
        <div
          className={[
            'folder-row',
            dragTagId === node.id ? 'dragging' : '',
            tagDropTarget?.id === node.id ? `folder-drop-${tagDropTarget.position}` : '',
          ].filter(Boolean).join(' ')}
          data-tag-id={node.id}
          data-depth={depth}
          onContextMenu={(event) => openTagContextMenu(event, node)}
          onDragOver={(event) => handleTagDragOver(event, node.id)}
          onDrop={(event) => void handleTagDrop(event, node.id)}
          style={{ '--tree-line-left': `${10 + depth * 24}px` } as CSSProperties & Record<'--tree-line-left', string>}
        >
          {isGroup ? (
            <button
              className="folder-toggle"
              onClick={() => toggleExpanded(node.id)}
              type="button"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="folder-toggle-placeholder" />
          )}
          <button
            className={isGroup ? 'folder-item tag-group-item' : 'folder-item tag-leaf-item'}
            draggable
            onDoubleClick={() => startRename(node)}
            onDragStart={(event) => startTagDrag(event, node)}
            onDragEnd={endTagDrag}
            onContextMenu={(event) => openTagContextMenu(event, node)}
            style={{ paddingLeft: 10 + depth * 24 }}
            type="button"
          >
            {isGroup ? <FolderKanban size={14} /> : <Tags size={14} style={{ color: tagColorStyle(node.name).color }} />}
            {renamingId === node.id ? (
              <input
                autoFocus
                className="folder-rename-input"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={() => void commitRename(node)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void commitRename(node)
                  if (event.key === 'Escape') setRenamingId('')
                }}
              />
            ) : (
              <span>{node.name}</span>
            )}
            {count > 0 && <b>{count}</b>}
          </button>
          {moveTarget?.id === node.id && (
            <div className="tag-manager-move-row">
              <select value={moveValue} onChange={(event) => setMoveValue(event.target.value)}>
                <option value="">顶层</option>
                {groupOptions
                  .filter((option) => option.id !== node.id)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
              </select>
              <button className="ghost-button" onClick={() => void moveNode(node)} type="button">
                移动
              </button>
            </div>
          )}
          {inlineCreate?.parentId === node.id && (
            <div
              className="tag-inline-create"
              style={{ paddingLeft: 10 + (depth + 1) * 24 }}
            >
              <input
                autoFocus
                value={inlineCreateValue}
                onChange={(event) => setInlineCreateValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) void submitInlineCreate()
                  if (event.key === 'Escape') {
                    setInlineCreate(null)
                    setInlineCreateValue('')
                  }
                }}
                placeholder={inlineCreate.kind === 'group' ? '新建子分组' : '新建子标签'}
              />
              <button className="ghost-button" onClick={() => void submitInlineCreate()} type="button">
                创建
              </button>
            </div>
          )}
        </div>
        {isGroup && isExpanded && (
          <div className="tag-tree-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <section
      className="tag-manager-page"
      onDragEnter={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="tag-manager-toolbar">
        <div className="tag-manager-tabs">
          <button className={tab === 'page' ? 'active' : ''} onClick={() => setTab('page')} type="button">
            图片标签 <b>{leafCounts.page}</b>
          </button>
          <button className={tab === 'work' ? 'active' : ''} onClick={() => setTab('work')} type="button">
            作品分类标签 <b>{leafCounts.work}</b>
          </button>
        </div>
        <div className="tag-manager-search">
          <Search size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标签" />
        </div>
      </div>

      <div
        className="tag-manager-tree-panel"
        onContextMenu={(event) => openTagContextMenu(event, null)}
      >
        <div className="tag-manager-list">
          {visibleRoots.length === 0 && (
            <div className="empty-state">
              <EmptyStateIllustration
                compact
                alt={search ? '没有匹配的标签' : '暂无标签'}
              />
              <strong>{search ? '没有匹配的标签' : `当前没有${tab === 'work' ? '作品标签' : '图片标签'}`}</strong>
            </div>
          )}
          {visibleRoots.map((node) => renderNode(node))}
        </div>
      </div>

      {tagContextMenu && (
        <>
          <button
            aria-label="关闭标签菜单"
            className="context-menu-backdrop"
            onClick={() => setTagContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault()
              setTagContextMenu(null)
            }}
            type="button"
          />
          <div className="context-menu" style={{ left: tagContextMenu.x, top: tagContextMenu.y }}>
            {!tagContextMenu.node && (
              <>
                <button
                  onClick={() => {
                    void createGroup()
                    setTagContextMenu(null)
                  }}
                  type="button"
                >
                  新建分组
                </button>
              </>
            )}
            {tagContextMenu.node && (
              <>
                {isTagGroup(tagContextMenu.node) && (
                  <>
                    <button
                      onClick={() => {
                        setInlineCreate({ parentId: (tagContextMenu.node as TagNode).id, kind: 'group' })
                        setTagContextMenu(null)
                      }}
                      type="button"
                    >
                      新建子分组
                    </button>
                    <button
                      onClick={() => {
                        setInlineCreate({ parentId: (tagContextMenu.node as TagNode).id, kind: 'tag' })
                        setTagContextMenu(null)
                      }}
                      type="button"
                    >
                      新建子标签
                    </button>
                  </>
                )}
                {onViewResources && (
                  <button
                    onClick={() => {
                      onViewResources(tab, (tagContextMenu.node as TagNode).id, (tagContextMenu.node as TagNode).name)
                      setTagContextMenu(null)
                    }}
                    type="button"
                  >
                    查看资源
                  </button>
                )}
                <button
                  onClick={() => {
                    startRename(tagContextMenu.node as TagNode)
                    setTagContextMenu(null)
                  }}
                  type="button"
                >
                  重命名
                </button>
                <button
                  onClick={() => {
                    setMoveTarget(tagContextMenu.node as TagNode)
                    setMoveValue(String((tagContextMenu.node as TagNode).parent_id ?? ''))
                    setTagContextMenu(null)
                  }}
                  type="button"
                >
                  移动分组
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    void deleteNode(tagContextMenu.node as TagNode)
                    setTagContextMenu(null)
                  }}
                  type="button"
                >
                  删除
                </button>
              </>
            )}
          </div>
        </>
      )}
      {tagDragPreview && (
        <div className="folder-drag-preview" style={{ left: tagDragPreview.x + 12, top: tagDragPreview.y + 14 }}>
          <span>{tagDragPreview.name}</span>
        </div>
      )}
    </section>
  )
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = '确定',
  onCancel,
  onConfirm,
}: {
  title: string
  message: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-icon">
          <Trash2 size={20} />
        </div>
        <strong>{title}</strong>
        <span>{message}</span>
        <div className="confirm-dialog-actions">
          <button className="ghost-button" onClick={onCancel} type="button">
            取消
          </button>
          <button className="primary-button danger" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function TrashView({
  trashWorks,
  onRestore,
  onDelete,
  onClear,
  onPreview,
  onBack,
}: {
  trashWorks: TrashWork[]
  onRestore: (ids: string[]) => void
  onDelete: (ids: string[]) => void
  onClear: () => void
  onPreview: (workId: string) => void
  onBack: () => void
}) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string
    message: string
    confirmLabel: string
    onConfirm: () => void
  } | null>(null)
  const selectedCount = selectedIds.size

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, sort, trashWorks.length])

  const kinds = useMemo(() => Array.from(new Set(trashWorks.map((work) => work.kind))).sort(), [trashWorks])

  const formatDeletedAt = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getCategory = (work: TrashWork) => (work.tags ?? [])[0] ?? '未分类'

  const getRemainingDays = (deletedAt: string) => {
    const deletedTime = new Date(deletedAt).getTime()
    if (!Number.isFinite(deletedTime)) return TRASH_RETENTION_DAYS
    return Math.max(0, Math.ceil((deletedTime + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000)))
  }

  const filteredTrash = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const list = trashWorks.filter((work) => {
      const matchesType = typeFilter === 'all' || work.kind === typeFilter
      const matchesSearch =
        !keyword ||
        [
          work.title,
          work.fileName,
          work.kind,
          getCategory(work),
          ...(work.tags ?? []),
        ].join(' ').toLowerCase().includes(keyword)
      return matchesType && matchesSearch
    })

    return list.sort((a, b) => {
      if (sort === 'oldest') return a.deletedAt.localeCompare(b.deletedAt)
      if (sort === 'remaining') return getRemainingDays(a.deletedAt) - getRemainingDays(b.deletedAt)
      if (sort === 'name') return a.title.localeCompare(b.title, 'zh-CN')
      return b.deletedAt.localeCompare(a.deletedAt)
    })
  }, [search, sort, trashWorks, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filteredTrash.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedWorks = filteredTrash.slice((safePage - 1) * pageSize, safePage * pageSize)
  const pageIds = pagedWorks.map((work) => work.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const expiringCount = trashWorks.filter((work) => getRemainingDays(work.deletedAt) <= 7).length
  const trashPageTotal = trashWorks.reduce((sum, work) => sum + work.pageCount, 0)

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllPage = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id))
      } else {
        pageIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  if (trashWorks.length === 0) {
    return (
      <section className="trash-full-empty">
        <header className="trash-full-head">
          <h2>回收站</h2>
          <div className="trash-full-actions">
            <button className="ghost-button danger" disabled type="button">
              <Trash2 size={14} />
              清空回收站
            </button>
            <button
              className={showFilters ? 'filter-button active' : 'filter-button'}
              onClick={() => setShowFilters((value) => !value)}
              type="button"
            >
              <Filter size={14} />
              筛选
            </button>
          </div>
        </header>

        <div className="trash-full-notice">
          <RotateCcw size={14} />
          <span>回收站中的内容将在 {TRASH_RETENTION_DAYS} 天后自动永久删除</span>
        </div>

        <div className="trash-empty-body">
          <img
            alt="回收站空状态"
            className="trash-empty-illustration"
            src="/illustrations/empty-state-flower.svg"
          />
          <div className="trash-empty-copy">
            <strong>回收站还是空的</strong>
            <span>被删除的作品将显示在这里，您可以在此恢复或永久删除</span>
            <button className="primary-button" onClick={onBack} type="button">
              去作品库看看
            </button>
          </div>
        </div>

        <footer className="trash-full-footer">
          <span>每页显示</span>
          <select
            className="filter-select"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value))
              setPage(1)
            }}
            aria-label="每页条数"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <button className="icon-button" disabled type="button" title="上一页">
            <ChevronsLeft size={14} />
          </button>
          <button className="icon-button" disabled type="button" title="下一页">
            <ChevronsRight size={14} />
          </button>
        </footer>
      </section>
    )
  }

  return (
    <>
      <section className={trashWorks.length === 0 ? 'trash-page trash-page-empty' : 'trash-page'}>
      <header className="trash-head">
        <div className="trash-head-title">
          <h2>回收站</h2>
        </div>
        <div className="trash-head-actions">
          <button
            className="ghost-button danger"
            disabled={trashWorks.length === 0}
            onClick={() => {
              setPendingConfirm({
                title: '清空回收站',
                message: '确定清空回收站？此操作不可恢复。',
                confirmLabel: '清空回收站',
                onConfirm: onClear,
              })
            }}
            type="button"
          >
            <Trash2 size={14} />
            清空回收站
          </button>
          <button
            className={showFilters ? 'filter-button active' : 'filter-button'}
            onClick={() => setShowFilters((value) => !value)}
            type="button"
          >
            <Filter size={14} />
            筛选
          </button>
        </div>
      </header>

      <div className="trash-notice">
        <RotateCcw size={15} />
        <span>回收站中的内容将在 {TRASH_RETENTION_DAYS} 天后自动永久删除</span>
      </div>

      {trashWorks.length > 0 && (
        <div className="trash-overview">
          <div>
            <i><Library size={16} /></i>
            <span>回收站作品</span>
            <b>{trashWorks.length}</b>
          </div>
          <div>
            <i><ImageIcon size={16} /></i>
            <span>页面素材</span>
            <b>{trashPageTotal}</b>
          </div>
          <div>
            <i><CalendarDays size={16} /></i>
            <span>即将过期</span>
            <b>{expiringCount}</b>
          </div>
        </div>
      )}

      {trashWorks.length === 0 ? (
        <div className="trash-empty">
          <strong>回收站还是空的</strong>
          <span>被删除的作品将显示在这里，您可以在此恢复或永久删除</span>
          <button className="primary-button" onClick={onBack} type="button">
            去作品库看看
          </button>
          <footer className="trash-pagination trash-pagination-empty">
            <div>
              <span>每页显示</span>
              <select
                className="filter-select"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
                aria-label="每页条数"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <button className="icon-button" disabled type="button" title="上一页">
                <ChevronsLeft size={14} />
              </button>
              <button className="icon-button" disabled type="button" title="下一页">
                <ChevronsRight size={14} />
              </button>
            </div>
          </footer>
        </div>
      ) : (
        <>
          <div className="trash-toolbar">
            <div className="trash-toolbar-left">
              <label className="trash-select-all">
                <input
                  checked={allPageSelected}
                  onChange={toggleAllPage}
                  type="checkbox"
                />
                <span>已选择 {selectedCount} 项</span>
              </label>
              <button
                className="ghost-button"
                disabled={selectedCount === 0}
                onClick={() => {
                  onRestore(Array.from(selectedIds))
                  setSelectedIds(new Set())
                }}
                type="button"
              >
                <RotateCcw size={14} />
                还原
              </button>
              <button
                className="ghost-button danger"
                disabled={selectedCount === 0}
                onClick={() => {
                  const ids = Array.from(selectedIds)
                  setPendingConfirm({
                    title: '永久删除',
                    message: '确定永久删除选中的作品？此操作不可恢复。',
                    confirmLabel: '永久删除',
                    onConfirm: () => {
                      onDelete(ids)
                      setSelectedIds(new Set())
                    },
                  })
                }}
                type="button"
              >
                <Trash2 size={14} />
                永久删除
              </button>
            </div>
            <div className="trash-toolbar-right">
              <select
                className="filter-select"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                aria-label="类型筛选"
              >
                <option value="all">全部类型</option>
                {kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
              </select>
              <select
                className="filter-select"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                aria-label="排序"
              >
                <option value="newest">删除时间（最新）</option>
                <option value="oldest">删除时间（最早）</option>
                <option value="remaining">剩余天数</option>
                <option value="name">作品名称</option>
              </select>
            </div>
          </div>

          {filteredTrash.length === 0 ? (
            <div className="trash-filter-empty">
              <EmptyStateIllustration compact alt="没有匹配的作品" />
              <strong>没有匹配的作品</strong>
              <button className="ghost-button" onClick={() => { setSearch(''); setTypeFilter('all'); setSort('newest') }} type="button">
                清除筛选
              </button>
            </div>
          ) : (
            <>
              <div className="trash-table-wrap">
                <table className="trash-table">
                  <thead>
                    <tr>
                      <th className="trash-check-col">
                        <input
                          checked={allPageSelected}
                          onChange={toggleAllPage}
                          type="checkbox"
                        />
                      </th>
                      <th>作品信息</th>
                      <th>所属分类</th>
                      <th>删除时间</th>
                      <th>剩余天数</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedWorks.map((work) => {
                      const remainingDays = getRemainingDays(work.deletedAt)
                      return (
                        <tr
                          className={selectedIds.has(work.id) ? 'selected' : ''}
                          key={work.id}
                          onClick={() => toggleSelected(work.id)}
                        >
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={selectedIds.has(work.id)}
                              onChange={() => toggleSelected(work.id)}
                              type="checkbox"
                            />
                          </td>
                          <td>
                            <div className="trash-work-cell">
                              <button
                                className="trash-row-cover"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onPreview(work.id)
                                }}
                                type="button"
                              >
                                {work.coverThumbnailUrl ? (
                                  <img alt={work.title} src={work.coverThumbnailUrl} />
                                ) : (
                                  <Library size={16} />
                                )}
                              </button>
                              <div>
                                <strong
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onPreview(work.id)
                                  }}
                                >
                                  {work.title}
                                </strong>
                                <span>{work.kind} · {work.pageCount} 页 · {work.fileName}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="trash-category">{getCategory(work)}</span>
                          </td>
                          <td>{formatDeletedAt(work.deletedAt)}</td>
                          <td>
                            <span className={remainingDays <= 7 ? 'trash-days danger' : 'trash-days'}>
                              {remainingDays} 天
                            </span>
                          </td>
                          <td>
                            <div className="trash-row-actions" onClick={(event) => event.stopPropagation()}>
                              <button className="ghost-button" onClick={() => onRestore([work.id])} type="button">
                                <RotateCcw size={13} />
                                还原
                              </button>
                              <button
                                className="ghost-button danger"
                                onClick={() => {
                                  setPendingConfirm({
                                    title: '永久删除',
                                    message: `确定永久删除“${work.title}”？此操作不可恢复。`,
                                    confirmLabel: '永久删除',
                                    onConfirm: () => onDelete([work.id]),
                                  })
                                }}
                                type="button"
                              >
                                <Trash2 size={13} />
                                永久删除
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <footer className="trash-pagination">
                <span>共 {filteredTrash.length} 项</span>
                <div>
                  <button
                    className="ghost-button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    type="button"
                  >
                    上一页
                  </button>
                  <b>{safePage} / {totalPages}</b>
                  <button
                    className="ghost-button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    type="button"
                  >
                    下一页
                  </button>
                </div>
                <select
                  className="filter-select"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value))
                    setPage(1)
                  }}
                  aria-label="每页条数"
                >
                  <option value={10}>10 条/页</option>
                  <option value={20}>20 条/页</option>
                  <option value={50}>50 条/页</option>
                </select>
              </footer>
            </>
          )}
        </>
      )}
    </section>
    {pendingConfirm && (
      <ConfirmDialog
        title={pendingConfirm.title}
        message={pendingConfirm.message}
        confirmLabel={pendingConfirm.confirmLabel}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          pendingConfirm.onConfirm()
          setPendingConfirm(null)
        }}
      />
    )}
    </>
  )
}

function LibraryView({
  works,
  collections,
  tagTree,
  initialTagRequest,
  initialSelectedWorkIds,
  initialScrollTop,
  onInitialStateConsumed,
  onImport,
  onCollectionsChange,
  openWork,
  deleteWork,
  deleteWorks,
  tagWork,
  untagWork,
  rateWork,
  toggleFavorite,
  copyPage,
}: {
  works: Work[]
  collections: Collection[]
  tagTree: TagNode[]
  initialTagRequest?: { scope: 'work'; tagId: string; tagName: string } | null
  initialSelectedWorkIds?: string[]
  initialScrollTop?: number
  onInitialStateConsumed?: () => void
  onImport: () => void
  onCollectionsChange: (next: Collection[]) => void
  openWork: (workId: string, snapshot?: { selectedWorkIds: string[]; scrollTop: number }) => void
  deleteWork: (workId: string) => void
  deleteWorks: (workIds: string[]) => void
  tagWork: (workId: string, tag: string) => void
  untagWork: (workId: string, tag: string) => void
  rateWork: (workId: string, rating: number) => void
  toggleFavorite: (workId: string) => void
  copyPage: (page: GalleryPage) => Promise<void>
  exportPage: (page: GalleryPage) => Promise<void>
}) {
  const [gridZoom, setGridZoom] = useState(80)
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagMode, setTagMode] = useState<'AND' | 'OR'>('OR')
  const [kind, setKind] = useState('')
  const [dateRange, setDateRange] = useState('')
  const [selectedHex, setSelectedHex] = useState<string | null>(null)
  const [selectedColorFamily, setSelectedColorFamily] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<'all' | 'neutral' | 'multi'>('all')
  const [colorTolerance, setColorTolerance] = useState(80)
  const [colorMinRatio, setColorMinRatio] = useState(0.15)
  const [rating, setRating] = useState(0)
  const [sort, setSort] = useState('newest')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [selectedWorkIds, setSelectedWorkIds] = useState<Set<string>>(new Set())
  const [batchTag, setBatchTag] = useState('')
  const [batchRating, setBatchRating] = useState(0)
  const [workContextMenu, setWorkContextMenu] = useState<{ x: number; y: number; mode: 'main' | 'tag' | 'folder' | 'rating' } | null>(null)
  const [exportFormatWork, setExportFormatWork] = useState<Work | null>(null)
  const lastSelectedWorkIdRef = useRef<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [inspectorWidth, setInspectorWidth] = useState(defaultInspectorWidth)
  const [colorProfilesRequested, setColorProfilesRequested] = useState(false)
  const libraryContentRef = useRef<HTMLDivElement>(null)
  const workGridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialSelectedWorkIds?.length) {
      const ids = new Set(initialSelectedWorkIds)
      setSelectedWorkIds(ids)
      lastSelectedWorkIdRef.current = initialSelectedWorkIds[initialSelectedWorkIds.length - 1] ?? null
    }
    const frame = requestAnimationFrame(() => {
      if (initialScrollTop && workGridRef.current) {
        workGridRef.current.scrollTo({ top: initialScrollTop })
      }
    })
    onInitialStateConsumed?.()
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--inspector-width', `${inspectorWidth}px`)
  }, [inspectorWidth])

  useEffect(() => {
    const onResize = () => {
      setInspectorWidth((current) => Math.min(420, Math.max(220, current)))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    if (initialTagRequest) setSelectedTags([initialTagRequest.tagName])
  }, [initialTagRequest])
  const clampZoom = useCallback(
    (value: number) => setGridZoom(Math.min(220, Math.max(35, value))),
    [],
  )
  const cardMin = Math.round(150 + gridZoom)
  const selectedWorks = works.filter((work) => selectedWorkIds.has(work.id))
  const inspectedWork = selectedWorkIds.size === 1 ? works.find((work) => work.id === Array.from(selectedWorkIds)[0]) : undefined
  const addBatchTag = () => {
    const tag = batchTag.trim()
    if (!tag || selectedWorks.length === 0) return
    selectedWorks.forEach((work) => tagWork(work.id, tag))
    setBatchTag('')
  }

  const rateSelectedWorks = (value: number) => {
    if (selectedWorks.length === 0) return
    selectedWorks.forEach((work) => rateWork(work.id, value))
    setBatchRating(value)
  }

  const exportWorksAs = async (targetWorks: Work[], format: 'pdf' | 'ppt') => {
    if (targetWorks.length === 0) return
    const items: Array<{ title: string; blob: Blob }> = []
    for (const work of targetWorks) {
      for (const page of work.pages) {
        try {
          items.push({ title: page.title, blob: await getPageBlob(page) })
        } catch {
          // Skip unreadable pages and continue exporting the rest.
        }
      }
    }
    if (items.length === 0) {
      window.alert('没有可导出的页面')
      return
    }
    const fileName = targetWorks.length === 1 ? safeFileName(targetWorks[0].title) : 'Normix-选中作品'
    try {
      if (format === 'pdf') await exportPagesAsPdf(items, `${fileName}.pdf`)
      else await exportPagesAsPptx(items, `${fileName}.pptx`)
    } catch {
      window.alert('导出失败，请重试')
    }
  }

  const closeWorkContextMenu = () => setWorkContextMenu(null)

  useEffect(() => {
    if (!workContextMenu) return
    const close = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.work-context-menu')) return
      closeWorkContextMenu()
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeWorkContextMenu()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [workContextMenu])

  const openWorkContextMenu = (event: MouseEvent<HTMLElement>, work: Work) => {
    event.preventDefault()
    if (!selectedWorkIds.has(work.id)) {
      setSelectedWorkIds(new Set([work.id]))
      lastSelectedWorkIdRef.current = work.id
    }
    setWorkContextMenu({ x: event.clientX, y: event.clientY, mode: 'main' })
  }

  const kinds = useMemo(() => Array.from(new Set(works.map((work) => work.kind))).sort(), [works])
  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>()
    works.forEach((work) => (work.tags ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [works])

  const workTagTree = useMemo(() => filterTagTreeByScope(tagTree, 'work'), [tagTree])
  const tagPathsByName = useMemo(() => {
    const map = new Map<string, string[][]>()
    const walk = (nodes: TagNode[], ancestors: string[] = []) => {
      nodes.forEach((node) => {
        const path = [...ancestors, node.name]
        const existing = map.get(node.name) ?? []
        existing.push(path)
        map.set(node.name, existing)
        walk(node.children, path)
      })
    }
    walk(workTagTree)
    return map
  }, [workTagTree])

  const hasColorFilter = Boolean(selectedHex || selectedColorFamily || colorMode !== 'all')
  const colorSources = useMemo(
    () => (hasColorFilter || colorProfilesRequested)
      ? works.map((work) => ({ id: work.id, url: work.pages[0]?.imageUrl }))
      : [],
    [colorProfilesRequested, hasColorFilter, works],
  )
  const workProfileMap = useImageColorProfiles(colorSources)

  const filteredWorks = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const cutoff7 = Date.now() - 7 * 24 * 60 * 60 * 1000
    const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000

    const list = works.filter((work) => {
      if (favoriteOnly && !work.favorite) return false
      const searchText = [
        work.title,
        work.fileName,
        work.description,
        work.industry,
        work.style,
        work.purpose,
        work.kind,
        ...(work.tags ?? []),
      ]
        .join(' ')
        .toLowerCase()
      const matchesSearch = !keyword || searchText.includes(keyword)
      const matchesKind = !kind || work.kind === kind
      const uploadedTime = new Date(work.uploadedAt).getTime()
      const matchesDate =
        !dateRange ||
        (dateRange === '最近7天' && uploadedTime >= cutoff7) ||
        (dateRange === '最近30天' && uploadedTime >= cutoff30) ||
        (dateRange === '今年' && new Date(work.uploadedAt).getFullYear() === new Date().getFullYear())
      const profile = workProfileMap[work.id]
      const matchesColor =
        selectedHex
          ? profileMatchesColor(profile, selectedHex, colorTolerance, colorMinRatio)
          : selectedColorFamily
            ? profileMatchesFamily(profile, selectedColorFamily, colorMinRatio)
            : colorMode === 'neutral'
              ? (profile?.neutralRatio ?? 0) >= colorMinRatio
              : colorMode === 'multi'
                ? profileMatchesMultiColor(profile, colorMinRatio)
                : true
      const matchesTags =
        selectedTags.length === 0 ||
        (tagMode === 'AND'
          ? selectedTags.every((tag) => (work.tags ?? []).includes(tag))
          : selectedTags.some((tag) => (work.tags ?? []).includes(tag)))
      const matchesRating = !rating || (work.rating ?? 0) >= rating

      return matchesSearch && matchesKind && matchesDate && matchesColor && matchesTags && matchesRating
    })

    const qualityOrder = { S: 0, A: 1, B: 2, '待筛选': 3 } as Record<string, number>
    return list.sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title, 'zh-CN')
      if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
      if (sort === 'size') return (b.fileSize ?? 0) - (a.fileSize ?? 0)
      if (sort === 'oldest') return a.uploadedAt.localeCompare(b.uploadedAt)
      if (sort === 'pages-desc') return b.pages.length - a.pages.length
      if (sort === 'pages-asc') return a.pages.length - b.pages.length
      if (sort === 'quality') return (qualityOrder[a.quality] ?? 9) - (qualityOrder[b.quality] ?? 9)
      return b.uploadedAt.localeCompare(a.uploadedAt)
    })
  }, [colorMode, colorMinRatio, colorTolerance, dateRange, favoriteOnly, kind, rating, search, selectedColorFamily, selectedHex, selectedTags, sort, tagMode, workProfileMap, works])

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]))
  }

  const hasFilters = Boolean(search || selectedTags.length > 0 || kind || dateRange || rating || hasColorFilter)
  const inspectorVisible = inspectorOpen
  const clearFilters = () => {
    setSearch('')
    setSelectedTags([])
    setKind('')
    setDateRange('')
    setRating(0)
    setSelectedHex(null)
    setSelectedColorFamily(null)
    setColorMode('all')
  }

  const startInspectorResize = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = inspectorWidth
    const onMove = (moveEvent: globalThis.MouseEvent) => {
      setInspectorWidth(Math.min(420, Math.max(220, startWidth - (moveEvent.clientX - startX))))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    const element = libraryContentRef.current
    if (!element) return
    const onWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      clampZoom(gridZoom + (event.deltaY < 0 ? 12 : -12))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [clampZoom, gridZoom])

  const toggleSelect = (event: MouseEvent, workId: string) => {
    if (event.shiftKey && lastSelectedWorkIdRef.current) {
      const start = filteredWorks.findIndex((work) => work.id === lastSelectedWorkIdRef.current)
      const end = filteredWorks.findIndex((work) => work.id === workId)
      if (start >= 0 && end >= 0) {
        const ids = new Set(selectedWorkIds)
        const [from, to] = start < end ? [start, end] : [end, start]
        for (let index = from; index <= to; index += 1) ids.add(filteredWorks[index].id)
        setSelectedWorkIds(ids)
        lastSelectedWorkIdRef.current = workId
        setInspectorOpen(true)
        return
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedWorkIds((current) => {
        const next = new Set(current)
        if (next.has(workId)) next.delete(workId)
        else next.add(workId)
        return next
      })
      lastSelectedWorkIdRef.current = workId
      setInspectorOpen(true)
      return
    }
    setSelectedWorkIds(new Set([workId]))
    lastSelectedWorkIdRef.current = workId
    setInspectorOpen(true)
  }

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        setInspectorOpen((open) => !open)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selectedWorks.length > 0) {
        event.preventDefault()
        selectedWorks.forEach((work) => {
          if (work.pages[0]) void copyPage(work.pages[0])
        })
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedWorks.length > 0) {
        event.preventDefault()
        deleteWorks(Array.from(selectedWorkIds))
        setSelectedWorkIds(new Set())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copyPage, deleteWork, deleteWorks, selectedWorkIds, selectedWorks])

  return (
    <section className="library-page">
      <div className="library-inspector-layout">
        <div className="library-content" ref={libraryContentRef}>
          <div className="library-toolbar">
            <div className="library-toolbar-title">
              <strong>作品库</strong>
              <span>{filteredWorks.length} 个作品 · {filteredWorks.reduce((sum, work) => sum + work.pages.length, 0)} 页</span>
            </div>
            <div className="library-toolbar-actions">
              <button
                className={favoriteOnly ? 'filter-button active' : 'filter-button'}
                onClick={() => setFavoriteOnly((value) => !value)}
                type="button"
              >
                <Star size={14} fill={favoriteOnly ? 'currentColor' : 'none'} />
                收藏
              </button>
              <select
                className="filter-select"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                aria-label="排序"
              >
                <option value="newest">最新导入</option>
                <option value="name">名称</option>
                <option value="pages-desc">页数</option>
                <option value="size">文件大小</option>
                <option value="rating">评分</option>
              </select>
            </div>
          </div>
          <FilterRail
        search={search}
        onSearchChange={setSearch}
        primaryLabel="类型"
        primaryOptions={kinds}
        primaryValue={kind}
        onPrimaryChange={setKind}
        secondary={{
          label: '时间',
          options: ['最近7天', '最近30天', '今年'],
          value: dateRange,
          onChange: setDateRange,
        }}
        profiles={workProfileMap}
        selectedHex={selectedHex}
        selectedColorFamily={selectedColorFamily}
        colorMode={colorMode}
        colorTolerance={colorTolerance}
        colorMinRatio={colorMinRatio}
        onSelectHex={setSelectedHex}
        onSelectColorFamily={setSelectedColorFamily}
        onColorModeChange={setColorMode}
        onToleranceChange={setColorTolerance}
        onMinRatioChange={setColorMinRatio}
        hasFilters={hasFilters}
        onClear={clearFilters}
        tagOptions={tagOptions}
        selectedTags={selectedTags}
        onTagToggle={toggleTag}
        tagMode={tagMode}
        onTagModeChange={setTagMode}
        onColorFilterOpenChange={setColorProfilesRequested}
        rating={rating}
        onRatingChange={setRating}
          />

          <div
            ref={workGridRef}
            className="work-grid library-grid"
            onMouseDown={(event) => {
              if (!(event.target as HTMLElement).closest('.work-card')) {
                setSelectedWorkIds(new Set())
                lastSelectedWorkIdRef.current = null
              }
            }}
            style={{ '--work-card-min': `${cardMin}px` } as CSSProperties & Record<'--work-card-min', string>}
          >
            {filteredWorks.map((work) => (
              <WorkCard
                key={work.id}
                work={work}
                category={collections
                  .filter((collection) => collection.pageIds.some((pageId) => work.pages.some((page) => page.id === pageId)))
                  .map((collection) => collection.name)
                  .slice(0, 2)
                  .join(' / ')}
                selected={selectedWorkIds.has(work.id)}
                onSelect={(event) => toggleSelect(event, work.id)}
                onContextMenu={(event) => openWorkContextMenu(event, work)}
                onToggleFavorite={toggleFavorite}
                onOpen={() => openWork(work.id, {
                  selectedWorkIds: selectedWorkIds.size > 0 ? Array.from(selectedWorkIds) : [work.id],
                  scrollTop: workGridRef.current?.scrollTop ?? 0,
                })}
                tagPaths={tagPathsByName}
              />
            ))}
          </div>

          {filteredWorks.length === 0 && (
            works.length === 0 ? (
              <div className="folder-empty-state library-empty-state">
                <div className="folder-empty-visual">
                  <EmptyStateIllustration alt="导入你的第一个作品" />
                </div>
                <div className="folder-empty-copy">
                  <span>作品库</span>
                  <strong>导入你的第一个作品</strong>
                  <button className="primary-button" onClick={onImport} type="button">
                    导入作品
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <EmptyStateIllustration alt="没有匹配的作品" />
                <strong>没有匹配的作品</strong>
              </div>
            )
          )}
        </div>

        {inspectorVisible && (
          <>
            <div
              aria-label="拖动调整检查器宽度"
              className="inspector-layout-resizer"
              onMouseDown={startInspectorResize}
              title="拖动调整宽度"
            />
            {inspectedWork ? (
              <InspectorPanel
              title={inspectedWork.title}
              preview={inspectedWork.pages[0]}
              format={inspectedWork.kind}
              fileSize={inspectedWork.fileSize}
              createdAt={inspectedWork.uploadedAt}
              favorite={inspectedWork.favorite}
              note={inspectedWork.description || undefined}
              folders={collections
                .filter((collection) => collection.pageIds.some((pageId) => inspectedWork.pages.some((page) => page.id === pageId)))
                .map((collection) => collection.name)}
              folderTree={collections}
              onAddToFolderById={(folderId) => {
                const pageIds = inspectedWork.pages.map((page) => page.id)
                onCollectionsChange(
                  collections.map((collection) =>
                    collection.id === folderId
                      ? { ...collection, pageIds: Array.from(new Set([...collection.pageIds, ...pageIds])) }
                      : collection,
                  ),
                )
              }}
              tags={inspectedWork.tags ?? []}
              rating={inspectedWork.rating ?? 0}
              onRatingChange={(value) => rateWork(inspectedWork.id, value)}
              onToggleFavorite={() => toggleFavorite(inspectedWork.id)}
              onAddTag={(tag) => tagWork(inspectedWork.id, tag)}
              onRemoveTag={(tag) => untagWork(inspectedWork.id, tag)}
              onCopy={() => {
                if (inspectedWork.pages[0]) void copyPage(inspectedWork.pages[0])
              }}
              onExport={() => {
                setExportFormatWork(inspectedWork)
              }}
              onDelete={() => {
                deleteWork(inspectedWork.id)
                setSelectedWorkIds(new Set())
              }}
              onOpen={() => openWork(inspectedWork.id)}
              width={inspectorWidth}
              onWidthChange={setInspectorWidth}
              />
            ) : selectedWorks.length > 1 ? (
              <aside className="inspector-panel work-multi-inspector" style={{ width: `${inspectorWidth}px` }}>
              <div className="inspector-heading">
                <div className="inspector-heading-title">
                  <strong>已选择 {selectedWorks.length} 个作品</strong>
                </div>
              </div>
              <div className="inspector-section">
                <div className="inspector-section-title">
                  <span>批量添加标签</span>
                </div>
                <div className="inspector-tag-input">
                  <input
                    value={batchTag}
                    onChange={(event) => setBatchTag(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') addBatchTag()
                    }}
                    placeholder="添加标签"
                  />
                  <button className="icon-button" onClick={addBatchTag} type="button" title="添加标签">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="inspector-section">
                <div className="inspector-section-title">
                  <span>作品信息</span>
                </div>
                <div className="inspector-meta">
                  <div className="inspector-meta-row">
                    <span>文件数</span>
                    <strong>{selectedWorks.length}</strong>
                  </div>
                  <div className="inspector-meta-row">
                    <span>总页数</span>
                    <strong>{selectedWorks.reduce((sum, work) => sum + work.pages.length, 0)}</strong>
                  </div>
                </div>
              </div>
              <div className="inspector-section">
                <div className="inspector-section-title">
                  <span>评分</span>
                </div>
                <div className="inspector-rating">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      className={batchRating >= value ? 'active' : ''}
                      key={value}
                      onClick={() => rateSelectedWorks(batchRating === value ? 0 : value)}
                      type="button"
                      title={`${value} 星`}
                    >
                      <Star size={18} fill={batchRating >= value ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="inspector-actions">
                <button
                  className="ghost-button"
                  onClick={() => void exportWorksAs(selectedWorks, 'pdf')}
                  type="button"
                >
                  <FileText size={14} />
                  导出 PDF
                </button>
                <button
                  className="ghost-button"
                  onClick={() => void exportWorksAs(selectedWorks, 'ppt')}
                  type="button"
                >
                  <Presentation size={14} />
                  导出 PPT
                </button>
              </div>
              </aside>
            ) : (
              <aside className="inspector-empty" style={{ width: `${inspectorWidth}px` }}>
                <Library size={20} />
                <span>选择作品查看详情</span>
              </aside>
            )}
          </>
        )}
      </div>

      {exportFormatWork && (
        <div className="export-format-backdrop" onClick={() => setExportFormatWork(null)}>
          <div className="export-format-card" onClick={(event) => event.stopPropagation()}>
            <strong>导出作品</strong>
            <span>{exportFormatWork.title}</span>
            <div className="export-format-actions">
              <button
                onClick={() => void exportWorksAs([exportFormatWork], 'pdf').then(() => setExportFormatWork(null))}
                type="button"
              >
                <FileText size={16} />
                导出 PDF
              </button>
              <button
                onClick={() => void exportWorksAs([exportFormatWork], 'ppt').then(() => setExportFormatWork(null))}
                type="button"
              >
                <Presentation size={16} />
                导出 PPT
              </button>
            </div>
            <button className="export-format-cancel" onClick={() => setExportFormatWork(null)} type="button">
              取消
            </button>
          </div>
        </div>
      )}

      {workContextMenu && (
        <>
          <button
            aria-label="关闭作品菜单"
            className="context-menu-backdrop"
            onClick={closeWorkContextMenu}
            type="button"
          />
          <div
            className="context-menu work-context-menu"
            style={{ left: workContextMenu.x, top: workContextMenu.y }}
          >
            <div className="context-menu-title">已选择 {selectedWorks.length} 个作品</div>
            {workContextMenu.mode === 'main' && (
              <>
                <button onClick={() => setWorkContextMenu({ ...workContextMenu, mode: 'tag' })} type="button">
                  批量添加标签
                </button>
                <button onClick={() => setWorkContextMenu({ ...workContextMenu, mode: 'rating' })} type="button">
                  批量评分
                </button>
                <button
                  onClick={() => void exportWorksAs(selectedWorks, 'pdf').then(closeWorkContextMenu)}
                  type="button"
                >
                  导出 PDF
                </button>
                <button
                  onClick={() => void exportWorksAs(selectedWorks, 'ppt').then(closeWorkContextMenu)}
                  type="button"
                >
                  导出 PPT
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    deleteWorks(Array.from(selectedWorkIds))
                    setSelectedWorkIds(new Set())
                    closeWorkContextMenu()
                  }}
                  type="button"
                >
                  移入回收站 {selectedWorks.length} 个作品
                </button>
              </>
            )}
            {workContextMenu.mode === 'tag' && (
              <div className="work-context-tag-input">
                <input
                  value={batchTag}
                  onChange={(event) => setBatchTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      addBatchTag()
                      closeWorkContextMenu()
                    }
                  }}
                  placeholder="输入标签"
                  autoFocus
                />
                <button
                  className="ghost-button"
                  onClick={() => {
                    addBatchTag()
                    closeWorkContextMenu()
                  }}
                  type="button"
                >
                  添加
                </button>
              </div>
            )}
            {workContextMenu.mode === 'rating' && (
              <div className="inspector-rating work-context-rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    className={batchRating >= value ? 'active' : ''}
                    key={value}
                    onClick={() => {
                      rateSelectedWorks(batchRating === value ? 0 : value)
                      closeWorkContextMenu()
                    }}
                    type="button"
                  >
                    <Star size={18} fill={batchRating >= value ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function WorkPreview({
  work,
  zoom,
  setZoom,
  goBack,
  deleteWork,
  deletePage,
  tagPages,
  tagWork,
  untagWork,
  copyPage,
  exportPage,
}: {
  work?: Work
  zoom: number
  setZoom: (zoom: number) => void
  goBack: () => void
  deleteWork: (workId: string) => void
  deletePage: (workId: string, pageId: string) => void
  tagPages: (pageIds: string[], tag: string) => void
  tagWork: (workId: string, tag: string) => void
  untagWork: (workId: string, tag: string) => void
  copyPage: (page: GalleryPage) => Promise<void>
  exportPage: (page: GalleryPage) => Promise<void>
}) {
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set())
  const [batchTag, setBatchTag] = useState('重点参考')
  const [workTag, setWorkTag] = useState('')
  const selectedPages = work?.pages.filter((page) => selectedPageIds.has(page.id)) ?? []
  const clampZoom = useCallback(
    (value: number) => setZoom(Math.min(520, Math.max(35, value))),
    [setZoom],
  )
  const cardMin = Math.round(110 + zoom * 2.15)

  useEffect(() => {
    setSelectedPageIds(new Set())
  }, [work?.id])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!work) return

      const target = event.target as HTMLElement | null
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA'
      if (isInput) return

      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        clampZoom(zoom + 20)
      }
      if (event.key === '-') {
        event.preventDefault()
        clampZoom(zoom - 20)
      }
      if (event.key === '0') {
        event.preventDefault()
        setZoom(100)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelectedPageIds(new Set(work.pages.map((page) => page.id)))
      }
      if (event.key === 'Escape') {
        setSelectedPageIds(new Set())
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clampZoom, work, zoom, setZoom])

  const handleWheelZoom = (event: WheelEvent<HTMLElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    clampZoom(zoom + (event.deltaY < 0 ? 16 : -16))
  }

  const selectPage = (event: MouseEvent, pageId: string) => {
    const multi = event.metaKey || event.ctrlKey || event.shiftKey
    setSelectedPageIds((current) => {
      if (!multi) return new Set([pageId])
      const next = new Set(current)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }

  const clearSelection = () => setSelectedPageIds(new Set())
  const selectAll = () => {
    if (work) setSelectedPageIds(new Set(work.pages.map((page) => page.id)))
  }

  const batchDownload = () => {
    selectedPages.forEach((page) => void exportPage(page))
  }

  const batchExportPdf = async () => {
    if (!work || selectedPages.length === 0) return
    const items = await Promise.all(
      selectedPages.map(async (page) => ({ title: page.title, blob: await getPageBlob(page) })),
    )
    await exportPagesAsPdf(items, `${work.title}.pdf`)
  }

  const batchExportPptx = async () => {
    if (!work || selectedPages.length === 0) return
    const items = await Promise.all(
      selectedPages.map(async (page) => ({ title: page.title, blob: await getPageBlob(page) })),
    )
    await exportPagesAsPptx(items, `${work.title}.pptx`)
  }

  const batchCopy = () => {
    if (selectedPages[0]) void copyPage(selectedPages[0])
  }

  const batchDelete = () => {
    if (!work) return
    selectedPages.forEach((page) => deletePage(work.id, page.id))
    clearSelection()
  }

  if (!work) {
    return (
      <section className="empty-state">
        <EmptyStateIllustration alt="暂无作品" />
        <strong>暂无作品</strong>
        <button className="ghost-button" onClick={goBack} type="button">
          返回作品库
        </button>
      </section>
    )
  }

  return (
    <section className="work-preview" onWheel={handleWheelZoom}>
      <header className="work-preview-bar">
        <div className="work-preview-title">
          <button className="ghost-button" onClick={goBack} type="button">
            返回
          </button>
          <div>
            <h2>{work.title}</h2>
            <span>{work.pages.length} 页 / {work.fileName}</span>
          </div>
        </div>

        <div className="work-preview-actions">
          <span className="selection-count">{selectedPageIds.size} 选中</span>
          <button className="icon-button" onClick={() => clampZoom(zoom - 10)} type="button" title="缩小全部页面">
            <ZoomOut size={16} />
          </button>
          <label className="zoom-slider">
            <input
              min="35"
              max="520"
              step="10"
              type="range"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <span>{zoom}%</span>
          </label>
          <button className="icon-button" onClick={() => clampZoom(zoom + 10)} type="button" title="放大全部页面">
            <ZoomIn size={16} />
          </button>
          <button className="ghost-button" onClick={() => setZoom(100)} type="button">
            100%
          </button>
          <button className="ghost-button" onClick={selectAll} type="button">
            全选
          </button>
          <button className="ghost-button" onClick={clearSelection} type="button">
            清除
          </button>
        </div>
      </header>

      <div className="batch-bar">
        <select value={batchTag} onChange={(event) => setBatchTag(event.target.value)}>
          {['重点参考', '封面', '图表页', '版式灵感', '可复用', '待整理'].map((tag) => (
            <option key={tag}>{tag}</option>
          ))}
        </select>
        <button className="ghost-button" disabled={selectedPageIds.size === 0} onClick={() => tagPages([...selectedPageIds], batchTag)} type="button">
          <Tags size={16} />
          打标签
        </button>
        <button className="ghost-button" disabled={selectedPageIds.size === 0} onClick={batchCopy} type="button">
          <Copy size={16} />
          复制
        </button>
        <button className="ghost-button" disabled={selectedPageIds.size === 0} onClick={batchDownload} type="button">
          <Download size={16} />
          下载
        </button>
        <button className="ghost-button" disabled={selectedPageIds.size === 0} onClick={() => void batchExportPdf()} type="button">
          <FileText size={16} />
          导出 PDF
        </button>
        <button className="ghost-button" disabled={selectedPageIds.size === 0} onClick={() => void batchExportPptx()} type="button">
          <Presentation size={16} />
          导出 PPT
        </button>
        <button className="ghost-button danger" disabled={selectedPageIds.size === 0} onClick={batchDelete} type="button">
          <Trash2 size={16} />
          删除页
        </button>
        <span className="shortcut-hint">Ctrl/Cmd + 滚轮 / + - 0 / Cmd+A</span>
        <button className="ghost-button danger" onClick={() => deleteWork(work.id)} type="button">
          <Trash2 size={16} />
          移入回收站
        </button>
      </div>

      <div className="work-tag-row">
        <span>作品标签</span>
        <input
          value={workTag}
          onChange={(event) => setWorkTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              tagWork(work.id, workTag)
              setWorkTag('')
            }
          }}
          placeholder="例如：发布会参考"
        />
        <button
          className="ghost-button"
          onClick={() => {
            tagWork(work.id, workTag)
            setWorkTag('')
          }}
          type="button"
        >
          <Tags size={15} />
          添加
        </button>
        <div className="work-tag-list">
          {(work.tags ?? []).map((tag) => (
            <button
              className="work-tag-chip"
              key={tag}
              onClick={() => untagWork(work.id, tag)}
              type="button"
              title="移除标签"
            >
              {tag} <X size={12} />
            </button>
          ))}
        </div>
      </div>

      <div className="work-page-grid" style={{ '--page-card-min': `${cardMin}px` } as CSSProperties & Record<'--page-card-min', string>}>
        {work.pages.map((page) => (
          <PageTile
            key={page.id}
            page={page}
            selected={selectedPageIds.has(page.id)}
            onSelect={(event) => selectPage(event, page.id)}
          />
        ))}
      </div>
    </section>
  )
}

function CollectionsView({
  collections,
  pages,
  works,
  tagTree,
  initialTagRequest,
  onReloadTags,
  onDeletePageTagIds,
  initialFolderId,
  viewerOpen = false,
  copyPage,
  exportPage,
  deletePage,
  tagPages,
  untagPages,
  ratePage,
  openViewer,
  onCollectionsChange,
  onImportToFolder,
  onBack,
}: {
  collections: Collection[]
  pages: GalleryPage[]
  works: Work[]
  tagTree: TagNode[]
  initialTagRequest?: { scope: 'page'; tagId: string; tagName: string } | null
  onReloadTags: () => void
  onDeletePageTagIds: (tagIds: string[]) => void
  initialFolderId?: string
  viewerOpen?: boolean
  copyPage: (page: GalleryPage) => Promise<void>
  exportPage: (page: GalleryPage) => Promise<void>
  deletePage: (workId: string, pageId: string) => void
  tagPages: (pageIds: string[], tag: string) => void
  untagPages: (pageIds: string[], tag: string) => void
  ratePage: (pageId: string, rating: number) => void
  openViewer: (page: GalleryPage, pages?: GalleryPage[]) => void
  onCollectionsChange: (next: Collection[]) => void
  onImportToFolder: (folderId: string) => void
  onBack: () => void
}) {
  const [selectedFolderId, setSelectedFolderId] = useState('all')
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set())
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set())
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderId?: string; folderName?: string; workId?: string; workName?: string; folderIds?: string[] } | null>(null)
  const [pageContextMenu, setPageContextMenu] = useState<{ x: number; y: number; page: GalleryPage } | null>(null)
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [gridZoom, setGridZoom] = useState(100)
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagMode, setTagMode] = useState<'AND' | 'OR'>('OR')
  const [untaggedOnly, setUntaggedOnly] = useState(false)
  const [selectedWorkTagIds, setSelectedWorkTagIds] = useState<string[]>([])
  const [tagSearch, setTagSearch] = useState('')
  const [tagOrder, setTagOrder] = useState<string[]>([])
  const [dragTagId, setDragTagId] = useState<string | null>(null)
  const [tagDragPreview, setTagDragPreview] = useState<{ name: string; x: number; y: number } | null>(null)
  const [tagDropTarget, setTagDropTarget] = useState<string | null>(null)
  const [collapsedTagGroups, setCollapsedTagGroups] = useState<Set<string>>(new Set())
  const tagDragRef = useRef<{ id: string; name: string; startX: number; startY: number; moved: boolean } | null>(null)
  const [tagMenu, setTagMenu] = useState<{ x: number; y: number; tag: TagNode } | null>(null)
  const [tagMoveOpen, setTagMoveOpen] = useState(false)
  const [tagPanelContextMenu, setTagPanelContextMenu] = useState<{ x: number; y: number } | null>(null)
  const tagPanelInitializedRef = useRef(false)
  const [tagRenameId, setTagRenameId] = useState<string | null>(null)
  const [tagRenameValue, setTagRenameValue] = useState('')
  const suppressTagClickRef = useRef(false)
  const lastSelectedTagIdRef = useRef<string | null>(null)
  const [tagPanelHeight, setTagPanelHeight] = useState(200)
  const [layout, setLayout] = useState('')
  const [rating, setRating] = useState(0)
  const [selectedHex, setSelectedHex] = useState<string | null>(null)
  const [selectedColorFamily, setSelectedColorFamily] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<'all' | 'neutral' | 'multi'>('all')
  const [colorTolerance, setColorTolerance] = useState(80)
  const [colorMinRatio, setColorMinRatio] = useState(0.15)
  const [sort] = useState('page-asc')
  const [pageRenderLimit, setPageRenderLimit] = useState(200)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [colorProfilesRequested, setColorProfilesRequested] = useState(false)
  useEffect(() => {
    if (initialTagRequest) {
      setSelectedFolderId('all')
      setSelectedWorkTagIds([initialTagRequest.tagId])
      setUntaggedOnly(false)
    }
  }, [initialTagRequest])
  const [dragPageIds, setDragPageIds] = useState<Set<string>>(new Set())
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragPreviewPage, setDragPreviewPage] = useState<GalleryPage | null>(null)
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 })
  const [droppedFolderId, setDroppedFolderId] = useState<string | null>(null)
  const [folderDragId, setFolderDragId] = useState<string | null>(null)
  const [folderDropTarget, setFolderDropTarget] = useState<{ id: string; position: 'before' | 'after' | 'inside' } | null>(null)
  const [folderDragPreview, setFolderDragPreview] = useState<{ name: string; x: number; y: number } | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const dragHitTestFrameRef = useRef<number | null>(null)
  const dropFlashTimerRef = useRef<number | null>(null)
  const dragPageIdsRef = useRef<Set<string>>(new Set())
  const pointerDragRef = useRef<{
    pointerId: number
    pageId: string
    startX: number
    startY: number
    moved: boolean
    target: HTMLElement | null
  } | null>(null)
  const suppressPageClickRef = useRef(false)
  const endPageDragRef = useRef<() => void>(() => {})
  const pendingFolderSelectRef = useRef<{ id: string; timer: number } | null>(null)
  const lastSelectedPageIdRef = useRef<string | null>(null)
  const lastSelectedFolderIdRef = useRef<string | null>(null)
  const folderDragIdsRef = useRef<Set<string>>(new Set())
  const folderPagesRef = useRef<HTMLElement>(null)
  const folderScrollAreaRef = useRef<HTMLDivElement>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const loadMorePendingRef = useRef(false)

  useEffect(() => {
    if (initialFolderId) {
      setSelectedFolderId(initialFolderId)
    }
  }, [initialFolderId])

  useEffect(() => {
    if (!contextMenu) return
    const close = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.context-menu')) return
      closeContextMenu()
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!tagMenu) return
    const onMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.context-menu')) return
      closeTagMenu()
    }
    const onKeyDown = () => closeTagMenu()
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [tagMenu])

  useEffect(() => {
    if (!tagPanelContextMenu) return
    const onMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.context-menu')) return
      closeTagPanelContextMenu()
    }
    const onKeyDown = () => closeTagPanelContextMenu()
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [tagPanelContextMenu])

  useEffect(() => {
    if (!pageContextMenu) return
    const close = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.context-menu')) return
      closePageContextMenu()
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closePageContextMenu()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [pageContextMenu])
  const clampGridZoom = useCallback(
    (value: number) => setGridZoom(Math.min(320, Math.max(35, value))),
    [],
  )
  const gridCardMin = Math.round(120 + gridZoom * 2.1)

  useEffect(() => {
    const element = folderPagesRef.current
    if (!element) return
    const onWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      clampGridZoom(gridZoom + (event.deltaY < 0 ? 14 : -14))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [clampGridZoom, gridZoom])
  const getFolderPageIds = useCallback(
    (folderId: string): Set<string> => {
      const folder = collections.find((collection) => collection.id === folderId)
      return new Set(folder?.pageIds ?? [])
    },
    [collections],
  )
  const isCustomFolderSelected = useMemo(
    () => Boolean(collections.find((collection) => collection.id === selectedFolderId)),
    [collections, selectedFolderId],
  )
  const removePagesFromCurrentFolder = useCallback(
    (pageIds: Set<string>) => {
      if (!isCustomFolderSelected || pageIds.size === 0) return
      onCollectionsChange(
        collections.map((collection) =>
          collection.id === selectedFolderId
            ? { ...collection, pageIds: collection.pageIds.filter((pageId) => !pageIds.has(pageId)) }
            : collection,
        ),
      )
      setSelectedPageIds(new Set())
    },
    [collections, isCustomFolderSelected, onCollectionsChange, selectedFolderId],
  )
  const selectedWorkFolder = selectedFolderId.startsWith('work:')
    ? works.find((work) => work.id === selectedFolderId.slice(5))
    : undefined
  const selectedWorkIndex = selectedWorkFolder ? works.findIndex((work) => work.id === selectedWorkFolder.id) : -1
  const previousWork = selectedWorkIndex > 0 ? works[selectedWorkIndex - 1] : undefined
  const nextWork = selectedWorkIndex >= 0 && selectedWorkIndex < works.length - 1 ? works[selectedWorkIndex + 1] : undefined
  const goToWork = (work: Work) => {
    setSelectedFolderId(`work:${work.id}`)
    setSelectedPageIds(new Set())
    setSearch('')
    setSelectedTags([])
    setSelectedWorkTagIds([])
    setUntaggedOnly(false)
    setSelectedFolderIds(new Set())
    lastSelectedFolderIdRef.current = null
  }
  const visiblePages =
    selectedFolderId === 'all'
      ? pages
      : selectedFolderId === 'untagged'
        ? pages.filter((page) => !(page.tags?.length ?? 0))
        : selectedWorkFolder
          ? selectedWorkFolder.pages
          : Array.from(getFolderPageIds(selectedFolderId))
              .map((pageId) => pages.find((page) => page.id === pageId))
              .filter((page): page is GalleryPage => Boolean(page))
  const pageTagOptions = useMemo(() => {
    const counts = new Map<string, number>()
    visiblePages.forEach((page) => (page.tags ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [visiblePages])

  const layoutOptions = useMemo(() => Array.from(new Set(visiblePages.map((page) => page.layout))).sort(), [visiblePages])
  const hasColorFilter = Boolean(selectedHex || selectedColorFamily || colorMode !== 'all')
  const colorSources = useMemo(
    () => (hasColorFilter || colorProfilesRequested)
      ? visiblePages.filter((page) => page.imageUrl).map((page) => ({ id: page.id, url: page.imageUrl }))
      : [],
    [colorProfilesRequested, hasColorFilter, visiblePages],
  )
  const pageProfileMap = useImageColorProfiles(colorSources)

  const tagNodeById = useMemo(() => {
    const map = new Map<string, TagNode>()
    const walk = (nodes: TagNode[]) => {
      nodes.forEach((node) => {
        map.set(node.id, node)
        walk(node.children)
      })
    }
    walk(tagTree)
    return map
  }, [tagTree])
  const selectedWorkTagNames = useMemo(
    () => selectedWorkTagIds.map((id) => tagNodeById.get(id)?.name).filter((name): name is string => Boolean(name)),
    [selectedWorkTagIds, tagNodeById],
  )

  const filteredPages = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const list = visiblePages.filter((page) => {
      const sourceWork = works.find((work) => work.pages.some((item) => item.id === page.id))
      const searchText = [
        page.title,
        page.layout,
        ...(page.tags ?? []),
        sourceWork?.title,
        sourceWork?.fileName,
        sourceWork?.kind,
      ]
        .join(' ')
        .toLowerCase()
      const matchesSearch = !keyword || searchText.includes(keyword)
      const matchesLayout = !layout || page.layout === layout
      const matchesRating = !rating || (page.rating ?? 0) >= rating
      const matchesTag =
        selectedWorkTagNames.length === 0 ||
        selectedWorkTagNames.some(
          (tag) => (page.tags ?? []).includes(tag),
        )
      const matchesUntagged = !untaggedOnly || (page.tags?.length ?? 0) === 0
      const profile = pageProfileMap[page.id]
      const matchesColor =
        selectedHex
          ? profileMatchesColor(profile, selectedHex, colorTolerance, colorMinRatio)
          : selectedColorFamily
            ? profileMatchesFamily(profile, selectedColorFamily, colorMinRatio)
            : colorMode === 'neutral'
              ? (profile?.neutralRatio ?? 0) >= colorMinRatio
              : colorMode === 'multi'
                ? profileMatchesMultiColor(profile, colorMinRatio)
                : true
      const matchesTags =
        selectedTags.length === 0 ||
        (tagMode === 'AND'
          ? selectedTags.every((tag) => (page.tags ?? []).includes(tag))
          : selectedTags.some((tag) => (page.tags ?? []).includes(tag)))
      return matchesSearch && matchesLayout && matchesColor && matchesTags && matchesRating && matchesTag && matchesUntagged
    })

    return list.sort((a, b) => {
      if (sort === 'page-desc') return b.pageNumber - a.pageNumber
      if (sort === 'source-asc') {
        const an = works.find((work) => work.pages.some((item) => item.id === a.id))?.title ?? ''
        const bn = works.find((work) => work.pages.some((item) => item.id === b.id))?.title ?? ''
        return an.localeCompare(bn)
      }
      return a.pageNumber - b.pageNumber
    })
  }, [colorMode, colorMinRatio, colorTolerance, layout, pageProfileMap, rating, search, selectedColorFamily, selectedHex, selectedTags, selectedWorkTagNames, sort, tagMode, untaggedOnly, visiblePages, works])
  const renderPages = filteredPages.slice(0, pageRenderLimit)

  useEffect(() => {
    setPageRenderLimit(150)
  }, [colorMode, layout, rating, search, selectedFolderId, selectedColorFamily, selectedHex, selectedTags, selectedWorkTagNames, untaggedOnly])

  useLayoutEffect(() => {
    if (folderScrollAreaRef.current) folderScrollAreaRef.current.scrollTop = 0
  }, [selectedFolderId])

  useEffect(() => {
    const scrollArea = folderScrollAreaRef.current
    const sentinel = loadMoreSentinelRef.current
    if (!scrollArea || !sentinel || filteredPages.length <= renderPages.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        if (loadMorePendingRef.current) return
        loadMorePendingRef.current = true
        setPageRenderLimit((current) => Math.min(filteredPages.length, current + 200))
        window.setTimeout(() => {
          loadMorePendingRef.current = false
        }, 250)
      },
      { root: scrollArea, rootMargin: '1000px 0px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [filteredPages.length, renderPages.length])

  const selectedPages = pages.filter((page) => selectedPageIds.has(page.id))
  const inspectedPage = selectedPageIds.size === 1 ? pages.find((page) => page.id === Array.from(selectedPageIds)[0]) : undefined
  const inspectedSource = inspectedPage ? works.find((work) => work.pages.some((item) => item.id === inspectedPage.id)) : undefined
  const exportSelectedPdf = async () => {
    if (selectedPages.length === 0) return
    const items = await Promise.all(
      selectedPages.map(async (page) => ({ title: page.title, blob: await getPageBlob(page) })),
    )
    await exportPagesAsPdf(items, `Normix-选中页面.pdf`)
  }
  const exportSelectedPptx = async () => {
    if (selectedPages.length === 0) return
    const items = await Promise.all(
      selectedPages.map(async (page) => ({ title: page.title, blob: await getPageBlob(page) })),
    )
    await exportPagesAsPptx(items, `Normix-选中页面.pptx`)
  }
  const exportSinglePdf = async (page: GalleryPage) => {
    await exportPagesAsPdf([{ title: page.title, blob: await getPageBlob(page) }], `${page.title}.pdf`)
  }
  const exportSinglePptx = async (page: GalleryPage) => {
    await exportPagesAsPptx([{ title: page.title, blob: await getPageBlob(page) }], `${page.title}.pptx`)
  }

  useEffect(() => {
    if (viewerOpen || !inspectedPage) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.repeat || event.code !== 'Space') return
      event.preventDefault()
      openViewer(inspectedPage, filteredPages)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filteredPages, inspectedPage, openViewer, viewerOpen])

  const hasFilters = Boolean(search || selectedTags.length > 0 || selectedWorkTagIds.length > 0 || untaggedOnly || layout || rating || hasColorFilter)
  const clearFilters = () => {
    setSearch('')
    setSelectedTags([])
    setLayout('')
    setRating(0)
    setSelectedHex(null)
    setSelectedColorFamily(null)
    setSelectedWorkTagIds([])
    setUntaggedOnly(false)
    setColorMode('all')
    setSelectedFolderId('all')
    setSelectedFolderIds(new Set())
    lastSelectedFolderIdRef.current = null
  }

  const toggleWorkTag = (node: TagNode, multi = false) => {
    setUntaggedOnly(false)
    setSelectedWorkTagIds((current) => {
      if (multi) return current.includes(node.id) ? current.filter((item) => item !== node.id) : [...current, node.id]
      return current.includes(node.id) ? [] : [node.id]
    })
    lastSelectedTagIdRef.current = node.id
  }

  const toggleTagGroup = (id: string) => {
    setCollapsedTagGroups((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getDescendantTagIds = (node: TagNode): string[] => [
    node.id,
    ...node.children.flatMap((child) => getDescendantTagIds(child)),
  ]

  const toggleGroupSelection = (node: TagNode, multi = false) => {
    const ids = getDescendantTagIds(node)
    const allSelected = ids.every((id) => selectedWorkTagIds.includes(id))
    setUntaggedOnly(false)
    setSelectedWorkTagIds((current) => {
      if (multi) {
        return allSelected
          ? current.filter((id) => !ids.includes(id))
          : Array.from(new Set([...current, ...ids]))
      }
      if (allSelected && current.length === ids.length) return []
      return Array.from(new Set(ids))
    })
  }

  const openTagPanelContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setTagPanelContextMenu({ x: event.clientX, y: event.clientY })
  }

  const closeTagPanelContextMenu = () => setTagPanelContextMenu(null)

  const createTagImmediately = async (name: string, group: string, parentId: string | null) => {
    const response = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, group, parentId, scope: 'page', color: '#18181b' }),
    })
    if (!response.ok) return
    const created = (await response.json()) as TagNode
    onReloadTags()
    setTagRenameId(created.id)
    setTagRenameValue(created.name)
  }

  const commitTagRename = async () => {
    if (!tagRenameId) return
    const name = tagRenameValue.trim()
    if (!name) {
      setTagRenameId(null)
      return
    }
    await fetch(`/api/tags/${tagRenameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setTagRenameId(null)
    onReloadTags()
  }

  const cancelTagRename = () => {
    setTagRenameId(null)
    setTagRenameValue('')
  }

  const openTagMenu = (event: MouseEvent<HTMLElement>, tag: TagNode) => {
    event.preventDefault()
    event.stopPropagation()
    setTagMoveOpen(false)
    setTagMenu({ x: event.clientX, y: event.clientY, tag })
  }

  const closeTagMenu = () => {
    setTagMenu(null)
    setTagMoveOpen(false)
  }

  const renameTagFromMenu = (tag: TagNode) => {
    setTagRenameId(tag.id)
    setTagRenameValue(tag.name)
    closeTagMenu()
  }

  const moveTagToTarget = async (tag: TagNode, parentId: string | null) => {
    await fetch(`/api/tags/${tag.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId }),
    })
    closeTagMenu()
    onReloadTags()
  }

  const deleteTagFromMenu = async (tag: TagNode) => {
    const idsToDelete =
      selectedWorkTagIds.includes(tag.id) && selectedWorkTagIds.length > 1
        ? selectedWorkTagIds
        : [tag.id]
    await Promise.all(idsToDelete.map((id) => fetch(`/api/tags/${id}`, { method: 'DELETE' })))
    setSelectedWorkTagIds((current) => current.filter((id) => !idsToDelete.includes(id)))
    onDeletePageTagIds(idsToDelete)
    closeTagMenu()
    onReloadTags()
  }

  const startTagPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = tagPanelHeight
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      setTagPanelHeight(Math.max(100, startHeight + startY - moveEvent.clientY))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const clearPageDragState = () => {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
    if (dragHitTestFrameRef.current !== null) {
      cancelAnimationFrame(dragHitTestFrameRef.current)
      dragHitTestFrameRef.current = null
    }
    dragPageIdsRef.current = new Set()
    setDragPageIds(new Set())
    setDragOverFolderId(null)
    setDragPreviewPage(null)
    setDragPosition({ x: 0, y: 0 })
  }

  const updatePageDragPosition = (x: number, y: number) => {
    if (dragFrameRef.current !== null) return
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null
      setDragPosition({ x, y })
    })
  }

  const updatePageDragTarget = (x: number, y: number) => {
    if (dragHitTestFrameRef.current !== null) return
    dragHitTestFrameRef.current = requestAnimationFrame(() => {
      dragHitTestFrameRef.current = null
      const target = document.elementFromPoint(x, y) as HTMLElement | null
      const folderId = target?.closest<HTMLElement>('.folder-row')?.getAttribute('data-folder-id') ?? null
      setDragOverFolderId((current) => (current === folderId ? current : folderId))
    })
  }

  const handleWindowPagePointerMove = (event: globalThis.PointerEvent) => {
    const pending = pointerDragRef.current
    if (!pending || event.pointerId !== pending.pointerId) return
    const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY)
    if (!pending.moved && distance < 3) return
    if (!pending.moved) {
      pending.moved = true
      suppressPageClickRef.current = true
      const ids = selectedPageIds.has(pending.pageId) ? new Set(selectedPageIds) : new Set([pending.pageId])
      dragPageIdsRef.current = ids
      setDragPageIds(ids)
      setDragPreviewPage(pages.find((page) => page.id === pending.pageId) ?? null)
      setDragPosition({ x: event.clientX, y: event.clientY })
      setDragOverFolderId(null)
      if (!selectedPageIds.has(pending.pageId)) setSelectedPageIds(ids)
    }
    event.preventDefault()
    updatePageDragPosition(event.clientX, event.clientY)
    updatePageDragTarget(event.clientX, event.clientY)
  }

  const finishPagePointerDrag = (event: globalThis.PointerEvent) => {
    const pending = pointerDragRef.current
    if (!pending || event.pointerId !== pending.pointerId) return
    removePageDragWindowListeners()
    pointerDragRef.current = null
    if (!pending.moved) return
    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    const folderId = target?.closest<HTMLElement>('.folder-row')?.getAttribute('data-folder-id') ?? null
    if (folderId) dropPagesIntoFolder(folderId)
    else endPageDrag()
  }

  const handleWindowPagePointerUp = (event: globalThis.PointerEvent) => {
    finishPagePointerDrag(event)
  }

  const handleWindowMouseUp = (event: globalThis.MouseEvent) => {
    const pending = pointerDragRef.current
    if (!pending) return
    finishPagePointerDrag({
      pointerId: pending.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    } as globalThis.PointerEvent)
  }

  const handleWindowPagePointerCancel = (event: globalThis.PointerEvent) => {
    const pending = pointerDragRef.current
    if (!pending || event.pointerId !== pending.pointerId) return
    endPageDrag()
  }

  const handleWindowPageBlur = () => {
    endPageDrag()
  }

  const handleWindowPageVisibilityChange = () => {
    if (document.hidden) endPageDrag()
  }

  const removePageDragWindowListeners = () => {
    const target = pointerDragRef.current?.target
    if (target) {
      target.removeEventListener('pointermove', handleWindowPagePointerMove)
      target.removeEventListener('pointerup', handleWindowPagePointerUp)
      target.removeEventListener('pointercancel', handleWindowPagePointerCancel)
    }
    window.removeEventListener('pointermove', handleWindowPagePointerMove)
    window.removeEventListener('pointerup', handleWindowPagePointerUp)
    window.removeEventListener('pointercancel', handleWindowPagePointerCancel)
    window.removeEventListener('mouseup', handleWindowMouseUp)
    window.removeEventListener('blur', handleWindowPageBlur)
    document.removeEventListener('visibilitychange', handleWindowPageVisibilityChange)
  }

  const startPagePointerDrag = (event: ReactPointerEvent<HTMLElement>, pageId: string) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    suppressPageClickRef.current = false
    pointerDragRef.current = {
      pointerId: event.pointerId,
      pageId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      target: event.currentTarget,
    }
    removePageDragWindowListeners()
    event.currentTarget.addEventListener('pointermove', handleWindowPagePointerMove)
    event.currentTarget.addEventListener('pointerup', handleWindowPagePointerUp)
    event.currentTarget.addEventListener('pointercancel', handleWindowPagePointerCancel)
    window.addEventListener('pointermove', handleWindowPagePointerMove)
    window.addEventListener('pointerup', handleWindowPagePointerUp)
    window.addEventListener('pointercancel', handleWindowPagePointerCancel)
    window.addEventListener('mouseup', handleWindowMouseUp)
    window.addEventListener('blur', handleWindowPageBlur)
    document.addEventListener('visibilitychange', handleWindowPageVisibilityChange)
  }

  const dropPagesIntoFolder = (collectionId: string) => {
    const ids = dragPageIdsRef.current
    if (ids.size === 0) return
    onCollectionsChange(
      collections.map((collection) =>
        collection.id === collectionId
          ? { ...collection, pageIds: Array.from(new Set([...collection.pageIds, ...ids])) }
          : collection,
      ),
    )
    setDroppedFolderId(collectionId)
    if (dropFlashTimerRef.current) window.clearTimeout(dropFlashTimerRef.current)
    dropFlashTimerRef.current = window.setTimeout(() => setDroppedFolderId(null), 900)
    removePageDragWindowListeners()
    clearPageDragState()
  }

  const endPageDrag = () => {
    removePageDragWindowListeners()
    pointerDragRef.current = null
    suppressPageClickRef.current = true
    clearPageDragState()
  }
  endPageDragRef.current = endPageDrag

  useEffect(() => {
    if (dragPageIds.size === 0) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') endPageDragRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dragPageIds.size])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        setInspectorOpen((open) => !open)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selectedPages.length > 0) {
        event.preventDefault()
        selectedPages.forEach((page) => void copyPage(page))
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedPages.length > 0) {
        event.preventDefault()
        if (isCustomFolderSelected) {
          removePagesFromCurrentFolder(new Set(selectedPageIds))
        } else {
          const sourceWork = selectedPages.length > 0
            ? works.find((work) => work.pages.some((item) => item.id === selectedPages[0].id))
            : undefined
          if (sourceWork) {
            selectedPages.forEach((page) => {
              deletePage(sourceWork.id, page.id)
            })
          }
        }
        setSelectedPageIds(new Set())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copyPage, deletePage, isCustomFolderSelected, removePagesFromCurrentFolder, selectedPageIds, selectedPages, works])

  useEffect(() => {
    setSelectedPageIds(new Set())
  }, [selectedFolderId])

  const toggleSelect = (event: MouseEvent, pageId: string) => {
    if (event.shiftKey && lastSelectedPageIdRef.current) {
      const start = filteredPages.findIndex((page) => page.id === lastSelectedPageIdRef.current)
      const end = filteredPages.findIndex((page) => page.id === pageId)
      if (start >= 0 && end >= 0) {
        const ids = new Set(selectedPageIds)
        const [from, to] = start < end ? [start, end] : [end, start]
        for (let index = from; index <= to; index += 1) ids.add(filteredPages[index].id)
        setSelectedPageIds(ids)
        lastSelectedPageIdRef.current = pageId
        setInspectorOpen(true)
        return
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedPageIds((current) => {
        const next = new Set(current)
        if (next.has(pageId)) next.delete(pageId)
        else next.add(pageId)
        return next
      })
      lastSelectedPageIdRef.current = pageId
      setInspectorOpen(true)
      return
    }
    setSelectedPageIds(new Set([pageId]))
    lastSelectedPageIdRef.current = pageId
    setInspectorOpen(true)
  }

  const cancelPendingFolderSelect = () => {
    if (pendingFolderSelectRef.current) {
      window.clearTimeout(pendingFolderSelectRef.current.timer)
      pendingFolderSelectRef.current = null
    }
  }

  useEffect(() => () => {
    cancelPendingFolderSelect()
    if (dropFlashTimerRef.current) window.clearTimeout(dropFlashTimerRef.current)
  }, [])

  const scheduleFolderSelect = (id: string) => {
    cancelPendingFolderSelect()
    pendingFolderSelectRef.current = {
      id,
      timer: window.setTimeout(() => {
        pendingFolderSelectRef.current = null
        setSelectedFolderId(id)
        setSelectedFolderIds(new Set([id]))
        lastSelectedFolderIdRef.current = id
      }, 90),
    }
  }

  const handleFolderItemMouseDown = (event: MouseEvent, rename: () => void) => {
    if (event.detail !== 2) return
    if (selectedFolderIds.size > 1) return
    cancelPendingFolderSelect()
    event.preventDefault()
    event.stopPropagation()
    rename()
  }

  const handleFolderItemClick = (event: MouseEvent, id: string, rename: () => void) => {
    if (event.detail === 2) {
      if (selectedFolderIds.size > 1) return
      cancelPendingFolderSelect()
      event.preventDefault()
      event.stopPropagation()
      rename()
      return
    }
    if (event.shiftKey && lastSelectedFolderIdRef.current) {
      const start = flatFolderList.findIndex((folder) => folder.id === lastSelectedFolderIdRef.current)
      const end = flatFolderList.findIndex((folder) => folder.id === id)
      if (start >= 0 && end >= 0) {
        const ids = new Set(selectedFolderIds)
        const [from, to] = start < end ? [start, end] : [end, start]
        for (let index = from; index <= to; index += 1) ids.add(flatFolderList[index].id)
        setSelectedFolderIds(ids)
        setSelectedFolderId(id)
        lastSelectedFolderIdRef.current = id
        return
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedFolderIds((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setSelectedFolderId(id)
      lastSelectedFolderIdRef.current = id
      return
    }
    scheduleFolderSelect(id)
  }

  const createFolderWithRename = (parentId = '') => {
    cancelPendingFolderSelect()
    const name = '新文件夹'
    const collection: Collection = {
      id: `c-${Date.now()}`,
      name,
      description: '',
      pageIds: [],
      owner: '当前用户',
      parentId: parentId || undefined,
      order: collections.filter((collection) => collection.parentId === (parentId || undefined)).length,
    }
    onCollectionsChange([...collections, collection])
    setSelectedFolderId(collection.id)
    setSelectedFolderIds(new Set([collection.id]))
    lastSelectedFolderIdRef.current = collection.id
    setRenameFolderId(collection.id)
    setRenameName(name)
  }

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const deleteFolder = (folderId: string) => {
    applyFolderDeletion([folderId])
  }

  const applyFolderDeletion = (folderIds: string[]) => {
    const deletedIds = new Set(folderIds)
    const folderById = new Map(collections.map((collection) => [collection.id, collection]))
    const next = collections
      .filter((collection) => !deletedIds.has(collection.id))
      .map((collection) => {
        if (!collection.parentId || !deletedIds.has(collection.parentId)) return collection
        return { ...collection, parentId: folderById.get(collection.parentId)?.parentId }
      })
    onCollectionsChange(next)
    setSelectedFolderIds(new Set())
    lastSelectedFolderIdRef.current = null
    if (deletedIds.has(selectedFolderId)) setSelectedFolderId('all')
  }

  const deleteFolders = (folderIds: string[]) => {
    applyFolderDeletion(folderIds)
  }

  const closeContextMenu = () => setContextMenu(null)

  const openPageContextMenu = (event: MouseEvent<HTMLElement>, page: GalleryPage) => {
    event.preventDefault()
    if (event.ctrlKey) return
    setPageContextMenu({ x: event.clientX, y: event.clientY, page })
  }

  const closePageContextMenu = () => setPageContextMenu(null)

  const openContextMenu = (event: MouseEvent<HTMLElement>, folder?: Collection) => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) return
    const multiFolderIds =
      folder && selectedFolderIds.size > 1 && selectedFolderIds.has(folder.id)
        ? Array.from(selectedFolderIds)
        : undefined
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      folderId: folder?.id,
      folderName: folder?.name,
      folderIds: multiFolderIds,
    })
  }

  const renameFolder = (folderId: string, name: string) => {
    onCollectionsChange(
      collections.map((collection) =>
        collection.id === folderId ? { ...collection, name } : collection,
      ),
    )
  }

  const startRename = (folder: Collection) => {
    setRenameFolderId(folder.id)
    setRenameName(folder.name)
    closeContextMenu()
  }

  const commitRename = () => {
    if (renameFolderId && renameName.trim()) renameFolder(renameFolderId, renameName.trim())
    setRenameFolderId(null)
    setRenameName('')
  }

  const collectionOrderIndex = useMemo(
    () => new Map(collections.map((collection, index) => [collection.id, index])),
    [collections],
  )
  const compareCollections = useCallback(
    (a: Collection, b: Collection) =>
      (a.order ?? collectionOrderIndex.get(a.id) ?? 0) - (b.order ?? collectionOrderIndex.get(b.id) ?? 0) ||
      a.name.localeCompare(b.name, 'zh-CN'),
    [collectionOrderIndex],
  )

  const normalizeParentOrder = (list: Collection[], parentId: string | undefined) => {
    const siblings = list
      .filter((collection) => collection.parentId === parentId)
      .sort(compareCollections)
    return list.map((collection) =>
      collection.parentId === parentId
        ? { ...collection, order: siblings.findIndex((item) => item.id === collection.id) }
        : collection,
    )
  }

  const isFolderDescendant = (folderId: string, ancestorId: string): boolean => {
    const parent = collections.find((collection) => collection.id === folderId)?.parentId
    if (!parent) return false
    if (parent === ancestorId) return true
    return isFolderDescendant(parent, ancestorId)
  }

  const moveFolders = (dragIds: Set<string>, targetId: string, position: 'before' | 'after' | 'inside') => {
    if (dragIds.has(targetId)) return
    const target = collections.find((collection) => collection.id === targetId)
    if (!target) return
    const selected = Array.from(dragIds)
    const topLevel = selected.filter(
      (id) => !selected.some((other) => other !== id && isFolderDescendant(id, other)),
    )
    if (topLevel.length === 0) return

    if (position === 'inside') {
      if (topLevel.some((id) => isFolderDescendant(targetId, id))) return
      let next = collections.map((collection) =>
        topLevel.includes(collection.id) ? { ...collection, parentId: targetId, order: 0 } : collection,
      )
      topLevel.forEach((id) => {
        const oldParentId = collections.find((collection) => collection.id === id)?.parentId
        next = normalizeParentOrder(next, oldParentId)
      })
      next = normalizeParentOrder(next, targetId)
      onCollectionsChange(next)
      return
    }

    const nextParentId = target.parentId
    const next = collections.map((collection) =>
      topLevel.includes(collection.id) ? { ...collection, parentId: nextParentId, order: 0 } : collection,
    )
    const siblings = next.filter((collection) => collection.parentId === nextParentId).sort(compareCollections)
    const moving = siblings.filter((collection) => topLevel.includes(collection.id))
    const stationary = siblings.filter((collection) => !topLevel.includes(collection.id))
    const targetIndex = stationary.findIndex((collection) => collection.id === targetId)
    if (targetIndex < 0) return
    stationary.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, ...moving)
    const orderedIds = stationary.map((collection) => collection.id)
    let result = next.map((collection) =>
      collection.parentId === nextParentId
        ? { ...collection, order: orderedIds.indexOf(collection.id) }
        : collection,
    )
    topLevel.forEach((id) => {
      const oldParentId = collections.find((collection) => collection.id === id)?.parentId
      if (oldParentId !== nextParentId) result = normalizeParentOrder(result, oldParentId)
    })
    onCollectionsChange(result)
  }

  const moveFolderByOffset = (folderId: string, offset: number) => {
    const folder = collections.find((collection) => collection.id === folderId)
    if (!folder) return
    const siblings = collections
      .filter((collection) => collection.parentId === folder.parentId)
      .sort(compareCollections)
    const index = siblings.findIndex((collection) => collection.id === folderId)
    const target = siblings[index + offset]
    if (index < 0 || !target) return
    const reordered = [...siblings]
    const [dragged] = reordered.splice(index, 1)
    reordered.splice(index + offset, 0, dragged)
    const orderedIds = reordered.map((collection) => collection.id)
    onCollectionsChange(
      collections.map((collection) =>
        collection.parentId === folder.parentId
          ? { ...collection, order: orderedIds.indexOf(collection.id) }
          : collection,
      ),
    )
  }

  const startFolderDrag = (event: ReactDragEvent<HTMLButtonElement>, folder: Collection) => {
    event.dataTransfer?.setData('text/plain', folder.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    folderDragIdsRef.current =
      selectedFolderIds.size > 1 && selectedFolderIds.has(folder.id) ? new Set(selectedFolderIds) : new Set([folder.id])
    setFolderDragId(folder.id)
    setFolderDragPreview({
      name: folder.name,
      x: event.clientX,
      y: event.clientY,
    })
    const hideImage = new Image()
    hideImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    event.dataTransfer?.setDragImage(hideImage, 0, 0)
  }

  const handleFolderDragOver = (event: ReactDragEvent<HTMLDivElement>, folder: Collection) => {
    if (!folderDragId) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - rect.top) / rect.height
    const position = ratio < 0.32 ? 'before' : ratio > 0.68 ? 'after' : 'inside'
    setFolderDropTarget((current) => (current?.id === folder.id && current.position === position ? current : { id: folder.id, position }))
  }

  const endFolderDrag = () => {
    folderDragIdsRef.current = new Set()
    setFolderDragId(null)
    setFolderDropTarget(null)
    setFolderDragPreview(null)
  }

  const rootCollections = useMemo(
    () => collections.filter((collection) => !collection.parentId).sort(compareCollections),
    [collections, compareCollections],
  )
  const childFolders = useMemo(
    () =>
      (selectedFolderId === 'all'
        ? rootCollections
        : collections.filter((collection) => collection.parentId === selectedFolderId)
      ).sort(compareCollections),
    [collections, compareCollections, rootCollections, selectedFolderId],
  )
  const flatFolderList = useMemo(() => {
    const result: Collection[] = []
    const walk = (items: Collection[]) => {
      items.forEach((item) => {
        result.push(item)
        walk(collections.filter((collection) => collection.parentId === item.id).sort(compareCollections))
      })
    }
    walk(rootCollections)
    return result
  }, [collections, compareCollections, rootCollections])
  const mergedTagTree = useMemo(() => filterTagTreeByScope(tagTree, 'page'), [tagTree])
  const tagPanelGroups = useMemo(() => {
    const result: TagNode[] = []
    mergedTagTree.forEach((tag) => {
      if (tag.parent_id) return
      const isGroup = tag.name === tag.group || tag.children.length > 0
      if ((tag.page_count ?? 0) === 0 && !isGroup) return
      result.push(tag)
    })
    return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [mergedTagTree])

  useEffect(() => {
    if (tagPanelInitializedRef.current) return
    if (tagPanelGroups.length === 0) return
    setCollapsedTagGroups(new Set(tagPanelGroups.filter((group) => group.children.length).map((group) => group.id)))
    tagPanelInitializedRef.current = true
  }, [tagPanelGroups])
  const workTagsFlat = useMemo(() => {
    const result: TagNode[] = []
    const walk = (nodes: TagNode[]) => {
      nodes.forEach((node) => {
        if (node.children.length) walk(node.children)
        else result.push(node)
      })
    }
    walk(
      mergedTagTree.filter(
        (tag) => tag.group === '页面' || (tag.page_count ?? 0) > 0 || tag.name === tag.group,
      ),
    )
    return result.sort((a, b) => (b.work_count ?? 0) - (a.work_count ?? 0) || a.name.localeCompare(b.name, 'zh-CN'))
  }, [mergedTagTree])

  const toggleWorkTagRange = (node: TagNode) => {
    setUntaggedOnly(false)
    const currentIndex = workTagsFlat.findIndex((tag) => tag.id === node.id)
    if (currentIndex < 0) return
    const lastIndex = lastSelectedTagIdRef.current
      ? workTagsFlat.findIndex((tag) => tag.id === lastSelectedTagIdRef.current)
      : currentIndex
    const start = lastIndex < 0 ? currentIndex : Math.min(currentIndex, lastIndex)
    const end = lastIndex < 0 ? currentIndex : Math.max(currentIndex, lastIndex)
    const ids = workTagsFlat.slice(start, end + 1).map((tag) => tag.id)
    setSelectedWorkTagIds((current) => Array.from(new Set([...current, ...ids])))
    lastSelectedTagIdRef.current = node.id
  }

  useEffect(() => {
    setTagOrder((current) => {
      const next = workTagsFlat.map((tag) => tag.id)
      if (current.length === next.length && current.every((id, index) => id === next[index])) return current
      return next
    })
  }, [workTagsFlat])

  const reorderTag = async (sourceId: string, targetId: string) => {
    const next = [...tagOrder]
    const from = next.indexOf(sourceId)
    const to = next.indexOf(targetId)
    if (from < 0 || to < 0) return
    next.splice(from, 1)
    next.splice(to, 0, sourceId)
    setTagOrder(next)
    const items = next.map((id, index) => ({
      id,
      parentId: workTagsFlat.find((tag) => tag.id === id)?.parent_id ?? null,
      sortOrder: index,
    }))
    await fetch('/api/tags/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, scope: 'page' }),
    })
    onReloadTags()
  }

  const moveTagToGroup = async (sourceId: string, groupId: string) => {
    let targetId = groupId
    if (groupId.startsWith('group:')) {
      const groupName = groupId.slice('group:'.length)
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName, group: groupName, scope: 'page', color: '#18181b' }),
      })
      if (!response.ok) return
      const created = (await response.json()) as TagNode
      targetId = created.id
    }
    await fetch(`/api/tags/${sourceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: targetId }),
    })
    onReloadTags()
  }

  const cleanupTagDrag = () => {
    tagDragRef.current = null
    setDragTagId(null)
    setTagDragPreview(null)
    setTagDropTarget(null)
    window.removeEventListener('pointermove', handleTagPointerMove)
    window.removeEventListener('pointerup', finishTagPointerDrag)
    window.removeEventListener('pointercancel', cancelTagPointerDrag)
  }

  const startTagPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, tag: TagNode) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    tagDragRef.current = {
      id: tag.id,
      name: tag.name,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    window.addEventListener('pointermove', handleTagPointerMove)
    window.addEventListener('pointerup', finishTagPointerDrag)
    window.addEventListener('pointercancel', cancelTagPointerDrag)
  }

  const handleTagPointerMove = (event: globalThis.PointerEvent) => {
    const drag = tagDragRef.current
    if (!drag) return
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
    if (!drag.moved && distance < 6) return
    if (!drag.moved) {
      drag.moved = true
      setDragTagId(drag.id)
    }
    setTagDragPreview({ name: drag.name, x: event.clientX, y: event.clientY })
    const leaf = (event.target as HTMLElement | null)?.closest?.('.folder-item')?.getAttribute('data-tag-id') ?? null
    const group = (event.target as HTMLElement | null)?.closest?.('.folder-row[data-group-id]')?.getAttribute('data-group-id') ?? null
    setTagDropTarget(group ? `group:${group}` : leaf)
  }

  const finishTagPointerDrag = (event: globalThis.PointerEvent) => {
    const drag = tagDragRef.current
    if (!drag) return
    const leaf = (event.target as HTMLElement | null)?.closest?.('.folder-item')?.getAttribute('data-tag-id') ?? null
    const group = (event.target as HTMLElement | null)?.closest?.('.folder-row[data-group-id]')?.getAttribute('data-group-id') ?? null
    if (drag.moved && group) void moveTagToGroup(drag.id, group)
    else if (drag.moved && leaf && leaf !== drag.id) void reorderTag(drag.id, leaf)
    cleanupTagDrag()
  }

  const cancelTagPointerDrag = () => {
    cleanupTagDrag()
  }

  const getTagTotalCount = (node: TagNode): number =>
    (node.page_count ?? 0) +
    node.children.reduce((sum, child) => sum + getTagTotalCount(child), 0)

  const renderTagTreeItem = (node: TagNode, depth = 0): ReactElement => {
    const keyword = tagSearch.trim().toLowerCase()
    const hasSearch = Boolean(keyword)
    if (node.children.length > 0 || node.name === node.group) {
      const visibleChildren = node.children.filter((child) => !hasSearch || child.name.toLowerCase().includes(keyword))
      if (hasSearch && visibleChildren.length === 0) return <></>
      const collapsed = collapsedTagGroups.has(node.id)
      const children = [...visibleChildren].sort(
        (a, b) => tagOrder.indexOf(a.id) - tagOrder.indexOf(b.id),
      )
      const descendantIds = getDescendantTagIds(node)
      const groupSelected = descendantIds.every((id) => selectedWorkTagIds.includes(id))
      return (
        <div className="tag-tree-branch" key={node.id}>
          <div
            className={[
              'folder-row',
              groupSelected ? 'active' : '',
              tagDropTarget === `group:${node.id}` ? 'folder-drop-inside' : '',
            ].filter(Boolean).join(' ')}
            data-group-id={node.id}
            data-depth={depth}
            style={{ '--tree-line-left': `${10 + depth * 24}px` } as CSSProperties & Record<'--tree-line-left', string>}
          >
            <button
              className="folder-toggle"
              onClick={() => toggleTagGroup(node.id)}
              type="button"
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              className="folder-item tag-group-item"
              onClick={(event) => toggleGroupSelection(node, event.ctrlKey || event.metaKey)}
              onDoubleClick={() => renameTagFromMenu(node)}
              onContextMenu={(event) => {
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault()
                  return
                }
                openTagMenu(event, node)
              }}
              style={{ paddingLeft: 10 + depth * 24 }}
              type="button"
            >
              <FolderKanban size={14} />
              {tagRenameId === node.id ? (
                <input
                  autoFocus
                  className="folder-rename-input"
                  value={tagRenameValue}
                  onChange={(event) => setTagRenameValue(event.target.value)}
                  onBlur={() => void commitTagRename()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commitTagRename()
                    if (event.key === 'Escape') cancelTagRename()
                  }}
                />
              ) : (
                <span>{node.name}</span>
              )}
              {getTagTotalCount(node) > 0 && <b>{getTagTotalCount(node)}</b>}
            </button>
          </div>
          {!collapsed && (
            <div className="tag-tree-children">
              {children.map((child) => renderTagTreeItem(child, depth + 1))}
            </div>
          )}
        </div>
      )
    }

    if (hasSearch && !node.name.toLowerCase().includes(keyword)) return <></>
    if (tagRenameId === node.id) {
      return (
        <div
          className="folder-row"
          data-depth={depth}
          key={node.id}
          style={{ '--tree-line-left': `${10 + depth * 24}px` } as CSSProperties & Record<'--tree-line-left', string>}
        >
          <span className="folder-toggle-placeholder" />
          <button className="folder-item tag-leaf-item" style={{ paddingLeft: 10 + depth * 24 }} type="button">
            <Tags size={14} />
            <input
              autoFocus
              className="folder-rename-input"
              value={tagRenameValue}
              onChange={(event) => setTagRenameValue(event.target.value)}
              onBlur={() => void commitTagRename()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void commitTagRename()
                if (event.key === 'Escape') cancelTagRename()
              }}
            />
            {((node.page_count ?? 0)) > 0 && (
              <b>{node.page_count ?? 0}</b>
            )}
          </button>
        </div>
      )
    }
    return (
      <div
        className={[
          'folder-row',
          selectedWorkTagIds.includes(node.id) ? 'active' : '',
          dragTagId === node.id ? 'dragging' : '',
          tagDropTarget === node.id ? 'drop-target' : '',
        ].filter(Boolean).join(' ')}
        data-depth={depth}
        key={node.id}
        style={{ '--tree-line-left': `${10 + depth * 24}px` } as CSSProperties & Record<'--tree-line-left', string>}
      >
        <span className="folder-toggle-placeholder" />
        <button
          className="folder-item tag-leaf-item"
          data-tag-id={node.id}
          onClick={(event) => {
            if (suppressTagClickRef.current) {
              suppressTagClickRef.current = false
              return
            }
            if (event.shiftKey) toggleWorkTagRange(node)
            else toggleWorkTag(node, event.ctrlKey || event.metaKey)
          }}
          onDoubleClick={() => renameTagFromMenu(node)}
          onContextMenu={(event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault()
              return
            }
            openTagMenu(event, node)
          }}
          onPointerUp={() => {
            if (suppressTagClickRef.current) {
              window.setTimeout(() => {
                suppressTagClickRef.current = false
              }, 0)
            }
          }}
          onPointerDown={(event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault()
              suppressTagClickRef.current = true
              toggleWorkTag(node, true)
              return
            }
            startTagPointerDrag(event, node)
          }}
          style={{ paddingLeft: 10 + depth * 24 }}
          type="button"
        >
          <Tags size={14} style={{ color: tagColorStyle(node.name).color }} />
          <span>{node.name}</span>
          {(node.page_count ?? 0) > 0 && (
            <b style={{ color: tagColorStyle(node.name).color }}>{node.page_count ?? 0}</b>
          )}
        </button>
      </div>
    )
  }

  const renderTagGroupChoices = (node: TagNode, depth = 0): Array<ReactElement> => {
    const children = node.children.filter((child) => child.children.length > 0 || child.name === child.group)
    return [
      <button
        key={`${node.id}-move-target`}
        onClick={() => void moveTagToTarget(tagMenu?.tag as TagNode, node.id)}
        style={{ paddingLeft: 8 + depth * 14 }}
        type="button"
      >
        {node.name}
      </button>,
      ...children.flatMap((child) => renderTagGroupChoices(child, depth + 1)),
    ]
  }
  const renderCustomFolder = (folder: Collection, depth = 0): Array<ReactElement> => {
    const children = collections.filter((collection) => collection.parentId === folder.id).sort(compareCollections)
    const collapsed = collapsedFolderIds.has(folder.id)
    return [
      <div
        className={[
          selectedFolderId === folder.id ? 'folder-row active' : 'folder-row',
          dragOverFolderId === folder.id ? 'drop-target' : '',
          folderDropTarget?.id === folder.id ? `folder-drop-${folderDropTarget.position}` : '',
          selectedFolderIds.has(folder.id) ? 'folder-selected' : '',
          droppedFolderId === folder.id ? 'drop-flash' : '',
        ].filter(Boolean).join(' ')}
        key={`${folder.id}-row`}
        data-folder-id={folder.id}
        onContextMenu={(event) => openContextMenu(event, folder)}
        onDragOver={(event) => handleFolderDragOver(event, folder)}
        onDrop={(event) => {
          event.preventDefault()
          const draggedId = event.dataTransfer.getData('text/plain') || folderDragId || ''
          if (folderDropTarget && draggedId) {
            const ids = folderDragIdsRef.current.size > 0 ? folderDragIdsRef.current : new Set([draggedId])
            moveFolders(ids, folderDropTarget.id, folderDropTarget.position)
          }
          endFolderDrag()
        }}
        data-depth={depth}
        style={{ '--tree-line-left': `${10 + depth * 24}px` } as CSSProperties & Record<'--tree-line-left', string>}
      >
        {droppedFolderId === folder.id && <span className="folder-drop-burst" aria-hidden="true" />}
        {children.length > 0 ? (
          <button
            className="folder-toggle"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              toggleFolderCollapsed(folder.id)
            }}
            type="button"
            title={collapsed ? '展开' : '收起'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : (
          <span className="folder-toggle-placeholder" />
        )}
        <button
          className="folder-item"
          draggable
          onMouseDown={(event) => handleFolderItemMouseDown(event, () => startRename(folder))}
          onClick={(event) => handleFolderItemClick(event, folder.id, () => startRename(folder))}
          onDragStart={(event) => startFolderDrag(event, folder)}
          onDragEnd={endFolderDrag}
          style={{ paddingLeft: 10 + depth * 24 }}
          type="button"
        >
          <FolderKanban size={14} />
          {renameFolderId === folder.id ? (
            <input
              className="folder-rename-input"
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              onBlur={commitRename}
              onFocus={(event) => {
                const input = event.currentTarget
                requestAnimationFrame(() => {
                  const end = input.value.length
                  input.setSelectionRange(end, end)
                })
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename()
                if (event.key === 'Escape') {
                  setRenameFolderId(null)
                  setRenameName('')
                }
              }}
              autoFocus
            />
          ) : (
            <span>{folder.name}</span>
          )}
          <b>{getFolderPageIds(folder.id).size}</b>
        </button>
      </div>,
      ...(collapsed ? [] : children.flatMap((child) => renderCustomFolder(child, depth + 1))),
    ]
  }

  return (
    <section className={inspectorOpen ? 'inspiration-layout organization-left with-inspector' : 'inspiration-layout organization-left'}>
      <aside
        className="folder-pane"
        onMouseDown={(event) => {
          const target = event.target as HTMLElement
          if (
            target.closest('.folder-row') ||
            target.closest('.folder-pane-head') ||
            target.closest('.context-menu')
          ) {
            return
          }
          setSelectedFolderIds(new Set())
          lastSelectedFolderIdRef.current = null
        }}
        onContextMenu={(event) => {
          if (!(event.target as HTMLElement).closest('.folder-row')) openContextMenu(event)
        }}
      >
        <div className="folder-pane-main">
        <div className="folder-pane-fixed">
        <button
          className={selectedFolderId === 'all' ? 'folder-item active' : 'folder-item'}
          onClick={() => {
            cancelPendingFolderSelect()
            setSelectedFolderId('all')
            setSelectedFolderIds(new Set())
            lastSelectedFolderIdRef.current = null
          }}
          type="button"
        >
          <ImageIcon size={16} />
          <span>全部</span>
          <b>{pages.length}</b>
        </button>
        </div>
        <div className="folder-pane-scroll">
        {rootCollections.map((folder) => renderCustomFolder(folder))}
        </div>
        {contextMenu && (
          <>
            <button
              aria-label="关闭文件夹菜单"
              className="context-menu-backdrop"
              onClick={closeContextMenu}
              onContextMenu={(event) => {
                event.preventDefault()
                closeContextMenu()
              }}
              type="button"
            />
            <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
              {contextMenu.folderIds && contextMenu.folderIds.length > 1 ? (
                <button
                  className="danger"
                  onClick={() => {
                    deleteFolders(contextMenu.folderIds as string[])
                    closeContextMenu()
                  }}
                  type="button"
                >
                  删除 {contextMenu.folderIds.length} 个文件夹
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      createFolderWithRename('')
                      closeContextMenu()
                    }}
                    type="button"
                  >
                    新建文件夹
                  </button>
                  {contextMenu.folderId && (
                    <button
                      onClick={() => {
                        createFolderWithRename(contextMenu.folderId)
                        closeContextMenu()
                      }}
                      type="button"
                    >
                     新建子文件夹
                    </button>
                  )}
                  {contextMenu.folderId && (
                    <button
                      onClick={() => {
                        onImportToFolder(contextMenu.folderId as string)
                        closeContextMenu()
                      }}
                      type="button"
                    >
                      导入作品到当前文件夹
                    </button>
                  )}
                  {contextMenu.folderId && (
                    <button
                      onClick={() => {
                        const folder = collections.find((collection) => collection.id === contextMenu.folderId)
                        if (folder) startRename(folder)
                      }}
                      type="button"
                    >
                      重命名
                    </button>
                  )}
                  {contextMenu.folderId && (
                    <button
                      onClick={() => {
                        moveFolderByOffset(contextMenu.folderId as string, -1)
                        closeContextMenu()
                      }}
                      type="button"
                    >
                      上移
                    </button>
                  )}
                  {contextMenu.folderId && (
                    <button
                      onClick={() => {
                        moveFolderByOffset(contextMenu.folderId as string, 1)
                        closeContextMenu()
                      }}
                      type="button"
                    >
                      下移
                    </button>
                  )}
                  {contextMenu.folderId && (
                    <button
                      className="danger"
                      onClick={() => {
                        deleteFolder(contextMenu.folderId as string)
                        closeContextMenu()
                      }}
                      type="button"
                    >
                      删除
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
        </div>
        <div
          className="tag-pane-resizer"
          onPointerDown={startTagPanelResize}
          title="拖动调整标签区高度"
        />
        <div
          className="tag-panel-section"
          onContextMenu={openTagPanelContextMenu}
          style={{ height: `${tagPanelHeight}px` }}
        >
          <div className="tag-panel-head">
            <span>标签</span>
            <input
              className="tag-panel-search"
              value={tagSearch}
              onChange={(event) => setTagSearch(event.target.value)}
              placeholder="搜索标签"
            />
          </div>

          <div className="tag-panel-list">
            <div className="folder-row tag-untagged-row">
              <span className="folder-toggle-placeholder" />
              <button
                className={untaggedOnly ? 'folder-item active' : 'folder-item'}
                onClick={() => {
                  setSelectedWorkTagIds([])
                  setUntaggedOnly((open) => !open)
                }}
                type="button"
              >
                <Tag size={14} />
                <span>未标签</span>
                <b>{pages.filter((page) => !(page.tags?.length ?? 0)).length}</b>
              </button>
            </div>
            {tagPanelGroups.map((root) => renderTagTreeItem(root))}
          </div>
        </div>

        {tagMenu && (
          <>
            <button
              aria-label="关闭标签菜单"
              className="context-menu-backdrop"
              onClick={closeTagMenu}
              type="button"
            />
            <div className="context-menu tag-context-menu" style={{ left: tagMenu.x, top: tagMenu.y }}>
              {tagMoveOpen ? (
                <>
                  <div className="context-menu-title">移动到</div>
                  <button onClick={() => void moveTagToTarget(tagMenu.tag, null)} type="button">
                    顶层
                  </button>
                  {tagPanelGroups
                    .filter((group) => group.id !== tagMenu.tag.id)
                    .flatMap((group) => renderTagGroupChoices(group))}
                </>
              ) : (
                <>
                  <button onClick={() => renameTagFromMenu(tagMenu.tag)} type="button">
                    重命名
                  </button>
                  {(tagMenu.tag.children.length > 0 || tagMenu.tag.name === tagMenu.tag.group) && (
                    <button
                      onClick={() => {
                        void createTagImmediately('新分组', '新分组', tagMenu.tag.id)
                        closeTagMenu()
                      }}
                      type="button"
                    >
                      新建子分组
                    </button>
                  )}
                  <button onClick={() => setTagMoveOpen(true)} type="button">
                    移动分组
                  </button>
                  <button className="danger" onClick={() => void deleteTagFromMenu(tagMenu.tag)} type="button">
                    删除
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {tagPanelContextMenu && (
          <>
            <button
              aria-label="关闭标签区域菜单"
              className="context-menu-backdrop"
              onClick={closeTagPanelContextMenu}
              type="button"
            />
            <div className="context-menu tag-context-menu" style={{ left: tagPanelContextMenu.x, top: tagPanelContextMenu.y }}>
              <button
                onClick={() => {
                  void createTagImmediately('新分组', '新分组', null)
                  closeTagPanelContextMenu()
                }}
                type="button"
              >
                新建分组
              </button>
            </div>
          </>
        )}
      </aside>

      {pageContextMenu && (
        <>
          <button
            aria-label="关闭图片菜单"
            className="context-menu-backdrop"
            onClick={closePageContextMenu}
            onContextMenu={(event) => {
              event.preventDefault()
              closePageContextMenu()
            }}
            type="button"
          />
          <div className="context-menu page-context-menu" style={{ left: pageContextMenu.x, top: pageContextMenu.y }}>
            {selectedPageIds.size > 1 && selectedPageIds.has(pageContextMenu.page.id) ? (
              <>
                <div className="context-menu-title">导出选中页面</div>
                <button
                  onClick={() => {
                    void exportSelectedPdf()
                    closePageContextMenu()
                  }}
                  type="button"
                >
                  导出 PDF
                </button>
                <button
                  onClick={() => {
                    void exportSelectedPptx()
                    closePageContextMenu()
                  }}
                  type="button"
                >
                  导出 PPT
                </button>
                <div className="context-menu-title">删除选中页面</div>
                <button
                  className="danger"
                  onClick={() => {
                    if (isCustomFolderSelected) {
                      removePagesFromCurrentFolder(new Set(selectedPageIds))
                    } else {
                      selectedPageIds.forEach((pageId) => {
                        const sourceWork = works.find((work) => work.pages.some((item) => item.id === pageId))
                        if (sourceWork) deletePage(sourceWork.id, pageId)
                      })
                    }
                    setSelectedPageIds(new Set())
                    closePageContextMenu()
                  }}
                  type="button"
                >
                  删除 {selectedPageIds.size} 个页面
                </button>
              </>
            ) : (
              <>
                <div className="context-menu-title">页面操作</div>
                <button
                  onClick={() => {
                    void copyPage(pageContextMenu.page)
                    closePageContextMenu()
                  }}
                  type="button"
                >
                  复制页面
                </button>
                <button
                  onClick={() => {
                    void exportPage(pageContextMenu.page)
                    closePageContextMenu()
                  }}
                  type="button"
                >
                  导出页面
                </button>
                <button
                  onClick={() => {
                    void exportSinglePdf(pageContextMenu.page)
                    closePageContextMenu()
                  }}
                  type="button"
                >
                  导出 PDF
                </button>
                <button
                  onClick={() => {
                    void exportSinglePptx(pageContextMenu.page)
                    closePageContextMenu()
                  }}
                  type="button"
                >
                  导出 PPT
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    const sourceWork = works.find((work) => work.pages.some((item) => item.id === pageContextMenu.page.id))
                    if (isCustomFolderSelected) {
                      removePagesFromCurrentFolder(new Set([pageContextMenu.page.id]))
                    } else if (sourceWork) {
                      deletePage(sourceWork.id, pageContextMenu.page.id)
                    }
                    setSelectedPageIds(new Set())
                    closePageContextMenu()
                  }}
                  type="button"
                >
                  删除页面
                </button>
              </>
            )}
          </div>
        </>
      )}

      {dragPreviewPage && (
        <div
          className={`drag-preview ${dragOverFolderId ? 'over-folder' : ''}`}
          style={{
            left: 0,
            top: 0,
            transform: `translate3d(${dragPosition.x}px, ${dragPosition.y}px, 0) translate(-50%, -50%)`,
          }}
        >
          <SlidePreview page={dragPreviewPage} showBadge={false} />
          {dragPageIds.size > 1 && <b>+{dragPageIds.size - 1}</b>}
        </div>
      )}

      {folderDragPreview && (
        <div
          className="folder-drag-preview"
          style={{ transform: `translate3d(${folderDragPreview.x + 14}px, ${folderDragPreview.y + 18}px, 0)` }}
        >
          <FolderKanban size={13} />
          <span>{folderDragPreview.name}</span>
          {folderDragIdsRef.current.size > 1 && <b>+{folderDragIdsRef.current.size - 1}</b>}
        </div>
      )}

      {tagDragPreview && (
        <div className="tag-drag-preview" style={{ left: tagDragPreview.x + 12, top: tagDragPreview.y + 14 }}>
          <Tags size={12} />
          <span>{tagDragPreview.name}</span>
        </div>
      )}

      <main className="folder-pages" ref={folderPagesRef}>
        <div className="folder-content-only">
          <div className="folder-content">
            <div className="folder-toolbar inspiration-toolbar">
              <button className="ghost-button" onClick={onBack} type="button">
                <ArrowLeft size={15} />
                返回作品库
              </button>
              {selectedWorkFolder && (
                <>
                  <div className="folder-toolbar-title">
                    <strong>{selectedWorkFolder.title}</strong>
                    <span>{selectedWorkFolder.pages.length} 页 · {selectedWorkIndex + 1} / {works.length}</span>
                  </div>
                  <button className="ghost-button" disabled={!previousWork} onClick={() => previousWork && goToWork(previousWork)} type="button">
                    <ChevronLeft size={15} />
                    上一个作品
                  </button>
                  <button className="ghost-button" disabled={!nextWork} onClick={() => nextWork && goToWork(nextWork)} type="button">
                    下一个作品
                    <ChevronRight size={15} />
                  </button>
                </>
              )}
            </div>
            <FilterRail
              search={search}
          onSearchChange={setSearch}
          primaryLabel="版式"
          primaryOptions={layoutOptions}
          primaryValue={layout}
          onPrimaryChange={setLayout}
          profiles={pageProfileMap}
          selectedHex={selectedHex}
          selectedColorFamily={selectedColorFamily}
          colorMode={colorMode}
          colorTolerance={colorTolerance}
          colorMinRatio={colorMinRatio}
          onSelectHex={setSelectedHex}
          onSelectColorFamily={setSelectedColorFamily}
          onColorModeChange={setColorMode}
          onToleranceChange={setColorTolerance}
          onMinRatioChange={setColorMinRatio}
          hasFilters={hasFilters}
          onClear={clearFilters}
              rating={rating}
              onRatingChange={setRating}
              tagOptions={pageTagOptions}
              selectedTags={selectedTags}
              onTagToggle={(tag) =>
                setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]))
              }
              tagMode={tagMode}
              onTagModeChange={setTagMode}
              onColorFilterOpenChange={setColorProfilesRequested}
            />

            <div className="folder-scroll-area" ref={folderScrollAreaRef}>
              {childFolders.length > 0 && (
                <div className="subfolder-section">
                  <div className="subfolder-heading">
                    <span>{selectedFolderId === 'all' ? '文件夹' : '子文件夹'} ({childFolders.length})</span>
                  </div>
                  <div className="subfolder-grid">
                    {childFolders.map((folder) => {
                      const previewPages = pages
                        .filter((page) => getFolderPageIds(folder.id).has(page.id))
                        .slice(0, 3)
                      return (
                        <button
                          className="subfolder-card"
                          key={folder.id}
                          onClick={() => {
                            setSelectedFolderId(folder.id)
                            setSelectedFolderIds(new Set([folder.id]))
                            lastSelectedFolderIdRef.current = folder.id
                          }}
                          type="button"
                        >
                          <div className="subfolder-cover">
                            {previewPages.length > 0 ? (
                              <div
                                className="subfolder-cover-grid"
                                style={{ gridTemplateColumns: `repeat(${Math.min(3, previewPages.length)}, minmax(0, 1fr))` }}
                              >
                                {previewPages.map((page) => <SlidePreview key={page.id} page={page} />)}
                              </div>
                            ) : (
                              <div className="empty-cover" />
                            )}
                          </div>
                          <strong>{folder.name}</strong>
                          <span>{getFolderPageIds(folder.id).size} 个文件</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {filteredPages.length > 0 ? (
                <>
                  <div
                    className="folder-page-grid simple-grid"
                    onMouseDown={(event) => {
                      if (!(event.target as HTMLElement).closest('.page-tile')) {
                        setSelectedPageIds(new Set())
                        lastSelectedPageIdRef.current = null
                      }
                    }}
                    onClickCapture={(event) => {
                      if (suppressPageClickRef.current) {
                        suppressPageClickRef.current = false
                        event.preventDefault()
                        event.stopPropagation()
                      }
                    }}
                    style={{
                      '--folder-card-min': `${gridCardMin}px`,
                    } as CSSProperties & Record<'--folder-card-min', string>}
                  >
                    {renderPages.map((page) => (
                      <PageTile
                        key={page.id}
                        page={page}
                        selected={selectedPageIds.has(page.id)}
                        dragging={dragPageIds.has(page.id)}
                        onSelect={(event) => toggleSelect(event, page.id)}
                        onPointerDown={(event) => startPagePointerDrag(event, page.id)}
                        onOpen={() => openViewer(page, filteredPages)}
                        onContextMenu={(event) => openPageContextMenu(event, page)}
                      />
                    ))}
                  </div>
                  {filteredPages.length > renderPages.length && (
                    <div ref={loadMoreSentinelRef} className="infinite-scroll-sentinel" aria-hidden="true" />
                  )}
                </>
              ) : visiblePages.length === 0 ? (
                <div className="folder-empty-state">
                  <div className="folder-empty-visual">
                    <EmptyStateIllustration alt="这个文件夹还没有页面" />
                  </div>
                  <div className="folder-empty-copy">
                    <span>文件夹</span>
                    <strong>这个文件夹还没有页面</strong>
                    <button
                      className="primary-button"
                      onClick={() => onImportToFolder(selectedFolderId)}
                      type="button"
                    >
                      导入作品到当前文件夹
                    </button>
                  </div>
                </div>
              ) : (
                <div className="folder-empty-state">
                  <div className="folder-empty-visual">
                    <EmptyStateIllustration alt="没有匹配的页面" />
                  </div>
                  <div className="folder-empty-copy">
                    <span>筛选结果</span>
                    <strong>没有匹配的页面</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
      {inspectorOpen && (inspectedPage ? (
        <InspectorPanel
          title={inspectedPage.title}
          preview={inspectedPage}
          format={inspectedSource?.kind}
          note={inspectedPage.note && inspectedPage.note !== '待分类' && inspectedPage.note !== '已读取原文件预览' ? inspectedPage.note : undefined}
          folders={collections
            .filter((collection) => collection.pageIds.includes(inspectedPage.id))
            .map((collection) => collection.name)}
          folderTree={collections}
          onAddToFolderById={(folderId) => {
            onCollectionsChange(
              collections.map((collection) =>
                collection.id === folderId
                  ? { ...collection, pageIds: Array.from(new Set([...collection.pageIds, inspectedPage.id])) }
                  : collection,
              ),
            )
          }}
          tags={inspectedPage.tags ?? []}
          rating={inspectedPage.rating ?? 0}
          onRatingChange={(value) => ratePage(inspectedPage.id, value)}
          onAddTag={(tag) => tagPages([inspectedPage.id], tag)}
          onRemoveTag={(tag) => untagPages([inspectedPage.id], tag)}
          onCopy={() => void copyPage(inspectedPage)}
          onExport={() => void exportPage(inspectedPage)}
          onDelete={() => {
            if (isCustomFolderSelected) {
              removePagesFromCurrentFolder(new Set([inspectedPage.id]))
            } else if (inspectedSource) {
              deletePage(inspectedSource.id, inspectedPage.id)
            }
            setSelectedPageIds(new Set())
          }}
          onOpen={() => openViewer(inspectedPage, filteredPages)}
        />
      ) : (
        <aside className="inspector-empty" style={{ width: '260px' }}>
          <ImageIcon size={20} />
          <span>选择图片查看详情</span>
        </aside>
      ))}
    </section>
  )
}

function WorkCard({
  work,
  category,
  tagPaths,
  onOpen,
  onSelect,
  onContextMenu,
  onToggleFavorite,
  selected = false,
}: {
  work: Work
  category?: string
  tagPaths?: Map<string, string[][]>
  onOpen: () => void
  onSelect?: (event: MouseEvent) => void
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void
  onToggleFavorite?: (workId: string) => void
  selected?: boolean
}) {
  const suppressCtrlClickRef = useRef(false)
  const cover = work.pages[0]

  return (
    <article className={selected ? 'work-card selected' : 'work-card'}>
      <button
        className="work-card-preview"
        onPointerDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && onSelect) {
            event.preventDefault()
            suppressCtrlClickRef.current = true
            onSelect(event)
          }
        }}
        onClick={(event) => {
          if (suppressCtrlClickRef.current) {
            suppressCtrlClickRef.current = false
            return
          }
          onSelect?.(event)
        }}
        onContextMenu={(event) => {
          if (event.ctrlKey) {
            event.preventDefault()
            return
          }
          onContextMenu?.(event)
        }}
        onDoubleClick={(event) => {
          event.preventDefault()
          onOpen()
        }}
        type="button"
      >
        {cover ? <SlidePreview page={cover} /> : <div className="empty-cover" />}
        {work.failed && <span className="work-card-failed">上传失败</span>}
        {selected && <span className="selected-check"><CheckCircle2 size={18} /></span>}
      </button>
      <div className="work-card-caption">
        <div className="work-card-caption-head">
          <strong>{work.title}</strong>
          {onToggleFavorite && (
            <button
              className={work.favorite ? 'work-card-favorite active' : 'work-card-favorite'}
              onClick={(event) => {
                event.stopPropagation()
                onToggleFavorite(work.id)
              }}
              title={work.favorite ? '取消收藏' : '收藏'}
              type="button"
            >
              <Star size={15} fill={work.favorite ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>
        {category && (
          <div className="work-card-meta">
            <span>{category}</span>
          </div>
        )}
        {(work.tags ?? []).length > 0 && (
          <div className="work-card-tags">
            {(work.tags ?? []).slice(0, 3).map((tag) => {
              const paths = tagPaths?.get(tag)
              const parent = paths?.[0] && paths[0].length > 1 ? paths[0][paths[0].length - 2] : undefined
              return (
                <span key={tag} style={tagColorStyle(tag)} title={paths?.[0]?.join(' / ')}>
                  {parent && <small>{parent} / </small>}
                  {tag}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
}

function PageTile({
  page,
  selected = false,
  dragging = false,
  onSelect,
  openViewer,
  onPointerDown,
  onOpen,
  onContextMenu,
}: {
  page: GalleryPage
  selected?: boolean
  dragging?: boolean
  onSelect?: (event: MouseEvent) => void
  openViewer?: () => void
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
  onOpen?: () => void
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void
}) {
  const suppressCtrlClickRef = useRef(false)

  const handleClick = (event: MouseEvent) => {
    if (suppressCtrlClickRef.current) {
      suppressCtrlClickRef.current = false
      return
    }
    if (onSelect) {
      onSelect(event)
      return
    }

    openViewer?.()
  }

  return (
    <article
      className={[
        'page-tile',
        selected ? 'selected' : '',
        dragging ? 'dragging-source' : '',
      ].filter(Boolean).join(' ')}
      draggable={false}
      onPointerDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && onSelect) {
          event.preventDefault()
          suppressCtrlClickRef.current = true
          onSelect(event)
          return
        }
        onPointerDown?.(event)
      }}
      onDragStart={(event) => event.preventDefault()}
      onContextMenu={onContextMenu}
    >
      {openViewer ? (
        <button
          className="preview-button"
          onClick={handleClick}
          onDoubleClick={(event) => {
            event.stopPropagation()
            onOpen?.()
          }}
          type="button"
        >
          <SlidePreview page={page} />
          <span className="expand-cue">
            <Maximize2 size={14} />
          </span>
        </button>
      ) : (
        <button
          className="preview-button"
          onClick={handleClick}
          onDoubleClick={(event) => {
            event.stopPropagation()
            onOpen?.()
          }}
          type="button"
        >
          <SlidePreview page={page} />
        </button>
      )}
      {selected && <span className="selected-check"><CheckCircle2 size={18} /></span>}
    </article>
  )
}

function SlidePreview({
  page,
  large = false,
  preview = false,
  showBadge = false,
}: {
  page: GalleryPage
  large?: boolean
  preview?: boolean
  showBadge?: boolean
}) {
  if (page.imageUrl) {
    const source = preview || large ? page.previewUrl ?? page.imageUrl : page.imageUrl
    return (
      <div className={large ? 'page-preview image large' : 'page-preview image'}>
        <img src={source} alt={page.title} loading={preview || large ? 'eager' : 'lazy'} decoding="async" />
        {showBadge && <span>{String(page.pageNumber).padStart(2, '0')}</span>}
      </div>
    )
  }

  return (
    <div className={large ? `page-preview mock ${page.previewKind} large` : `page-preview mock ${page.previewKind}`} style={{ background: page.palette }}>
      {showBadge && <span>{String(page.pageNumber).padStart(2, '0')}</span>}
      <div className="mock-stage">
        <b>{page.layout}</b>
        <i />
        <em />
        <small />
        <small />
        <small />
      </div>
    </div>
  )
}

function PageViewer({
  page,
  pages,
  pageIndex,
  onNavigate,
  zoom,
  setZoom,
  close,
  copyPage,
  exportPage,
  extraActions,
}: {
  page: GalleryPage
  pages: GalleryPage[]
  pageIndex: number
  onNavigate: (index: number) => void
  zoom: number
  setZoom: (zoom: number) => void
  close: () => void
  copyPage: () => void
  exportPage: () => void
  extraActions?: ReactElement
}) {
  const clampZoom = useCallback((value: number) => setZoom(Math.min(600, Math.max(50, value))), [setZoom])
  const viewerCanvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const wheelDeltaRef = useRef(0)
  const wheelLockUntilRef = useRef(0)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    setPanX(0)
    setPanY(0)
    setZoom(100)
    wheelDeltaRef.current = 0
    wheelLockUntilRef.current = 0
  }, [page.id, setZoom])

  useEffect(() => {
    const preload = (item?: GalleryPage) => {
      if (!item) return
      const src = item.previewUrl ?? item.imageUrl
      if (src) {
        const image = new Image()
        image.src = src
      }
    }
    preload(page)
    preload(pages[pageIndex - 1])
    preload(pages[pageIndex + 1])
  }, [page, pageIndex, pages])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.repeat) return
      if (event.code === 'Space' || event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  useEffect(() => {
    const element = viewerCanvasRef.current
    if (!element) return
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      const target = event.target as HTMLElement | null
      const onSlide = Boolean(target?.closest('.viewer-slide'))
      if (!event.ctrlKey && !event.metaKey) {
        if (onSlide && pages.length > 1 && event.deltaY !== 0) {
          wheelDeltaRef.current += event.deltaY
          const now = performance.now()
          if (now < wheelLockUntilRef.current || Math.abs(wheelDeltaRef.current) < 12) return
          const direction = wheelDeltaRef.current > 0 ? 1 : -1
          wheelDeltaRef.current = 0
          wheelLockUntilRef.current = now + 100
          const next = Math.min(pages.length - 1, Math.max(0, pageIndex + direction))
          if (next !== pageIndex) onNavigate(next)
        }
        return
      }
      const next = Math.min(600, Math.max(50, zoom + (event.deltaY < 0 ? 20 : -20)))
      const rect = element.getBoundingClientRect()
      const cursorX = event.clientX - rect.left - rect.width / 2
      const cursorY = event.clientY - rect.top - rect.height / 2
      const scale = zoom / 100
      const nextScale = next / 100
      const worldX = (cursorX - panX) / scale
      const worldY = (cursorY - panY) / scale
      setPanX(cursorX - worldX * nextScale)
      setPanY(cursorY - worldY * nextScale)
      setZoom(next)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [clampZoom, onNavigate, pageIndex, pages.length, panX, panY, setZoom, zoom])

  return (
    <div className="viewer-overlay" role="dialog" aria-modal="true" aria-label="页面预览">
      <div className="viewer-topbar">
        <div>
          <strong>{page.title}</strong>
          <span>{String(page.pageNumber).padStart(2, '0')} / {pages.length} · {page.layout}</span>
        </div>
        <div className="viewer-actions">
          <button className="icon-button" onClick={() => clampZoom(zoom - 25)} type="button" title="缩小">
            <ZoomOut size={16} />
          </button>
          <label className="zoom-slider">
            <input
              min="50"
              max="600"
              step="5"
              type="range"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <span>{zoom}%</span>
          </label>
          <button className="icon-button" onClick={() => clampZoom(zoom + 25)} type="button" title="放大">
            <ZoomIn size={16} />
          </button>
          <button className="ghost-button" onClick={() => setZoom(100)} type="button">
            <Minus size={16} />
            100%
          </button>
          <button className="ghost-button" onClick={copyPage} type="button">
            <Copy size={16} />
            复制
          </button>
          <button className="primary-button" onClick={exportPage} type="button">
            <Download size={16} />
            导出
          </button>
          {extraActions}
          <button className="icon-button" onClick={close} type="button" title="关闭">
            <X size={17} />
          </button>
        </div>
      </div>
      <div
        className={dragging ? 'viewer-canvas dragging' : 'viewer-canvas'}
        ref={viewerCanvasRef}
        onMouseDown={(event) => {
          if (event.button !== 0) return
          dragRef.current = { startX: event.clientX, startY: event.clientY, panX, panY }
          setDragging(true)
        }}
        onMouseMove={(event) => {
          if (!dragRef.current) return
          setPanX(dragRef.current.panX + event.clientX - dragRef.current.startX)
          setPanY(dragRef.current.panY + event.clientY - dragRef.current.startY)
        }}
        onMouseUp={() => {
          dragRef.current = null
          setDragging(false)
        }}
        onMouseLeave={() => {
          dragRef.current = null
          setDragging(false)
        }}
      >
        <div
          className="viewer-slide"
          style={{ transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom / 100})` }}
        >
          <SlidePreview page={page} large />
        </div>
      </div>
    </div>
  )
}

export default App
