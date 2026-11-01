'use client'

import { useEffect, useRef, useState } from 'react'
import type { DocItem } from './api'
import { middleEllipsis, nameProblem, splitName } from './fileKinds'

export type RenameResult = { fieldError?: string }

/**
 * An item's name, or the inline rename input while `editing`. `onCommit(name)` resolves
 * to `{ fieldError }` to keep editing with a message under the input (409 → "A file with
 * that name already exists").
 */
export function ItemName({ item, editing, onCommit, onCancel, className = '', inputClassName = '', maxChars }: {
  item: DocItem
  editing: boolean
  onCommit: (name: string) => Promise<RenameResult>
  onCancel: () => void
  className?: string
  inputClassName?: string
  /** Middle-ellipsis long names to this many characters (the extension stays visible). */
  maxChars?: number
}) {
  if (!editing) {
    return (
      <span data-item-name="" title={item.name} className={className}>
        {maxChars ? middleEllipsis(item.name, maxChars) : item.name}
      </span>
    )
  }
  return <RenameInput item={item} onCommit={onCommit} onCancel={onCancel} className={inputClassName} />
}

function RenameInput({ item, onCommit, onCancel, className }: {
  item: DocItem
  onCommit: (name: string) => Promise<RenameResult>
  onCancel: () => void
  className: string
}) {
  const original = item.name
  const [value, setValue] = useState(original)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const done = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const mountedAt = useRef(0)

  // Files select the stem so the extension survives a quick retype.
  useEffect(() => {
    const el = input.current
    if (!el) return
    mountedAt.current = performance.now()
    el.focus()
    const { ext } = splitName(original)
    const end = !item.isDir && ext ? original.length - ext.length : original.length
    el.setSelectionRange(0, end)
  }, [item.isDir, original])

  const commit = async () => {
    if (busy.current || done.current) return
    let next = value.trim()
    if (!next || next === original) {
      done.current = true
      onCancel()
      return
    }
    // Typing just a new stem keeps the extension.
    const { ext } = splitName(original)
    if (!item.isDir && ext && !splitName(next).ext) next = `${next}${ext}`
    const problem = nameProblem(next)
    if (problem) { setError(problem); return }
    busy.current = true
    const result = await onCommit(next)
    busy.current = false
    if (result.fieldError) {
      setError(result.fieldError)
      input.current?.focus()
      return
    }
    done.current = true
  }

  return (
    <span className="flex w-full min-w-0 flex-col" onClick={e => e.stopPropagation()}>
      <input
        ref={input}
        value={value}
        onChange={e => { setValue(e.target.value); if (error) setError(null) }}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter') { e.preventDefault(); void commit() }
          else if (e.key === 'Escape') { e.preventDefault(); done.current = true; onCancel() }
        }}
        onBlur={() => {
          // A closing menu hands focus back to its trigger just after mount; take it back.
          if (performance.now() - mountedAt.current < 400) {
            requestAnimationFrame(() => input.current?.focus())
            return
          }
          if (error) { done.current = true; onCancel(); return }
          void commit()
        }}
        onPointerDown={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
        onContextMenu={e => e.stopPropagation()}
        onDragStart={e => { e.preventDefault(); e.stopPropagation() }}
        draggable={false}
        aria-label={`New name for ${original}`}
        aria-invalid={error ? true : undefined}
        spellCheck={false}
        autoComplete="off"
        className={`w-full rounded-[6px] border border-[var(--accent)] bg-[#141119] px-1.5 text-ink outline-none ring-2 ring-[var(--accent)]/30 ${className}`}
      />
      {error && (
        <span role="alert" className="mt-1 text-left text-[11.5px] leading-snug text-[#ff8a8a]">{error}</span>
      )}
    </span>
  )
}
