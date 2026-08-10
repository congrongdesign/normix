import JSZip from 'jszip'
import sharp from 'sharp'

const base = process.env.API_BASE ?? 'http://localhost:4000'

const json = async (path, options) => {
  const response = await fetch(`${base}${path}`, options)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`)
  return data
}

const removeWork = async (workId) => {
  try {
    await json(`/api/works/${workId}`, { method: 'DELETE' })
  } catch {
    // already soft-deleted
  }
  try {
    await json(`/api/trash/${workId}`, { method: 'DELETE' })
  } catch {
    // already permanently deleted
  }
}

const cleanupZeroTags = async (names) => {
  const tree = await json('/api/tags/tree')
  for (const tag of tree.tags ?? []) {
    if (!names.includes(tag.name)) continue
    if ((tag.work_count ?? 0) > 0 || (tag.page_count ?? 0) > 0) continue
    await json(`/api/tags/${tag.id}`, { method: 'DELETE' })
  }
}

const works = await json('/api/works?page=1&limit=1')
const pages = await json('/api/pages?page=1&limit=1')
if (!Array.isArray(works.works) || !Array.isArray(pages.pages)) throw new Error('invalid API shape')

const folder = await json('/api/folders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'smoke-test' }),
})
const pageId = pages.pages[0]?.id
if (pageId) {
  await json('/api/pages/folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageIds: [pageId], folderId: folder.id }),
  })
  const exportResponse = await fetch(`${base}/api/export/folder/${folder.id}`)
  if (!exportResponse.ok || (await exportResponse.arrayBuffer()).byteLength === 0) throw new Error('folder export failed')
}
await json(`/api/folders/${folder.id}`, { method: 'DELETE' })

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const form = new FormData()
form.append('file', new Blob([png], { type: 'image/png' }), 'smoke.png')
const upload = await json('/api/uploads', { method: 'POST', body: form })
let task = await json(`/api/tasks/${upload.taskId}`)
for (let i = 0; i < 30 && task.status === 'processing'; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 300))
  task = await json(`/api/tasks/${upload.taskId}`)
}
if (task.status !== 'done') throw new Error(`upload task failed: ${task.status}`)
if (task.progress !== 100) throw new Error(`upload task did not reach 100%: ${task.progress}`)
const uploadedWork = await json(`/api/works/${upload.workId}`)
const uploadedPageId = uploadedWork.pages[0]?.id
if (!uploadedPageId) throw new Error('uploaded work has no page')
await json(`/api/pages/${uploadedPageId}/tags`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag: 'smoke' }),
})
await json(`/api/pages/${uploadedPageId}/rate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rating: 5 }),
})
const savedPage = await json(`/api/pages/${uploadedPageId}`)
if (!savedPage.tags?.includes('smoke') || savedPage.rating !== 5) throw new Error('tag/rate persistence failed')
await removeWork(upload.workId)

const trashForm = new FormData()
trashForm.append('file', new Blob([png], { type: 'image/png' }), 'trash-smoke.png')
const trashUpload = await json('/api/uploads', { method: 'POST', body: trashForm })
let trashTask = await json(`/api/tasks/${trashUpload.taskId}`)
for (let i = 0; i < 30 && trashTask.status === 'processing'; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 300))
  trashTask = await json(`/api/tasks/${trashUpload.taskId}`)
}
if (trashTask.status !== 'done') throw new Error(`trash upload failed: ${trashTask.status}`)
await json(`/api/works/${trashUpload.workId}`, { method: 'DELETE' })
const trashList = await json('/api/trash')
const trashItem = trashList.works?.find((work) => work.id === trashUpload.workId)
if (!trashItem) throw new Error('soft-deleted work missing from trash')
if (!trashItem.coverPreviewUrl) throw new Error('trash work missing cover preview')
const trashDetail = await json(`/api/trash/${trashUpload.workId}`)
if (!trashDetail.pages?.length || !trashDetail.pages[0]?.previewUrl) throw new Error('trash detail missing pages')
await json(`/api/trash/${trashUpload.workId}/restore`, { method: 'POST' })
const restoredWork = await json(`/api/works/${trashUpload.workId}`)
if (restoredWork.deleted_at) throw new Error('restored work still marked deleted')
await removeWork(trashUpload.workId)

