import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { exportLibrary, importLibrary } from '../lib/backup'
import { db, deleteTranscript } from '../lib/db'
import { download } from '../lib/download'
import { clock, humanDuration } from '../lib/format'
import type { Segment, Transcript } from '../lib/types'

const MAX_HITS_PER_TRANSCRIPT = 3

function statusLabel(transcript: Transcript): string {
  switch (transcript.status) {
    case 'queued':
      return 'Waiting to start'
    case 'processing':
      return 'Transcribing'
    case 'stopped':
      return 'Stopped'
    case 'done':
      return humanDuration(transcript.duration)
  }
}

function hitsIn(transcript: Transcript, query: string): Segment[] {
  const needle = query.toLowerCase()
  return transcript.segments
    .filter((segment) => segment.text.toLowerCase().includes(needle))
    .slice(0, MAX_HITS_PER_TRANSCRIPT)
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  )
}

export function Library() {
  const transcripts = useLiveQuery(() => db.transcripts.orderBy('createdAt').reverse().toArray())
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())

  const matches = useMemo(() => {
    const all = transcripts ?? []
    if (!deferredQuery) return all.map((transcript) => ({ transcript, hits: [] as Segment[] }))
    const needle = deferredQuery.toLowerCase()
    return all
      .map((transcript) => ({ transcript, hits: hitsIn(transcript, deferredQuery) }))
      .filter(
        ({ transcript, hits }) => hits.length > 0 || transcript.name.toLowerCase().includes(needle),
      )
  }, [transcripts, deferredQuery])

  if (!transcripts) return null
  if (transcripts.length === 0) return <GettingStarted />

  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-10">
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <h2 className="mr-auto font-bold text-3xl tracking-tight">Your transcripts</h2>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search every word"
          aria-label="Search transcripts"
          className="w-full rounded-full border-2 border-line bg-transparent px-5 py-2.5 sm:w-72"
        />
      </div>

      {matches.length === 0 && <p className="py-8 text-soft">Nothing matches “{deferredQuery}”.</p>}

      <ul className="divide-y divide-line">
        {matches.map(({ transcript, hits }) => (
          <li key={transcript.id} className="group flex items-start gap-4 py-4">
            <div className="min-w-0 flex-1">
              <Link
                to="/t/$id"
                params={{ id: transcript.id }}
                className="block truncate font-semibold text-lg hover:underline"
              >
                {transcript.name}
              </Link>
              <p className="text-soft text-sm">
                {statusLabel(transcript)}, {new Date(transcript.createdAt).toLocaleDateString()}
              </p>
              {hits.map((hit) => (
                <Link
                  key={hit.start}
                  to="/t/$id"
                  params={{ id: transcript.id }}
                  search={{ at: hit.start }}
                  className="mt-2 flex gap-3 font-read text-lg leading-snug"
                >
                  <span className="pt-0.5 font-sans text-soft text-sm tabular-nums">
                    {clock(hit.start)}
                  </span>
                  <span>
                    <Highlighted text={hit.text.trim()} query={deferredQuery} />
                  </span>
                </Link>
              ))}
            </div>
            <DeleteButton id={transcript.id} name={transcript.name} />
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-5 text-soft text-sm">
        <span>Saved only in this browser.</span>
        <button
          type="button"
          className="underline underline-offset-3"
          onClick={async () => {
            download('whispertxt-backup.json', await exportLibrary(), 'application/json')
          }}
        >
          Back up all transcripts
        </button>
        <RestoreBackup />
      </div>
    </section>
  )
}

function RestoreBackup() {
  const [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null)

  return (
    <>
      <button
        type="button"
        className="underline underline-offset-3"
        onClick={() => input.current?.click()}
      >
        Restore a backup
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Choose a backup file"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          try {
            const count = await importLibrary(await file.text())
            setNotice(`Restored ${count} ${count === 1 ? 'transcript' : 'transcripts'}.`)
          } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Could not read that backup.')
          }
        }}
      />
      {notice && <span role="status">{notice}</span>}
    </>
  )
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const [armed, setArmed] = useState(false)
  return (
    <button
      type="button"
      aria-label={armed ? `Confirm deleting ${name}` : `Delete ${name}`}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (armed) void deleteTranscript(id)
        else setArmed(true)
      }}
      className={`shrink-0 rounded-full px-3 py-1 text-sm ${armed ? 'bg-alert font-semibold text-white' : 'text-soft hover:text-ink'}`}
    >
      {armed ? 'Confirm delete' : 'Delete'}
    </button>
  )
}

function GettingStarted() {
  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-10">
      <h2 className="mb-6 font-bold text-3xl tracking-tight">How it works</h2>
      <ol className="grid gap-6 sm:grid-cols-3">
        <li>
          <p className="font-semibold text-lg">1. Add a Groq key</p>
          <p className="text-soft leading-relaxed">
            Groq runs the Whisper model and offers a free tier.
          </p>
        </li>
        <li>
          <p className="font-semibold text-lg">2. Drop a file</p>
          <p className="text-soft leading-relaxed">
            Your browser pulls out the audio and sends it to Groq in small pieces.
          </p>
        </li>
        <li>
          <p className="font-semibold text-lg">3. Read and export</p>
          <p className="text-soft leading-relaxed">
            Follow along word by word, search it, or download it as text or subtitles.
          </p>
        </li>
      </ol>
      <p className="mt-8 text-soft text-sm">
        Moved from another browser? <RestoreBackup />
      </p>
    </section>
  )
}
