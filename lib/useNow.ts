'use client'

import { useSyncExternalStore } from 'react'

/**
 * Shared wall clocks as external stores: one timer per resolution for the
 * whole page, and only components that read the clock re-render on a tick.
 * The server snapshot is null so server HTML never contains a time that
 * would mismatch on hydration.
 */
interface Clock {
  subscribe: (onChange: () => void) => () => void
  getSnapshot: () => number
}

function makeClock(ms: number): Clock {
  const listeners = new Set<() => void>()
  let now = Math.floor(Date.now() / ms) * ms
  let timer: ReturnType<typeof setTimeout> | null = null

  function tick() {
    now = Math.floor(Date.now() / ms) * ms
    for (const l of listeners) l()
    // Align to the next boundary so seconds/minutes flip on time.
    timer = setTimeout(tick, ms - (Date.now() % ms) + 5)
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange)
      if (listeners.size === 1) {
        now = Math.floor(Date.now() / ms) * ms
        timer = setTimeout(tick, ms - (Date.now() % ms) + 5)
      }
      return () => {
        listeners.delete(onChange)
        if (listeners.size === 0 && timer !== null) {
          clearTimeout(timer)
          timer = null
        }
      }
    },
    getSnapshot: () => now,
  }
}

const secondClock = makeClock(1000)
const minuteClock = makeClock(60_000)
const getServerSnapshot = () => null

/** Current time floored to the second (ms), or null during SSR/hydration. */
export function useNowSecond(): number | null {
  return useSyncExternalStore(secondClock.subscribe, secondClock.getSnapshot, getServerSnapshot)
}

/** Current time floored to the minute (ms), or null during SSR/hydration. */
export function useNowMinute(): number | null {
  return useSyncExternalStore(minuteClock.subscribe, minuteClock.getSnapshot, getServerSnapshot)
}

/**
 * True when `sinceMs` is more than `thresholdMs` in the past. Re-renders the
 * caller only when the answer flips, not every second.
 */
export function useIsOlderThan(sinceMs: number | null, thresholdMs: number): boolean {
  return useSyncExternalStore(
    secondClock.subscribe,
    () => sinceMs != null && secondClock.getSnapshot() - sinceMs > thresholdMs,
    () => false,
  )
}