const pptxZip = new JSZip()
pptxZip.file('ppt/media/image10.png', png)
pptxZip.file('ppt/media/image2.png', png)
pptxZip.file('ppt/media/image1.png', png)
pptxZip.file('ppt/media/thumbnail.jpeg', png)
const pptx = await pptxZip.generateAsync({ type: 'nodebuffer' })
const pptxForm = new FormData()
pptxForm.append('file', new Blob([pptx], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'smoke-pages.pptx')
const pptxUpload = await json('/api/uploads', { method: 'POST', body: pptxForm })
let pptxTask = await json(`/api/tasks/${pptxUpload.taskId}`)
for (let i = 0; i < 30 && pptxTask.status === 'processing'; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 300))
  pptxTask = await json(`/api/tasks/${pptxUpload.taskId}`)
}
if (pptxTask.status !== 'done') throw new Error(`pptx task failed: ${pptxTask.status}`)
if (pptxTask.progress !== 100) throw new Error(`pptx task did not reach 100%: ${pptxTask.progress}`)
const pptxWork = await json(`/api/works/${pptxUpload.workId}`)
const pageTitles = pptxWork.pages.map((page) => page.title)
if (pageTitles.join(',') !== 'image1.png,image2.png,image10.png') {
  throw new Error(`pptx page order failed: ${pageTitles.join(',')}`)
}
const pageTags = pptxWork.pages.map((page) => page.tags ?? [])
if (!pageTags[0]?.includes('封面') || !pageTags[pageTags.length - 1]?.includes('封底')) {
  throw new Error(`pptx cover/back tags failed: ${JSON.stringify(pageTags)}`)
}
if ((pptxWork.tags ?? []).some((tag) => ['封面', '封底'].includes(tag))) {
  throw new Error(`work tags leaked page tags: ${JSON.stringify(pptxWork.tags ?? [])}`)
}
await json(`/api/works/${pptxUpload.workId}/tags`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag: 'smoke-work' }),
})
const taggedWork = await json(`/api/works/${pptxUpload.workId}`)
if (!taggedWork.tags?.includes('smoke-work')) {
  throw new Error('work tag persistence failed')
}
await removeWork(pptxUpload.workId)

const layeredZip = new JSZip()
layeredZip.file('ppt/media/background.png', png)
layeredZip.file('ppt/media/foreground.png', png)
layeredZip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`)
layeredZip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`)
layeredZip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId1"/></a:blipFill></p:bgPr></p:bg><p:spTree><p:pic><p:nvPicPr><p:cNvPr id="2" name="fg"/></p:nvPicPr></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm></p:spPr></p:pic></p:spTree></p:cSld></p:sld>`)
layeredZip.file('ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/background.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/foreground.png"/></Relationships>`)
const layeredPptx = await layeredZip.generateAsync({ type: 'nodebuffer' })
const layeredForm = new FormData()
layeredForm.append('file', new Blob([layeredPptx], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'smoke-layers.pptx')
const layeredUpload = await json('/api/uploads', { method: 'POST', body: layeredForm })
let layeredTask = await json(`/api/tasks/${layeredUpload.taskId}`)
for (let i = 0; i < 30 && layeredTask.status === 'processing'; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 300))
  layeredTask = await json(`/api/tasks/${layeredUpload.taskId}`)
}
if (layeredTask.status !== 'done') throw new Error(`layered task failed: ${layeredTask.status}`)
const layeredWork = await json(`/api/works/${layeredUpload.workId}`)
if (layeredWork.pages.length !== 1) {
  throw new Error(`layered pptx expected 1 page, got ${layeredWork.pages.length}`)
}
await removeWork(layeredUpload.workId)

const animatedFrameA = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer()
const animatedFrameB = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer()
const animatedGif = await sharp([animatedFrameA, animatedFrameB], { join: { animated: true } }).gif({ delay: [100, 100] }).toBuffer()
const animatedZip = new JSZip()
animatedZip.file('ppt/media/background.png', png)
animatedZip.file('ppt/media/foreground.gif', animatedGif)
animatedZip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`)
animatedZip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`)
animatedZip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId1"/></a:blipFill></p:bgPr></p:bg><p:spTree><p:pic><p:nvPicPr><p:cNvPr id="2" name="fg"/></p:nvPicPr></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm></p:spPr></p:pic></p:spTree></p:cSld></p:sld>`)
animatedZip.file('ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/background.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/foreground.gif"/></Relationships>`)
const animatedPptx = await animatedZip.generateAsync({ type: 'nodebuffer' })
const animatedForm = new FormData()
animatedForm.append('file', new Blob([animatedPptx], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'smoke-animated.pptx')
const animatedUpload = await json('/api/uploads', { method: 'POST', body: animatedForm })
let animatedTask = await json(`/api/tasks/${animatedUpload.taskId}`)
for (let i = 0; i < 40 && animatedTask.status === 'processing'; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 300))
  animatedTask = await json(`/api/tasks/${animatedUpload.taskId}`)
}
if (animatedTask.status !== 'done') throw new Error(`animated task failed: ${animatedTask.status}`)
const animatedWork = await json(`/api/works/${animatedUpload.workId}`)
const animatedPage = animatedWork.pages[0]
const animatedPreview = Buffer.from(await (await fetch(`${base}/api/pages/${animatedPage.id}/preview`)).arrayBuffer())
const animatedPreviewMeta = await sharp(animatedPreview, { animated: true, limitInputPixels: false }).metadata()
if ((animatedPreviewMeta.pages ?? 1) <= 1) throw new Error('animated preview lost animation')
await removeWork(animatedUpload.workId)

await cleanupZeroTags(['smoke', 'smoke-work'])

console.log('smoke test passed')
