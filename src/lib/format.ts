import type { Segment, Transcript } from './types'

export const EXPORT_FORMATS = ['txt', 'srt', 'vtt', 'json'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

/** Rounds to whole milliseconds first so 1.9996 becomes 00:00:02,000, never 00:00:01,1000. */
export function subtitleTime(seconds: number, separator: ',' | '.'): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const ms = totalMs % 1000
  const totalSeconds = (totalMs - ms) / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${separator}${pad(ms, 3)}`
}

function cues(segments: Segment[]): Segment[] {
  return segments.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text)
}

export function toSrt(segments: Segment[]): string {
  return cues(segments)
    .map(
      (s, i) =>
        `${i + 1}\n${subtitleTime(s.start, ',')} --> ${subtitleTime(s.end, ',')}\n${s.text}\n`,
    )
    .join('\n')
}

export function toVtt(segments: Segment[]): string {
  const body = cues(segments)
    .map((s) => `${subtitleTime(s.start, '.')} --> ${subtitleTime(s.end, '.')}\n${s.text}\n`)
    .join('\n')
  return `WEBVTT\n\n${body}`
}

export function render(transcript: Transcript, format: ExportFormat): string {
  switch (format) {
    case 'txt':
      return `${transcript.text.trim()}\n`
    case 'srt':
      return toSrt(transcript.segments)
    case 'vtt':
      return toVtt(transcript.segments)
    case 'json': {
      const { name, duration, model, detectedLanguage, text, segments, words } = transcript
      const payload = { name, duration, model, language: detectedLanguage, text, segments, words }
      return `${JSON.stringify(payload, null, 2)}\n`
    }
  }
}

export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

export function humanDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)} hr ${rest} min` : `${minutes / 60} hr`
}
