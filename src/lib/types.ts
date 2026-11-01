export interface Word {
  text: string
  start: number
  end: number
}

export interface Segment {
  text: string
  start: number
  end: number
}

/** One transcribed window of audio. Times are relative to the whole file. */
export interface ChunkResult {
  index: number
  start: number
  end: number
  language?: string
  segments: Segment[]
  words: Word[]
}

export type TranscriptStatus = 'queued' | 'processing' | 'stopped' | 'done'

export interface Transcript {
  id: string
  name: string
  createdAt: number
  fingerprint: string
  size: number
  mimeType: string
  status: TranscriptStatus
  /** Why a stopped transcript stopped. */
  error?: string
  model: string
  language?: string
  prompt?: string
  detectedLanguage?: string
  duration: number
  peaks: number[]
  text: string
  segments: Segment[]
  words: Word[]
}

export interface StoredChunk extends ChunkResult {
  transcriptId: string
  peaks: number[]
}
