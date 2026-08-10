import sharp from 'sharp'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const parseRelationshipMap = (xml, mediaOnly = false) => {
  const result = new Map()
  for (const match of xml.matchAll(/<Relationship\s+([^>]+)\/>/g)) {
    const attrs = match[1]
    const id = attrs.match(/Id="([^"]+)"/)?.[1]
    const type = attrs.match(/Type="([^"]+)"/)?.[1]
    const target = attrs.match(/Target="([^"]+)"/)?.[1]
    if (!id || !target) continue
    if (mediaOnly && !/\/image$/.test(type ?? '')) continue
    result.set(id, target)
  }
  return result
}

const normalizeSlidePath = (target) => {
  const clean = target.replace(/^\/+/, '')
  if (clean.startsWith('../media/')) return `ppt/media/${clean.slice('../media/'.length)}`
  return clean.startsWith('ppt/') ? clean : `ppt/${clean}`
}

export const getPptxSlidePaths = async (zip) => {
  try {
    const relsEntry = zip.file('ppt/_rels/presentation.xml.rels')
    const presEntry = zip.file('ppt/presentation.xml')
    if (relsEntry && presEntry) {
      const rels = parseRelationshipMap(await relsEntry.async('string'))
      const presXml = await presEntry.async('string')
      const slideIds = [...presXml.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)].map((match) => match[1])
      const paths = slideIds.map((id) => rels.get(id)).filter(Boolean).map(normalizeSlidePath)
      if (paths.length > 0) return paths
    }
  } catch {
    // fall through to numeric slide discovery
  }
  return Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
}

export const getPptxSlideSize = async (zip) => {
  const entry = zip.file('ppt/presentation.xml')
  if (!entry) return null
  const xml = await entry.async('string')
  const direct = xml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
  if (direct) return { cx: Number(direct[1]), cy: Number(direct[2]) }
  const reversed = xml.match(/<p:sldSz[^>]*cy="(\d+)"[^>]*cx="(\d+)"/)
  if (reversed) return { cx: Number(reversed[2]), cy: Number(reversed[1]) }
  return null
}

const parsePptxXfrm = (xml) => {
  const xfrm = xml.match(/<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/)?.[1] ?? ''
  const off = xfrm.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\s*\/>/)
  const ext = xfrm.match(/<a:ext\s+cx="(-?\d+)"\s+cy="(-?\d+)"\s*\/>/)
  return {
    off: off ? { x: Number(off[1]), y: Number(off[2]) } : null,
    ext: ext ? { cx: Number(ext[1]), cy: Number(ext[2]) } : null,
  }
}

export const getPptxSlideLayers = async (zip, slidePath) => {
  const match = slidePath.match(/(?:^|\/)(slide\d+)\.xml$/)
  if (!match) return []
  const relPath = `ppt/slides/_rels/${match[1]}.xml.rels`
  const relEntry = zip.files[relPath]
  const slideEntry = zip.files[slidePath]
  if (!relEntry || !slideEntry) return []

  const rels = parseRelationshipMap(await relEntry.async('string'), true)
  const slideXml = await slideEntry.async('string')
  const backgroundIds = new Set(
    [...slideXml.matchAll(/<p:bg>[\s\S]*?<\/p:bg>/g)].flatMap((block) =>
      [...block[0].matchAll(/r:embed="([^"]+)"/g)].map((item) => item[1]),
    ),
  )
  const layers = []
  const used = new Set()
  for (const id of backgroundIds) {
    const target = rels.get(id)
    const entry = target ? zip.files[normalizeSlidePath(target)] : null
    if (!entry) continue
    layers.push({ id, buffer: await entry.async('nodebuffer'), xfrm: null, background: true })
    used.add(id)
  }

  for (const block of slideXml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)) {
    const id = block[0].match(/r:embed="([^"]+)"/)?.[1]
    const target = id ? rels.get(id) : null
    const entry = target ? zip.files[normalizeSlidePath(target)] : null
    if (!id || !entry || used.has(id)) continue
    layers.push({ id, buffer: await entry.async('nodebuffer'), xfrm: parsePptxXfrm(block[0]) })
    used.add(id)
  }

  const allIds = [...slideXml.matchAll(/r:embed="([^"]+)"/g)].map((item) => item[1])
  for (const id of allIds) {
    if (used.has(id)) continue
    const target = rels.get(id)
    const entry = target ? zip.files[normalizeSlidePath(target)] : null
    if (!entry) continue
    layers.push({ id, buffer: await entry.async('nodebuffer'), xfrm: null })
    used.add(id)
  }
  return layers
}

