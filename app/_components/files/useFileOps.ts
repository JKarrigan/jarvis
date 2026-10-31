'use client'

import { useState } from 'react'
import type { ApiDirEntry, ApiEntry, ApiFileEntry } from '@/lib/fileTypes'
import type { ToastType } from '@/app/_components/Toast'
import { ApiError, apiFetch, errorMessage, joinPath, keepBothName, listNames } from './api'
import type { Conflict } from './modals'

type ShowToast = (type: ToastType, message: string) => void

const isConflict = (e: unknown) => e instanceof ApiError && e.status === 409

function renameRequest(path: string, name: string) {
  return apiFetch(
    `/api/files/rename?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`,
    { method: 'POST' },
  )
}

function moveRequest(from: string, toDir: string) {
  return apiFetch(
    `/api/files/move?from=${encodeURIComponent(from)}&to=${encodeURIComponent(toDir)}`,
    { method: 'POST' },
  )
}

/**
 * File mutations for the folder `dir`: each one calls the API, reports the
 * outcome as a toast and asks for a re-list. Name clashes (409) open a
 * "Keep both" prompt instead of failing; deletes of folders that look empty
 * are non-recursive and fall back to the confirm dialog if the server finds
 * hidden contents.
 */
export function useFileOps({
  dir,
  showToast,
  onChanged,
}: {
  dir: string
  showToast: ShowToast
  onChanged: () => void
}) {
  const [deleteFileTarget, setDeleteFileTarget] = useState<ApiFileEntry | null>(null)
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<ApiDirEntry | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)

  async function remove(entry: ApiEntry, { recursive }: { recursive: boolean }) {
    const path = joinPath(dir, entry.name)
    try {
      await apiFetch(
        `/api/files/delete?path=${encodeURIComponent(path)}${recursive ? '' : '&recursive=0'}`,
        { method: 'DELETE' },
      )
      showToast('success', `Deleted "${entry.name}"`)
      onChanged()
      return true
    } catch (e) {
      // Folder looked empty but holds hidden files — ask before deleting them.
      if (!recursive && entry.kind === 'dir' && isConflict(e)) {
        setDeleteFolderTarget(entry)
        return false
      }
      showToast('error', errorMessage(e))
      onChanged()
      return false
    }
  }

  /** Delete button: confirm first unless it's an (apparently) empty folder. */
  function requestDelete(entry: ApiEntry) {
    if (entry.kind === 'file') setDeleteFileTarget(entry)
    else if (entry.childCount === 0) void remove(entry, { recursive: false })
    else setDeleteFolderTarget(entry)
  }

  async function rename(entry: ApiEntry, newName: string) {
    const path = joinPath(dir, entry.name)
    const attempt = async (name: string) => {
      try {
        await renameRequest(path, name)
        showToast('success', `Renamed "${entry.name}" to "${name}"`)
        onChanged()
      } catch (e) {
        if (!isConflict(e)) { showToast('error', errorMessage(e)); return }
        const taken = await listNames(dir).catch(() => new Set<string>([name]))
        const suggestion = keepBothName(name, n => n === name || taken.has(n))
        setConflict({ name, destination: 'this folder', suggestion, keepBoth: () => void attempt(suggestion) })
      }
    }
    await attempt(newName)
  }

  /**
   * Move `entry` into `toDir` (a path relative to the root). For "Keep both" the
   * entry is first renamed in place to a name free in both folders, then moved.
   */
  async function move(entry: ApiEntry, toDir: string, label: string, destination: string) {
    const attempt = async (asName: string) => {
      const from = joinPath(dir, entry.name)
      try {
        if (asName === entry.name) {
          await moveRequest(from, toDir)
        } else {
          await renameRequest(from, asName)
          try {
            await moveRequest(joinPath(dir, asName), toDir)
          } catch (e) {
            await renameRequest(joinPath(dir, asName), entry.name).catch(() => {})
            throw e
          }
        }
        showToast('success', `Moved "${entry.name}" ${label}${asName === entry.name ? '' : ` as "${asName}"`}`)
        onChanged()
      } catch (e) {
        if (!isConflict(e)) { showToast('error', errorMessage(e)); onChanged(); return }
        const [there, here] = await Promise.all([
          listNames(toDir).catch(() => new Set<string>()),
          listNames(dir).catch(() => new Set<string>()),
        ])
        const suggestion = keepBothName(asName, n => n === asName || there.has(n) || here.has(n))
        setConflict({ name: entry.name, destination, suggestion, keepBoth: () => void attempt(suggestion) })
      }
    }
    await attempt(entry.name)
  }

  async function mkdir(name: string) {
    try {
      await apiFetch(`/api/files/mkdir?path=${encodeURIComponent(joinPath(dir, name))}`, { method: 'POST' })
      showToast('success', `Created "${name}"`)
      onChanged()
    } catch (e) {
      showToast('error', errorMessage(e))
    }
  }

  return {
    requestDelete,
    remove,
    rename,
    move,
    mkdir,
    deleteFileTarget,
    setDeleteFileTarget,
    deleteFolderTarget,
    setDeleteFolderTarget,
    conflict,
    setConflict,
  }
}
