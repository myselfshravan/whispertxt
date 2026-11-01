import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroqError, parseRetryAfter, transcribe } from '../src/lib/groq'
import { withRetries } from '../src/lib/retry'

const options = { apiKey: 'k', model: 'm' }

function respondWith(status: number, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers })),
  )
}

async function failure(run: () => Promise<unknown>): Promise<GroqError> {
  try {
    await run()
  } catch (error) {
    return error as GroqError
  }
  throw new Error('expected a failure')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('transcribe', () => {
  it('maps a response and asks for word and segment timing', async () => {
    respondWith(200, {
      language: 'English',
      segments: [{ id: 0, text: ' Hi', start: 0, end: 1, tokens: [1] }],
      words: [{ word: 'Hi', start: 0, end: 1 }],
    })
    const result = await transcribe(new Blob(['x']), 'a.ogg', options)
    expect(result).toEqual({
      language: 'English',
      segments: [{ text: ' Hi', start: 0, end: 1 }],
      words: [{ text: 'Hi', start: 0, end: 1 }],
    })
    const body = vi.mocked(fetch).mock.calls[0]?.[1]?.body as unknown as FormData
    expect(body.getAll('timestamp_granularities[]')).toEqual(['word', 'segment'])
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate'],
    [400, 'rejected'],
    [413, 'rejected'],
    [503, 'server'],
  ])('classifies %i as %s', async (status, kind) => {
    respondWith(status, { error: { message: 'nope' } })
    expect((await failure(() => transcribe(new Blob(), 'a.ogg', options))).kind).toBe(kind)
  })

  it('treats a dropped connection as a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    expect((await failure(() => transcribe(new Blob(), 'a.ogg', options))).kind).toBe('network')
  })
})

describe('parseRetryAfter', () => {
  it('prefers the header', () => {
    expect(parseRetryAfter(new Headers({ 'retry-after': '30' }), 'try again in 9s')).toBe(30)
  })

  it('reads the wording in the message', () => {
    expect(parseRetryAfter(new Headers(), 'Please try again in 12m3.5s. Need more?')).toBe(723.5)
    expect(parseRetryAfter(new Headers(), 'try again in 1h2m')).toBe(3720)
  })

  it('returns nothing when no hint exists', () => {
    expect(parseRetryAfter(new Headers(), 'slow down')).toBeUndefined()
  })
})

describe('withRetries', () => {
  const sleep = vi.fn(async () => {})

  it('waits out rate limits for as long as Groq asks', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new GroqError('rate', 'x', 600))
      .mockRejectedValueOnce(new GroqError('rate', 'x', 600))
      .mockResolvedValue('ok')
    const onWait = vi.fn()
    await expect(withRetries(run, { sleep, onWait })).resolves.toBe('ok')
    expect(onWait).toHaveBeenCalledWith(601, 'rate')
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('gives up on repeated server errors', async () => {
    const run = vi.fn().mockRejectedValue(new GroqError('server', 'x'))
    await expect(withRetries(run, { sleep })).rejects.toThrow()
    expect(run).toHaveBeenCalledTimes(5)
  })

  it.each(['auth', 'rejected'] as const)('never retries %s errors', async (kind) => {
    const run = vi.fn().mockRejectedValue(new GroqError(kind, 'x'))
    await expect(withRetries(run, { sleep })).rejects.toThrow()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
