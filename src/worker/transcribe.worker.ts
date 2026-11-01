import { decodeToPcm, NoAudioError, UnreadableError } from '../lib/audio/decode'
import { encodeChunk } from '../lib/audio/encode'
import { type AudioWindow, WindowBuilder } from '../lib/audio/windows'
import { MAX_PARALLEL_UPLOADS, SAMPLE_RATE } from '../lib/constants'
import { GroqError, transcribe } from '../lib/groq'
import { withRetries } from '../lib/retry'
import type { Segment, Word } from '../lib/types'
import type { StartJob, WorkerEvent } from './protocol'

const post = (event: WorkerEvent) => self.postMessage(event)

self.onmessage = (message: MessageEvent<StartJob>) => {
  run(message.data).catch((error: unknown) => post(toFailure(error)))
}

async function run(job: StartJob): Promise<void> {
  const done = new Set(job.doneIndexes)
  const windows = new WindowBuilder(job.firstIndex)
  const uploads = new Set<Promise<void>>()
  let failure: unknown
  let decoded = job.startAt

  const submit = async (window: AudioWindow) => {
    if (done.has(window.index)) return
    while (uploads.size >= MAX_PARALLEL_UPLOADS) await Promise.race(uploads)
    if (failure) throw failure

    const upload = send(job, window)
      .catch((error: unknown) => {
        failure = error
      })
      .finally(() => {
        uploads.delete(upload)
      })
    uploads.add(upload)
  }

  const onDuration = (seconds: number) => post({ type: 'duration', seconds })
  for await (const pcm of decodeToPcm(job.file, job.startAt, onDuration)) {
    decoded += pcm.length / SAMPLE_RATE
    post({ type: 'decoded', seconds: decoded })
    for (const window of windows.push(pcm)) await submit(window)
  }

  const tail = windows.flush()
  if (tail) await submit(tail)
  else if (decoded === job.startAt && job.firstIndex === 0) throw new UnreadableError()

  await Promise.all(uploads)
  if (failure) throw failure
  post({ type: 'finished' })
}

async function send(job: StartJob, window: AudioWindow): Promise<void> {
  const { blob, extension } = await encodeChunk(window.samples)
  const name = `chunk-${String(window.index).padStart(4, '0')}.${extension}`
  const result = await withRetries(
    () =>
      transcribe(blob, name, {
        apiKey: job.apiKey,
        model: job.model,
        language: job.language,
        prompt: job.prompt,
      }),
    { onWait: (seconds, reason) => post({ type: 'waiting', seconds, reason }) },
  )

  post({
    type: 'chunk',
    index: window.index,
    start: window.start,
    end: window.end,
    language: result.language,
    segments: result.segments.map((s) => shift(s, window.start)),
    words: result.words.map((w) => shift(w, window.start)),
    peaks: window.peaks,
  })
}

/** Groq times each chunk from zero. Moving them onto the file's timeline keeps subtitles right. */
function shift<T extends Segment | Word>(item: T, offset: number): T {
  return { ...item, start: item.start + offset, end: item.end + offset }
}

function toFailure(error: unknown): WorkerEvent {
  if (error instanceof GroqError) {
    return { type: 'failed', kind: error.kind === 'auth' ? 'auth' : 'groq', message: error.message }
  }
  if (error instanceof NoAudioError || error instanceof UnreadableError) {
    return { type: 'failed', kind: 'file', message: error.message }
  }
  const detail = error instanceof Error ? error.message : String(error)
  return { type: 'failed', kind: 'file', message: `This file could not be processed: ${detail}` }
}
