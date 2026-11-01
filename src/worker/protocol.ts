import type { Segment, Word } from '../lib/types'

export interface StartJob {
  file: File
  apiKey: string
  model: string
  language?: string
  prompt?: string
  /** Seconds to begin decoding from when resuming. */
  startAt: number
  firstIndex: number
  /** Chunks already saved, which only need their audio skipped. */
  doneIndexes: number[]
}

export type WorkerEvent =
  | { type: 'duration'; seconds: number }
  | { type: 'decoded'; seconds: number }
  | {
      type: 'chunk'
      index: number
      start: number
      end: number
      language?: string
      segments: Segment[]
      words: Word[]
      peaks: number[]
    }
  | { type: 'waiting'; seconds: number; reason: 'rate' | 'transient' }
  | { type: 'finished' }
  | { type: 'failed'; kind: 'auth' | 'file' | 'groq'; message: string }
