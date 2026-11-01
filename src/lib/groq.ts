import type { Segment, Word } from './types'

const API = 'https://api.groq.com/openai/v1'

export type GroqErrorKind = 'auth' | 'rate' | 'rejected' | 'server' | 'network'

export class GroqError extends Error {
  constructor(
    readonly kind: GroqErrorKind,
    message: string,
    /** Seconds Groq asked us to wait, for rate limits. */
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'GroqError'
  }
}

export interface TranscribeOptions {
  apiKey: string
  model: string
  language?: string
  prompt?: string
  signal?: AbortSignal
}

export interface TranscribeResponse {
  language?: string
  segments: Segment[]
  words: Word[]
}

interface RawResponse {
  language?: string
  segments?: { text: string; start: number; end: number }[]
  words?: { word: string; start: number; end: number }[]
}

export async function transcribe(
  audio: Blob,
  filename: string,
  options: TranscribeOptions,
): Promise<TranscribeResponse> {
  const form = new FormData()
  form.append('file', audio, filename)
  form.append('model', options.model)
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')
  form.append('temperature', '0')
  if (options.language) form.append('language', options.language)
  if (options.prompt) form.append('prompt', options.prompt)

  const response = await request(`${API}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}` },
    body: form,
    signal: options.signal,
  })
  const raw = (await response.json()) as RawResponse
  return {
    language: raw.language,
    segments: (raw.segments ?? []).map(({ text, start, end }) => ({ text, start, end })),
    words: (raw.words ?? []).map(({ word, start, end }) => ({ text: word, start, end })),
  }
}

/** Confirms a key works without spending any audio quota. */
export async function checkKey(apiKey: string): Promise<void> {
  await request(`${API}/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
}

async function request(url: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new GroqError('network', 'Could not reach Groq. Check your connection.')
  }
  if (response.ok) return response

  const message = await errorMessage(response)
  if (response.status === 401 || response.status === 403) {
    throw new GroqError('auth', 'Groq rejected this API key. Check it and try again.')
  }
  if (response.status === 429) {
    throw new GroqError('rate', message, parseRetryAfter(response.headers, message))
  }
  if (response.status >= 500) throw new GroqError('server', message)
  throw new GroqError('rejected', message)
}

async function errorMessage(response: Response): Promise<string> {
  const fallback = `Groq returned ${response.status}.`
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Browsers hide Retry-After on cross-origin responses unless the server exposes it, so Groq's
 * "try again in 12m3.5s" wording is what usually gets used here.
 */
export function parseRetryAfter(headers: Headers, message: string): number | undefined {
  const header = Number(headers.get('retry-after'))
  if (header > 0) return header
  const match = message.match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i)
  if (!match?.[0] || !(match[1] || match[2] || match[3])) return undefined
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
}
