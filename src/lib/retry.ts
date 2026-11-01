import { GroqError } from './groq'

const MAX_TRANSIENT_ATTEMPTS = 5
const MAX_BACKOFF_SECONDS = 30
/** Default wait when a 429 gives no hint. */
const RATE_LIMIT_FALLBACK_SECONDS = 60

export interface RetryHooks {
  /** Called before each wait so the interface can show a countdown. */
  onWait?: (seconds: number, reason: 'rate' | 'transient') => void
  sleep?: (seconds: number) => Promise<void>
}

const realSleep = (seconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000))

/**
 * Rate limits wait as long as Groq asks, because the chunk will succeed eventually and giving up
 * would strand the job. Network and server errors get a few tries. Bad keys and rejected files
 * fail straight away, since repeating them cannot help.
 */
export async function withRetries<T>(run: () => Promise<T>, hooks: RetryHooks = {}): Promise<T> {
  const sleep = hooks.sleep ?? realSleep
  let transientFailures = 0

  for (;;) {
    try {
      return await run()
    } catch (error) {
      if (!(error instanceof GroqError)) throw error

      if (error.kind === 'rate') {
        // A second of slack so we do not land just before the window resets.
        const wait = Math.ceil(error.retryAfter ?? RATE_LIMIT_FALLBACK_SECONDS) + 1
        hooks.onWait?.(wait, 'rate')
        await sleep(wait)
        continue
      }

      if (error.kind === 'server' || error.kind === 'network') {
        transientFailures += 1
        if (transientFailures >= MAX_TRANSIENT_ATTEMPTS) throw error
        const wait = Math.min(2 ** transientFailures, MAX_BACKOFF_SECONDS)
        hooks.onWait?.(wait, 'transient')
        await sleep(wait)
        continue
      }

      throw error
    }
  }
}
