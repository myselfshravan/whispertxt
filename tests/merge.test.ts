import { describe, expect, it } from 'vitest'
import { joinText, mergeChunks, tokenize } from '../src/lib/merge'
import type { ChunkResult } from '../src/lib/types'

const first: ChunkResult = {
  index: 0,
  start: 0,
  end: 302,
  segments: [
    { text: 'Before the seam.', start: 290, end: 295 },
    { text: 'Crossing the seam', start: 299, end: 302 },
  ],
  words: [
    { text: 'Before', start: 290, end: 291 },
    { text: 'the', start: 291, end: 292 },
    { text: 'seam', start: 292, end: 295 },
    { text: 'Crossing', start: 299, end: 300.5 },
    { text: 'the', start: 300.5, end: 301.5 },
    { text: 'seam', start: 301.5, end: 302 },
  ],
}

const second: ChunkResult = {
  index: 1,
  start: 300,
  end: 400,
  segments: [
    { text: 'the seam', start: 300.5, end: 302 },
    { text: 'After it.', start: 303, end: 305 },
  ],
  words: [
    { text: 'the', start: 300.5, end: 301.5 },
    { text: 'seam', start: 301.5, end: 302 },
    { text: 'After', start: 303, end: 304 },
    { text: 'it', start: 304, end: 305 },
  ],
}

describe('mergeChunks', () => {
  it('keeps every word exactly once across a seam', () => {
    const { words } = mergeChunks([first, second])
    expect(words.map((w) => w.text).join(' ')).toBe('Before the seam Crossing the seam After it')
  })

  it('keeps time running forward', () => {
    const { segments, words } = mergeChunks([second, first])
    for (const list of [segments, words]) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i]?.start).toBeGreaterThanOrEqual(list[i - 1]?.start ?? 0)
      }
    }
  })

  it('does not repeat speech in the joined text', () => {
    const { segments } = mergeChunks([first, second])
    expect(joinText(segments)).toBe('Before the seam. Crossing the seam After it.')
  })

  it('keeps a lone chunk untouched', () => {
    expect(mergeChunks([first]).segments).toEqual(first.segments)
  })

  it('leaves the edges open around a chunk that has not finished yet', () => {
    const third = { ...second, index: 2, start: 600, end: 700 }
    const { words } = mergeChunks([first, third])
    expect(words).toHaveLength(first.words.length + third.words.length)
  })
})

describe('tokenize', () => {
  it('shows punctuated text with word timings', () => {
    const tokens = tokenize({ text: 'Hello, world.', start: 0, end: 2 }, [
      { text: 'Hello', start: 0, end: 1 },
      { text: 'world', start: 1, end: 2 },
    ])
    expect(tokens).toEqual([
      { text: 'Hello,', start: 0, end: 1 },
      { text: 'world.', start: 1, end: 2 },
    ])
  })

  it('spreads time by length when the word list does not line up', () => {
    const tokens = tokenize({ text: 'aa bb', start: 10, end: 12 }, [])
    expect(tokens.map((t) => t.start)).toEqual([10, 11])
    expect(tokens.at(-1)?.end).toBe(12)
  })
})
