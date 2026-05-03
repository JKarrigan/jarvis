'use client'

import { useState } from 'react'

interface SetupScreenProps {
  onSave: (ip: string) => void
}

const VALID_HOST = (h: string) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.local$/.test(h)

export function SetupScreen({ onSave }: SetupScreenProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ip = value.trim()
    if (!VALID_HOST(ip)) {
      setError('Enter an IP (192.168.1.42) or mDNS hostname (airgradient_abc123.local)')
      return
    }
    setError('')
    localStorage.setItem('ag-device-ip', ip)
    onSave(ip)
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Connect your AirGradient</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Enter the IP address or mDNS hostname of your AirGradient One.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600">How to connect</p>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li className="flex gap-2">
              <span className="text-zinc-600 shrink-0">1.</span>
              Try the mDNS hostname first — it&apos;s on the device label or shown on its display:{' '}
              <code className="font-mono text-zinc-300">airgradient_SERIALNO.local</code>
            </li>
            <li className="flex gap-2">
              <span className="text-zinc-600 shrink-0">2.</span>
              If that doesn&apos;t work, find the IP in your router&apos;s admin panel under &ldquo;Connected Devices.&rdquo;
            </li>
            <li className="flex gap-2">
              <span className="text-zinc-600 shrink-0">3.</span>
              Not on your network yet? Hold the button until the device creates a hotspot, then configure Wi-Fi via the captive portal.
            </li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-1.5">
              IP Address or Hostname
            </label>
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="airgradient_abc123.local"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition-colors"
            />
            {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm py-2.5 transition-colors"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  )
}
