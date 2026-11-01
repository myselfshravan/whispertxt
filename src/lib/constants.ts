export const SAMPLE_RATE = 16_000
/** New audio per chunk. Five minutes of 32 kbps Opus is about 1.2 MB. */
export const CHUNK_SECONDS = 300
/** Audio repeated across a chunk seam so no word is cut in half. */
export const OVERLAP_SECONDS = 2
export const PEAKS_PER_SECOND = 2
export const MAX_PARALLEL_UPLOADS = 3
/** Larger sources are not kept in the browser, so they cannot be replayed after a reload. */
export const MAX_STORED_SOURCE_BYTES = 500 * 1024 * 1024

export const MODELS = [
  { id: 'whisper-large-v3-turbo', label: 'Turbo', hint: 'Faster and cheaper' },
  { id: 'whisper-large-v3', label: 'Large v3', hint: 'Most accurate, slower' },
] as const

export const DEFAULT_MODEL = MODELS[0].id
