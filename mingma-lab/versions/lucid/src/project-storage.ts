/** Browser-local project drafts. Uploaded drawings stay in IndexedDB, never in a cookie or a request. */
export type ProjectEnvelope<T> = { schema: 1; savedAt: string; revision?: string; data: T }
export type ProjectSaveStatus = {
  phase: 'loading' | 'ready' | 'saving' | 'saved' | 'error'
  savedAt?: string
  message?: string
}
export type ProjectStorageBackend = {
  read: () => Promise<unknown>
  write: (value: unknown, expectedRevision?: string | null) => Promise<void>
  remove: (expectedRevision?: string | null) => Promise<void>
}
const DATABASE = 'anju-project-drafts'
const OBJECT_STORE = 'projects'
const PROJECT_KEY = 'current'
export class ProjectDraftConflictError extends Error {
  constructor() { super('另一个页面已更新此项目。请先导出本页修改，再刷新恢复最新草稿。'); this.name = 'ProjectDraftConflictError' }
}
export function projectDraftRevision(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  return typeof record.revision === 'string' ? record.revision : typeof record.savedAt === 'string' ? record.savedAt : null
}

export function decodeProjectEnvelope<T>(value: unknown, decode: (data: unknown) => T): ProjectEnvelope<T> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('本地草稿格式无法读取，原记录已保留。')
  const record = value as Record<string, unknown>
  if (record.schema !== 1) throw new Error('本地草稿版本不兼容，原记录已保留。')
  if (typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))) throw new Error('本地草稿保存时间无效，原记录已保留。')
  if (record.revision !== undefined && (typeof record.revision !== 'string' || record.revision.length > 100)) throw new Error('本地草稿版本标记无效，原记录已保留。')
  return { schema: 1, savedAt: record.savedAt, ...(record.revision ? { revision: record.revision as string } : {}), data: decode(record.data) }
}

function indexedDBBackend(): ProjectStorageBackend {
  let connection: Promise<IDBDatabase> | undefined
  const open = () => {
    if (connection) return connection
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('此浏览器不支持本地草稿，请先导出项目。')); return }
      let settled = false
      const request = indexedDB.open(DATABASE, 1)
      const fail = (message: string) => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(message)) } }
      const timer = setTimeout(() => fail('本地草稿暂时无法打开，请关闭其他项目页面后重试。'), 8000)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE)
      }
      request.onblocked = () => fail('另一个页面正在使用旧版草稿，请关闭它后重试。')
      request.onerror = () => fail('浏览器未允许读取本地草稿，请检查隐私或存储设置。')
      request.onsuccess = () => {
        if (settled) { request.result.close(); return }
        settled = true; clearTimeout(timer)
        const db = request.result
        db.onversionchange = () => { db.close(); connection = undefined }
        resolve(db)
      }
    }).catch(error => { connection = undefined; throw error })
    return connection
  }
  async function transact(mode: IDBTransactionMode, operation: 'get' | 'put' | 'delete', value?: unknown, expectedRevision?: string | null) {
    const db = await open()
    return new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction(OBJECT_STORE, mode)
      const objectStore = transaction.objectStore(OBJECT_STORE)
      const request = objectStore.get(PROJECT_KEY)
      let failure: Error | undefined
      request.onsuccess = () => {
        if (operation === 'get') return
        // Check and write within one transaction, so a stale tab never replaces a newer draft.
        if (expectedRevision !== undefined && projectDraftRevision(request.result) !== expectedRevision) {
          failure = new ProjectDraftConflictError(); transaction.abort(); return
        }
        if (operation === 'put') objectStore.put(value, PROJECT_KEY)
        else objectStore.delete(PROJECT_KEY)
      }
      transaction.oncomplete = () => resolve(operation === 'get' ? request.result : undefined)
      transaction.onabort = () => reject(failure ?? transaction.error ?? request.error ?? new Error('本地草稿未能保存。'))
      transaction.onerror = () => { /* onabort reports the final transaction result. */ }
    })
  }
  return {
    read: () => transact('readonly', 'get'),
    write: async (value, expectedRevision) => { await transact('readwrite', 'put', value, expectedRevision) },
    remove: async expectedRevision => { await transact('readwrite', 'delete', undefined, expectedRevision) },
  }
}

