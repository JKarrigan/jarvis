'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import './globals.css'

/**
 * Last-resort boundary: replaces the root layout when it (or anything not
 * caught by a nested error.tsx) throws. Must render its own <html>/<body> and
 * cannot export metadata, so the title is set with a React <title>.
 */
export default function GlobalError({
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
    <html lang="en" className="h-full antialiased dark">
      <body className="h-full">
        <title>Something went wrong · Home</title>
        <main className="flex min-h-full flex-col items-center justify-center gap-5 px-6 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400 text-xl font-bold text-zinc-900" aria-hidden="true">
            !
          </span>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-zinc-100">Something went wrong</h1>
            <p className="max-w-sm text-sm text-zinc-400">
              The app hit an unexpected error. Try again, or reload the page if it keeps happening.
            </p>
            {error.digest && <p className="font-mono text-xs text-zinc-500">Error ID: {error.digest}</p>}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="h-10 rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-zinc-900 hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              Try again
            </button>
            {/* A full document load, not <Link>: the root layout itself may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="grid h-10 place-items-center rounded-xl border border-white/10 px-4 text-sm font-medium text-zinc-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
