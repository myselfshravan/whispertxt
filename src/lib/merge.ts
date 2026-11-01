import { OVERLAP_SECONDS } from './constants'
import type { ChunkResult, Segment, Word } from './types'

/**
 * Joins chunks into one timeline. Neighbouring chunks share OVERLAP_SECONDS of audio, so each
 * seam sits in the middle of that overlap and every word is kept from exactly one side.
 */
export function mergeChunks(chunks: ChunkResult[]): { segments: Segment[]; words: Word[] } {
  const ordered = [...chunks].sort((a, b) => a.index - b.index)
  const segments: Segment[] = []
  const words: Word[] = []

  ordered.forEach((chunk, i) => {
    const previous = ordered[i - 1]
    const next = ordered[i + 1]
    const low = previous?.index === chunk.index - 1 ? seam(previous) : -Infinity
    const high = next?.index === chunk.index + 1 ? seam(chunk) : Infinity

    const kept = chunk.words.filter((w) => w.start >= low && w.start < high)
    words.push(...kept)

    for (const segment of chunk.segments) {
      const insideWindow = segment.start >= low && segment.end <= high
      if (insideWindow) {
        segments.push(segment)
        continue
      }
      const trimmed = trimToWords(segment, kept)
      if (trimmed) segments.push(trimmed)
      else if (kept.length === 0 && midpoint(segment) >= low && midpoint(segment) < high) {
        segments.push(segment)
      }
    }
  })

  return { segments, words }
}

function seam(chunk: ChunkResult): number {
  return chunk.end - OVERLAP_SECONDS / 2
}

function midpoint(segment: Segment): number {
  return (segment.start + segment.end) / 2
}

/** Rebuilds a segment that crosses a seam from the words kept on this side of it. */
function trimToWords(segment: Segment, kept: Word[]): Segment | null {
  const inside = kept.filter((w) => w.start >= segment.start && w.start < segment.end)
  const first = inside[0]
  const last = inside.at(-1)
  if (!first || !last) return null
  return {
    text: inside.map((w) => w.text.trim()).join(' '),
    start: first.start,
    end: last.end,
  }
}

export function joinText(segments: Segment[]): string {
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(' ')
}

export interface Token {
  text: string
  start: number
  end: number
}

/**
 * Splits a segment into displayed words with times. Groq's word list drops punctuation, so the
 * segment text is what gets shown. Times come from the word list when the counts line up and are
 * spread evenly by length when they do not.
 */
export function tokenize(segment: Segment, words: Word[]): Token[] {
  const parts = segment.text.trim().split(/\s+/).filter(Boolean)
  const timed = words.filter((w) => w.start >= segment.start && w.start < segment.end)

  if (timed.length === parts.length) {
    return parts.map((text, i) => {
      const word = timed[i] as Word
      return { text, start: word.start, end: word.end }
    })
  }

  const totalLength = parts.reduce((sum, part) => sum + part.length, 0) || 1
  const duration = segment.end - segment.start
  let cursor = segment.start
  return parts.map((text) => {
    const start = cursor
    cursor += (text.length / totalLength) * duration
    return { text, start, end: cursor }
  })
}