export const compositePptxLayers = async (layers, slideSize) => {
  if (layers.length === 0) return null
  if (layers.length === 1) return layers[0].buffer

  const width = 1920
  const height = slideSize ? Math.max(1, Math.round((width * slideSize.cy) / slideSize.cx)) : width
  const layerMeta = []
  for (const layer of layers) {
    const meta = await sharp(layer.buffer, { animated: true, limitInputPixels: false }).metadata()
    layerMeta.push({
      ...layer,
      animated: (meta.pages ?? 1) > 1,
      meta,
      pages: meta.pages ?? 1,
      delay: meta.delay ?? [],
    })
  }

  const frameCount = Math.min(
    12,
    Math.max(1, ...layerMeta.filter((layer) => layer.animated).map((layer) => layer.pages)),
  )
  const animatedTop = [...layerMeta].reverse().find((layer) => layer.animated)
  const delay = animatedTop?.delay?.length
    ? Array.from({ length: frameCount }, (_, index) => Math.max(120, Math.round(animatedTop.delay[Math.min(index, animatedTop.delay.length - 1)] ?? 120)))
    : Array.from({ length: frameCount }, () => 120)

  const layerGeometry = (layer) => {
    if (!slideSize || !layer.xfrm?.ext) return { left: 0, top: 0, layerWidth: width, layerHeight: height }
    return {
      left: Math.round((layer.xfrm.off?.x ?? 0) / slideSize.cx * width),
      top: Math.round((layer.xfrm.off?.y ?? 0) / slideSize.cy * height),
      layerWidth: Math.max(1, Math.round((layer.xfrm.ext.cx / slideSize.cx) * width)),
      layerHeight: Math.max(1, Math.round((layer.xfrm.ext.cy / slideSize.cy) * height)),
    }
  }

  const prepareLayerInput = async (layer, frameIndex) => {
    const { left, top, layerWidth, layerHeight } = layerGeometry(layer)
    let input
    if (layer.animated && frameIndex !== null) {
      const sourceFrame = Math.min(frameIndex, layer.pages - 1)
      input = await sharp(layer.buffer, { page: sourceFrame, limitInputPixels: false })
        .resize(layerWidth, layerHeight, { fit: 'fill' })
        .png()
        .toBuffer()
    } else {
      input = await sharp(layer.buffer).resize(layerWidth, layerHeight, { fit: 'fill' }).png().toBuffer()
    }

    const cropLeft = Math.max(0, -left)
    const cropTop = Math.max(0, -top)
    const visibleWidth = Math.max(0, Math.min(layerWidth - cropLeft, width - Math.max(0, left)))
    const visibleHeight = Math.max(0, Math.min(layerHeight - cropTop, height - Math.max(0, top)))
    if (visibleWidth <= 0 || visibleHeight <= 0) return null
    if (cropLeft || cropTop || visibleWidth !== layerWidth || visibleHeight !== layerHeight) {
      input = await sharp(input).extract({ left: cropLeft, top: cropTop, width: visibleWidth, height: visibleHeight }).png().toBuffer()
    }
    return {
      input,
      left: Math.max(0, left),
      top: Math.max(0, top),
    }
  }

  const composeFrame = async (frameIndex) => {
    const overlays = []
    for (const layer of layerMeta) {
      const prepared = await prepareLayerInput(layer, frameIndex)
      if (prepared) overlays.push(prepared)
    }
    if (overlays.length === 0) {
      return sharp({ create: { width, height: height ?? width, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .png()
        .toBuffer()
    }
    return sharp({
      create: { width, height: height ?? width, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(overlays).png().toBuffer()
  }

  if (!layerMeta.some((layer) => layer.animated)) {
    return composeFrame(null)
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-anim-'))
  const framePaths = []
  try {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const framePath = path.join(tempDir, `frame-${String(frameIndex).padStart(4, '0')}.png`)
      await sharp(await composeFrame(frameIndex)).png().toFile(framePath)
      framePaths.push(framePath)
    }
    const output = await sharp(framePaths, { join: { animated: true }, limitInputPixels: false })
      .gif({ delay, effort: 4, loop: 1 })
      .toBuffer()
    return output
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
