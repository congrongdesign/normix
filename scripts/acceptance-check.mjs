const base = process.env.API_BASE ?? 'http://localhost:4000'

const json = async (path, options) => {
  const response = await fetch(`${base}${path}`, options)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`)
  return data
}

const health = await json('/api/health')
if (!health.ok) throw new Error('health check failed')

const worksData = await json('/api/works?page=1&limit=1')
if (!Array.isArray(worksData.works)) throw new Error('works API shape invalid')

const pagesData = await json('/api/pages?page=1&limit=1')
if (!Array.isArray(pagesData.pages)) throw new Error('pages API shape invalid')

const work = worksData.works[0]
if (work) {
  if (!('favorite' in work) || !('fileSize' in work)) {
    throw new Error('works API missing favorite/fileSize')
  }
  const originalFavorite = Boolean(work.favorite)
  const nextFavorite = !originalFavorite
  await json(`/api/works/${work.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorite: nextFavorite }),
  })
  const changed = await json(`/api/works/${work.id}`)
  if (Boolean(changed.favorite) !== nextFavorite) throw new Error('favorite persistence failed')
  await json(`/api/works/${work.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorite: originalFavorite }),
  })
}

const page = pagesData.pages[0]
if (page && !Array.isArray(page.tagIds)) throw new Error('pages API missing tagIds')

const parent = await json('/api/folders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '__normix_acceptance_parent__' }),
})
const child = await json('/api/folders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '__normix_acceptance_child__', parentId: parent.id }),
})
if (page) {
  await json('/api/pages/folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageIds: [page.id], folderId: child.id }),
  })
}
await json(`/api/folders/${parent.id}`, { method: 'DELETE' })
const foldersAfterParentDelete = await json('/api/folders')
const childAfter = foldersAfterParentDelete.folders.find((item) => item.id === child.id)
if (!childAfter) throw new Error('child folder was deleted with parent')
if (childAfter.parent_id !== null) throw new Error('child folder was not promoted to root')
if (childAfter.id) await json(`/api/folders/${child.id}`, { method: 'DELETE' })

const foldersFinal = await json('/api/folders')
const leftover = foldersFinal.folders.filter((item) => item.name.startsWith('__normix_acceptance_'))
if (leftover.length > 0) throw new Error('acceptance test folders were not cleaned')

console.log('acceptance check passed')
