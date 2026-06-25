'use client'

import { useCallback, useMemo, useState } from 'react'
import { FilterDropdown } from './FilterDropdown'
import type { MediaInfo, MediaVersion } from './types'

/** Selection state for which version/audio/subtitle a title will play with. */
export interface PlaybackSelection {
  versions: MediaVersion[]
  version: MediaVersion | null
  versionId: string
  selectVersion: (id: string) => void
  /** Selected audio stream index (Jellyfin AudioStreamIndex). */
  audioIndex?: number
  setAudioIndex: (i: number) => void
  /** Selected subtitle stream index, or null for "Off". */
  subtitleIndex: number | null
  setSubtitleIndex: (i: number | null) => void
}

/** Manages version/audio/subtitle selection, initialised to each version's defaults. */
export function usePlaybackSelection(media: MediaInfo | null): PlaybackSelection {
  const versions = useMemo(() => media?.versions ?? [], [media])
  const first = versions[0]
  const [versionId, setVersionId] = useState(first?.id ?? '')
  const version = versions.find(v => v.id === versionId) ?? first ?? null
  const [audioIndex, setAudioIndex] = useState<number | undefined>(
    first ? first.defaultAudioIndex ?? first.audio[0]?.index : undefined,
  )
  const [subtitleIndex, setSubtitleIndex] = useState<number | null>(first?.defaultSubtitleIndex ?? null)

  // Stream indices are per-source, so switching version resets audio/subtitle to its defaults.
  const selectVersion = useCallback(
    (id: string) => {
      const v = versions.find(x => x.id === id)
      setVersionId(id)
      setAudioIndex(v ? v.defaultAudioIndex ?? v.audio[0]?.index : undefined)
      setSubtitleIndex(v?.defaultSubtitleIndex ?? null)
    },
    [versions],
  )

  return { versions, version, versionId, selectVersion, audioIndex, setAudioIndex, subtitleIndex, setSubtitleIndex }
}

const OFF = 'off'

/** Version / Audio / Subtitle dropdown row. Renders nothing when there's nothing to choose. */
export function PlaybackPicker({ selection }: { selection: PlaybackSelection }) {
  const { versions, version, versionId, selectVersion, audioIndex, setAudioIndex, subtitleIndex, setSubtitleIndex } =
    selection
  if (!version) return null

  const showVersions = versions.length > 1
  const showAudio = version.audio.length > 1
  const showSubs = version.subtitles.length > 0
  if (!showVersions && !showAudio && !showSubs) return null

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2.5">
      {showVersions && (
        <FilterDropdown
          label="Version"
          value={versionId}
          options={versions.map(v => ({ value: v.id, label: v.name }))}
          onChange={selectVersion}
        />
      )}
      {showAudio && (
        <FilterDropdown
          label="Audio"
          value={String(audioIndex ?? '')}
          options={version.audio.map(a => ({ value: String(a.index), label: a.label }))}
          onChange={v => setAudioIndex(Number(v))}
        />
      )}
      {showSubs && (
        <FilterDropdown
          label="Subtitles"
          value={subtitleIndex == null ? OFF : String(subtitleIndex)}
          options={[
            { value: OFF, label: 'Off' },
            ...version.subtitles.map(s => ({ value: String(s.index), label: s.label })),
          ]}
          onChange={v => setSubtitleIndex(v === OFF ? null : Number(v))}
        />
      )}
    </div>
  )
}
