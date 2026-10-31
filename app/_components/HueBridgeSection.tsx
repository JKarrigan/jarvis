'use client'

import { useEffect, useRef, useState } from 'react'

interface HueStatus {
  configured: boolean
  ip: string | null
  reachable: boolean
}

type ConnectState = 'idle' | 'waiting' | 'success' | 'timeout' | 'error'

const inputCls = 'rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:border-amber-500 focus:outline-none transition-colors disabled:opacity-50'

const REGISTER_TIMEOUT_MS = 30_000
const REGISTER_INTERVAL_MS = 2_000

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason) }, { once: true })
  })
}

export function HueBridgeSection() {
  const [status, setStatus] = useState<HueStatus | null>(null)
  const [ipInput, setIpInput] = useState('')
  const [connectState, setConnectState] = useState<ConnectState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/hue/status', { signal: ac.signal })
      .then(r => r.json() as Promise<HueStatus>)
      .then(s => {
        setStatus(s)
        if (s.ip) setIpInput(s.ip)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  // Abort a running registration when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), [])

  /**
   * Registration loop: one request at a time (never overlapping, so the bridge
   * never creates duplicate users), every 2 s until the link button is pressed,
   * the 30 s deadline passes, the bridge reports a real error, or the user cancels.
   */
  async function handleConnect() {
    const ip = ipInput.trim()
    if (!ip) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setConnectState('waiting')
    setErrorMsg('')
    const deadline = Date.now() + REGISTER_TIMEOUT_MS

    try {
      while (true) {
        let data: { ok: boolean; reason?: string } | null = null
        try {
          const res = await fetch('/api/hue/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip }),
            signal: ac.signal,
          })
          data = await res.json() as { ok: boolean; reason?: string }
        } catch (err) {
          if (ac.signal.aborted) throw err
          data = null // network hiccup: keep trying until the deadline
        }

        if (data?.ok) {
          setConnectState('success')
          setStatus({ configured: true, ip, reachable: true })
          return
        }
        if (data && data.reason !== 'press_button') {
          setConnectState('error')
          setErrorMsg(data.reason === 'missing_ip' ? 'Enter the bridge IP address' : data.reason ?? 'Unknown error')
          return
        }
        if (Date.now() + REGISTER_INTERVAL_MS > deadline) {
          setConnectState('timeout')
          return
        }
        await sleep(REGISTER_INTERVAL_MS, ac.signal)
      }
    } catch {
      // Aborted by Cancel / unmount; handleReset already reset the UI.
    } finally {
      if (abortRef.current === ac) abortRef.current = null
    }
  }

  function handleReset() {
    abortRef.current?.abort()
    abortRef.current = null
    setConnectState('idle')
    setErrorMsg('')
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800/60">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Hue Bridge</h2>
      </div>
      <div className="p-5 space-y-5">
        {status === null ? (
          <div className="h-8 w-40 rounded bg-zinc-800 animate-pulse" />
        ) : (
          <>
            <div className="flex items-center justify-between gap-6">
              <div className="min-w-0">
                <p className="text-sm text-zinc-200">Bridge Status</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {!status.configured
                    ? 'Not connected'
                    : status.reachable
                    ? `Connected — ${status.ip}`
                    : `Unreachable — ${status.ip}`}
                </p>
              </div>
              <span aria-hidden className={`shrink-0 h-2 w-2 rounded-full ${
                !status.configured ? 'bg-zinc-600' :
                status.reachable ? 'bg-amber-400' : 'bg-red-500'
              }`} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="hue-bridge-ip" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Bridge IP Address</label>
              <div className="flex gap-2">
                <input
                  id="hue-bridge-ip"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={ipInput}
                  onChange={e => setIpInput(e.target.value)}
                  placeholder="192.168.1.x"
                  disabled={connectState === 'waiting'}
                  className={`flex-1 ${inputCls}`}
                />
                {connectState === 'idle' || connectState === 'error' || connectState === 'timeout' ? (
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={!ipInput.trim()}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Connect
                  </button>
                ) : connectState === 'waiting' ? (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm transition-colors hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>

            {connectState === 'waiting' && (
              <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <p className="text-sm text-amber-300 font-medium">Press the button on your Hue Bridge now</p>
                <p className="text-xs text-amber-400/70 mt-1">Waiting up to 30 seconds…</p>
              </div>
            )}
            {connectState === 'success' && (
              <p role="status" className="text-sm text-emerald-400">Bridge connected successfully.</p>
            )}
            {connectState === 'timeout' && (
              <p role="alert" className="text-sm text-red-400">Timed out — try again and press the button within 30 seconds.</p>
            )}
            {connectState === 'error' && errorMsg && (
              <p role="alert" className="text-sm text-red-400">{errorMsg}</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
