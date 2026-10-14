// 附件存储：文件本体落磁盘（UPLOADS_DIR），数据库只保存元数据与相对路径。
// 抽出 AttachmentStore 接口，路由测试可以注入内存实现，不需要真写磁盘。

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

/** 上传时需要的字段（File 与自造对象都满足） */
export interface UploadFileLike {
  name: string
  size: number
  type: string
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface SavedAttachment {
  id: string
  /** 相对 UPLOADS_DIR 的存储路径 */
  storagePath: string
  name: string
  mimeType: string
  size: number
}

export interface AttachmentStore {
  save(todoId: string, file: UploadFileLike): Promise<SavedAttachment>
  read(storagePath: string): Promise<Uint8Array>
  remove(storagePath: string): Promise<void>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 从文件名里取安全扩展名（最多 10 个字符，只保留字母数字） */
function safeExtension(name: string): string {
  const ext = extname(name)
  if (!ext) return ''

  return /^\.[a-z0-9]{1,10}$/i.test(ext) ? ext.toLowerCase() : ''
}

/** 只允许「uuid/uuid.ext」这种由我们生成的相对路径，防目录穿越 */
function assertSafeStoragePath(storagePath: string): void {
  const segments = storagePath.split('/')
  const [dir, file] = segments as [string, string | undefined]
  const bare = file?.split('.')[0] ?? ''

  if (
    segments.length > 2 ||
    !UUID_PATTERN.test(dir) ||
    !file ||
    !UUID_PATTERN.test(bare)
  ) {
    throw new Error(`非法的附件存储路径：${storagePath}`)
  }
}

/** 基于本地文件系统的实现（生产与集成测试都用它） */
export function createAttachmentStore(rootDir: string): AttachmentStore {
  const root = resolve(rootDir)

  function absolutePath(storagePath: string): string {
    assertSafeStoragePath(storagePath)

    const absolute = resolve(root, storagePath)
    if (!absolute.startsWith(`${root}${sep}`)) {
      throw new Error(`附件路径越界：${storagePath}`)
    }

    return absolute
  }

  return {
    async save(todoId, file) {
      if (!UUID_PATTERN.test(todoId)) throw new Error(`非法的待办 id：${todoId}`)

      const id = randomUUID()
      const storagePath = `${todoId}/${id}${safeExtension(file.name)}`
      const absolute = absolutePath(storagePath)

      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, new Uint8Array(await file.arrayBuffer()))

      return {
        id,
        storagePath,
        name: file.name,
        mimeType: file.type,
        size: file.size,
      }
    },

    async read(storagePath) {
      return new Uint8Array(await readFile(absolutePath(storagePath)))
    },

    async remove(storagePath) {
      await rm(absolutePath(storagePath), { force: true })
    },
  }
}

/** 内存实现：单测 / 路由测试用，不碰磁盘 */
export function createMemoryAttachmentStore(): AttachmentStore {
  const files = new Map<string, Uint8Array>()

  return {
    async save(todoId, file) {
      if (!UUID_PATTERN.test(todoId)) throw new Error(`非法的待办 id：${todoId}`)

      const id = randomUUID()
      const storagePath = `${todoId}/${id}${safeExtension(file.name)}`
      files.set(storagePath, new Uint8Array(await file.arrayBuffer()))

      return { id, storagePath, name: file.name, mimeType: file.type, size: file.size }
    },

    async read(storagePath) {
      const data = files.get(storagePath)
      if (!data) throw new Error(`附件文件不存在：${storagePath}`)

      return data
    },

    async remove(storagePath) {
      files.delete(storagePath)
    },
  }
}
