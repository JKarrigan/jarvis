'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Local "draft" for a control bound to remote state (sliders driving lights).
 *
 * While the user is interacting, the control shows the draft instead of `value`,
 * so a server broadcast arriving mid-drag can't snap the thumb back. Commits are
 * throttled leading + trailing: the first change is sent immediately, then at
 * most one commit per `ms` with the latest value, and the draft is dropped (the
 * control follows `value` again) once a full window passes with no new input.
 * A pending value is flushed on unmount so closing a sheet mid-drag isn't lost.
 *
 * Returns `[displayValue, setDraft, dragging]`.
 */
export function useDraft<T>(value: T, commit: (v: T) => void, ms: number): [T, (v: T) => void, boolean] {
  // Wrapped so T may itself include null/undefined.
  const [draft, setDraftState] = useState<{ v: T } | null>(null)
  const commitRef = useRef(commit)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ v: T } | null>(null)

  useEffect(() => { commitRef.current = commit })

  const startWindow = useCallback(() => {
    timer.current = setTimeout(function tick() {
      const next = pending.current
      if (next) {
        pending.current = null
        commitRef.current(next.v)
        timer.current = setTimeout(tick, ms)
      } else {
        timer.current = null
        setDraftState(null)
      }
    }, ms)
  }, [ms])

  const update = useCallback((v: T) => {
    setDraftState({ v })
    if (timer.current === null) {
      commitRef.current(v) // leading edge
      startWindow()
    } else {
      pending.current = { v } // trailing edge picks up the latest value
    }
  }, [startWindow])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    pending.current = null
    if (next) commitRef.current(next.v)
  }, [])

  return [draft ? draft.v : value, update, draft !== null]
}