export function createProjectStorage<T>({ decode, onStatus, backend = indexedDBBackend() }: {
  decode: (value: unknown) => T
  onStatus?: (status: ProjectSaveStatus) => void
  backend?: ProjectStorageBackend
}) {
  let loaded = false
  let loadPromise: Promise<ProjectEnvelope<T> | null> | undefined
  let queue: Promise<void> = Promise.resolve()
  let lastOperation: Promise<void> = queue
  let saveSequence = 0
  let savedAt: string | undefined
  let revision: string | null = null
  let status: ProjectSaveStatus = { phase: 'loading' }
  const publish = (next: ProjectSaveStatus) => {
    status = next
    try { onStatus?.({ ...next }) } catch { /* View errors must never undo a completed write. */ }
  }
  function load() {
    if (loadPromise) return loadPromise
    publish({ phase: 'loading', savedAt })
    loadPromise = backend.read().then(raw => {
      const saved = raw === undefined || raw === null ? null : decodeProjectEnvelope(raw, decode)
      loaded = true
      savedAt = saved?.savedAt
      revision = projectDraftRevision(saved)
      publish({ phase: saved ? 'saved' : 'ready', savedAt })
      return saved
    }).catch(error => {
      loaded = false
      loadPromise = undefined
      publish({ phase: 'error', savedAt, message: error instanceof Error ? error.message : '本地草稿读取失败，原记录已保留。' })
      throw error
    })
    return loadPromise
  }
  function save(data: T): Promise<void> {
    if (!loaded) return Promise.reject(new Error('尚未安全读取本地草稿，已暂停自动保存以保护原记录。'))
    let envelope: ProjectEnvelope<T>
    try {
      // Capture the call-time state, before another edit or asynchronous write can change it.
      envelope = { schema: 1, savedAt: new Date().toISOString(), revision: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, data: structuredClone(data) }
    } catch {
      const error = new Error('当前内容无法保存，请先导出项目。')
      publish({ phase: 'error', savedAt, message: error.message })
      return Promise.reject(error)
    }
    const sequence = ++saveSequence
    publish({ phase: 'saving', savedAt })
    const operation = queue.then(async () => {
      if (!loaded) throw new ProjectDraftConflictError()
      await backend.write(envelope, revision)
      savedAt = envelope.savedAt
      revision = projectDraftRevision(envelope)
      loadPromise = Promise.resolve(envelope)
      if (sequence === saveSequence) publish({ phase: 'saved', savedAt })
    }).catch(error => {
      if (error instanceof ProjectDraftConflictError) { loaded = false; loadPromise = undefined }
      if (sequence === saveSequence) publish({ phase: 'error', savedAt, message: error instanceof ProjectDraftConflictError ? error.message : '未能保存最新修改。请重试保存，或导出项目备份。' })
      throw error
    })
    // A failed write cannot poison later retries, and older writes can never land after newer ones.
    queue = operation.catch(() => {})
    lastOperation = operation
    return operation
  }
  function clear() {
    // Only call after an explicit user reset. Clearing is also serialized after in-flight saves.
    const sequence = ++saveSequence
    const operation = queue.then(async () => {
      await backend.remove(loaded ? revision : undefined)
      loaded = true; savedAt = undefined; revision = null; loadPromise = Promise.resolve(null)
      if (sequence === saveSequence) publish({ phase: 'ready' })
    }).catch(error => {
      if (error instanceof ProjectDraftConflictError) { loaded = false; loadPromise = undefined }
      publish({ phase: 'error', savedAt, message: error instanceof ProjectDraftConflictError ? error.message : '原草稿尚未清除，请重试。' })
      throw error
    })
    queue = operation.catch(() => {})
    lastOperation = operation
    return operation
  }
  return { load, save, clear, readRaw: async () => structuredClone(await backend.read()), flush: () => lastOperation, status: () => ({ ...status }) }
}
