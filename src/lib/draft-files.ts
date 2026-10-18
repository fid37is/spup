'use client'

/**
 * draft-files.ts
 * --------------
 * Photos and videos picked in the composer are NOT sent anywhere until the person
 * taps Post. Until then (and afterwards, if the post comes back as a draft) the raw
 * files live here, in the browser's own IndexedDB on this device - localStorage is
 * far too small for them. One record per file, grouped by the draft they belong to.
 *
 * Every function swallows storage errors (private browsing, quota): a draft then
 * simply comes back without its files rather than breaking the composer.
 */

const DB_NAME = 'spup-draft-files'
const DB_VERSION = 1
const STORE = 'files'

export interface HeldFile { key: string; blob: Blob; name: string }

interface Row { id: string; draftId: string; key: string; blob: Blob; name: string }

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('by_draft', 'draftId')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const rowId = (draftId: string, key: string) => `${draftId}::${key}`

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Makes the stored files for a draft match `items`: new ones are written, removed ones deleted, unchanged ones left alone (a 25MB video is not rewritten on every keystroke). */
export async function syncDraftFiles(draftId: string, items: HeldFile[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = new Set((await request(store.index('by_draft').getAllKeys(draftId))).map(String))
    const wanted = new Set(items.map(i => rowId(draftId, i.key)))
    for (const id of existing) if (!wanted.has(id)) store.delete(id)
    for (const i of items) {
      const id = rowId(draftId, i.key)
      if (!existing.has(id)) store.put({ id, draftId, key: i.key, blob: i.blob, name: i.name } satisfies Row)
    }
    await done(tx)
    db.close()
  } catch { /* the draft just won't carry its files */ }
}

export async function getDraftFiles(draftId: string): Promise<HeldFile[]> {
  if (typeof indexedDB === 'undefined') return []
  try {
    const db = await openDB()
    const rows = await request(db.transaction(STORE, 'readonly').objectStore(STORE).index('by_draft').getAll(draftId)) as Row[]
    db.close()
    return rows.map(r => ({ key: r.key, blob: r.blob, name: r.name }))
  } catch {
    return []
  }
}

export async function deleteDraftFiles(draftId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const id of await request(store.index('by_draft').getAllKeys(draftId))) store.delete(id)
    await done(tx)
    db.close()
  } catch { /* nothing to clean */ }
}
