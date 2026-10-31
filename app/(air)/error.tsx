'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Link from 'next/link'

export default function AirError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-red-500/30 bg-zinc-900/60 p-8 space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-zinc-100">Something went wrong</h1>
          <p className="text-sm text-zinc-400">
            This page hit an unexpected error. The sensor keeps logging in the background — nothing was lost.
          </p>
          {error.digest && <p className="text-xs font-mono text-zinc-500">Ref {error.digest}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm px-4 py-2 transition-colors"
          >
            Try again
          </button>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
