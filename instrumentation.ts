/**
 * Runs once when a Next.js server instance starts (see
 * node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
 * Background jobs live in lib/startup.ts; they need Node APIs (SQLite, timers),
 * so they are only loaded in the Node.js runtime and never during `next build`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  try {
    const { startBackgroundJobs } = await import('./lib/startup')
    startBackgroundJobs()
  } catch (err) {
    console.error('[instrumentation] failed to start background jobs', err)
  }
}
