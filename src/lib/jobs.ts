import { useSyncExternalStore } from 'react'
import type { StartJob, WorkerEvent } from '../worker/protocol'
import { CHUNK_SECONDS, MAX_STORED_SOURCE_BYTES, PEAKS_PER_SECOND } from './constants'
import { db } from './db'
import { joinText, mergeChunks } from './merge'
import { getSettings } from './settings'
import type { StoredChunk, Transcript } from './types'

export interface LiveJob {
  id: string
  /** Seconds of audio read so far. */
  decoded: number
  /** Length of the file, when its container says. */
  total?: number
  /** Unix ms when a Groq wait ends. */
  waitUntil?: number
  waitReason?: 'rate' | 'transient'
}

type Listener = () => void

const listeners = new Set<Listener>()
let live: LiveJob | null = null
/** Files for this tab's queued jobs. The source table covers anything too big to store. */
const pendingFiles = new Map<string, File>()
const queue: string[] = []
let worker: Worker | null = null
let authFailureHandler: (() => void) | null = null

function setLive(next: LiveJob | null): void {
  live = next
  for (const listener of listeners) listener()
}

export function useLiveJob(): LiveJob | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => live,
  )
}

export function onAuthFailure(handler: () => void): void {
  authFailureHandler = handler
}

function fingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

/** Queues a file. Dropping a file whose job was interrupted picks that job up again. */
export async function addFile(file: File): Promise<string> {
  const print = fingerprint(file)
  const existing = await db.transcripts.where('fingerprint').equals(print).first()
  if (existing && existing.status !== 'done') {
    pendingFiles.set(existing.id, file)
    await resume(existing.id)
    return existing.id
  }

  const settings = getSettings()
  const id = crypto.randomUUID()
  await db.transcripts.add({
    id,
    name: file.name,
    createdAt: Date.now(),
    fingerprint: print,
    size: file.size,
    mimeType: file.type,
    status: 'queued',
    model: settings.model,
    language: settings.language || undefined,
    prompt: settings.prompt || undefined,
    duration: 0,
    peaks: [],
    text: '',
    segments: [],
    words: [],
  })
  if (file.size <= MAX_STORED_SOURCE_BYTES) {
    await db.sources.put({ transcriptId: id, file })
  }
  pendingFiles.set(id, file)
  queue.push(id)
  void runNext()
  return id
}

/** A reload kills the worker, so anything still marked as running has really stopped. */
export async function recoverInterrupted(): Promise<void> {
  const running = await db.transcripts
    .filter((t) => t.status === 'processing' || t.status === 'queued')
    .toArray()
  await Promise.all(
    running
      .filter((t) => t.id !== live?.id && !queue.includes(t.id))
      .map((t) =>
        db.transcripts.update(t.id, {
          status: 'stopped',
          error: 'Interrupted. Finished parts are saved.',
        }),
      ),
  )
}

export async function resume(id: string): Promise<void> {
  if (live?.id === id || queue.includes(id)) return
  await db.transcripts.update(id, { status: 'queued', error: undefined })
  queue.push(id)
  void runNext()
}

export async function canResume(id: string): Promise<boolean> {
  return pendingFiles.has(id) || (await db.sources.get(id)) !== undefined
}

export function stop(id: string): Promise<void> {
  if (live?.id === id) {
    worker?.terminate()
    worker = null
    return finishRun(id, { status: 'stopped', error: 'Stopped. Finished parts are saved.' })
  }
  const position = queue.indexOf(id)
  if (position >= 0) queue.splice(position, 1)
  return db.transcripts.update(id, { status: 'stopped' }).then(() => {})
}

async function runNext(): Promise<void> {
  if (live) return
  const id = queue.shift()
  if (!id) return
  setLive({ id, decoded: 0 })

  const file = pendingFiles.get(id) ?? (await db.sources.get(id))?.file
  const transcript = await db.transcripts.get(id)
  if (!file || !transcript) {
    await finishRun(id, { status: 'stopped', error: 'Drop the same file again to continue.' })
    return
  }
  await db.transcripts.update(id, { status: 'processing' })

  const chunks = await chunksFor(id)
  const doneIndexes = chunks.map((c) => c.index)
  const firstIndex = firstMissing(doneIndexes)
  const job: StartJob = {
    file,
    apiKey: getSettings().apiKey,
    model: transcript.model,
    language: transcript.language,
    prompt: transcript.prompt,
    startAt: firstIndex * CHUNK_SECONDS,
    firstIndex,
    doneIndexes,
  }

  worker = new Worker(new URL('../worker/transcribe.worker.ts', import.meta.url), {
    type: 'module',
  })
  // Handlers write to IndexedDB, so they must run in order or `finished` can overtake a chunk.
  let handled = Promise.resolve()
  worker.onmessage = (message: MessageEvent<WorkerEvent>) => {
    handled = handled.then(() => handle(id, message.data))
  }
  worker.onerror = (event) => {
    void finishRun(id, { status: 'stopped', error: event.message })
  }
  worker.postMessage(job)
}

async function chunksFor(id: string): Promise<StoredChunk[]> {
  return db.chunks.where('transcriptId').equals(id).sortBy('index')
}

function firstMissing(indexes: number[]): number {
  const done = new Set(indexes)
  let index = 0
  while (done.has(index)) index += 1
  return index
}

async function handle(id: string, event: WorkerEvent): Promise<void> {
  switch (event.type) {
    case 'duration':
      if (live?.id === id) setLive({ ...live, total: event.seconds })
      return
    case 'decoded':
      if (live?.id === id) setLive({ ...live, decoded: event.seconds })
      return
    case 'waiting':
      if (live?.id === id) {
        setLive({
          ...live,
          waitUntil: Date.now() + event.seconds * 1000,
          waitReason: event.reason,
        })
      }
      return
    case 'chunk': {
      const { type: _type, ...chunk } = event
      await db.chunks.put({ ...chunk, transcriptId: id })
      await refresh(id)
      if (live?.id === id) setLive({ ...live, waitUntil: undefined, waitReason: undefined })
      return
    }
    case 'finished':
      await refresh(id)
      await db.chunks.where('transcriptId').equals(id).delete()
      await finishRun(id, { status: 'done' })
      return
    case 'failed':
      await finishRun(id, { status: 'stopped', error: event.message })
      if (event.kind === 'auth') authFailureHandler?.()
      return
  }
}

/** Rebuilds the visible transcript from every chunk saved so far. */
async function refresh(id: string): Promise<void> {
  const chunks = await chunksFor(id)
  const { segments, words } = mergeChunks(chunks)
  const last = chunks.at(-1)
  await db.transcripts.update(id, {
    segments,
    words,
    text: joinText(segments),
    peaks: placePeaks(chunks),
    duration: last?.end ?? 0,
    detectedLanguage: chunks[0]?.language,
  })
}

/** Lays peaks out by position, since chunks can finish out of order. */
function placePeaks(chunks: StoredChunk[]): number[] {
  const peaks: number[] = []
  for (const chunk of chunks) {
    const offset = chunk.index * CHUNK_SECONDS * PEAKS_PER_SECOND
    chunk.peaks.forEach((peak, i) => {
      peaks[offset + i] = peak
    })
  }
  return Array.from(peaks, (peak) => peak ?? 0)
}

async function finishRun(id: string, patch: Partial<Transcript>): Promise<void> {
  worker?.terminate()
  worker = null
  await db.transcripts.update(id, patch)
  pendingFiles.delete(id)
  setLive(null)
  void runNext()
}
