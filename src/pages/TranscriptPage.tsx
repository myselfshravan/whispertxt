import { Link, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DownloadMenu } from '../components/DownloadMenu'
import { Header } from '../components/Header'
import { TranscriptBody } from '../components/TranscriptBody'
import { Waveform } from '../components/Waveform'
import { db, deleteTranscript } from '../lib/db'
import { clock, humanDuration } from '../lib/format'
import { canResume, type LiveJob, resume, stop, useLiveJob } from '../lib/jobs'
import type { Transcript } from '../lib/types'
import { transcriptRoute } from '../router'

export function TranscriptPage() {
  const { id } = transcriptRoute.useParams()
  const { at } = transcriptRoute.useSearch()
  const transcript = useLiveQuery(() => db.transcripts.get(id).then((t) => t ?? null), [id])

  if (transcript === undefined) return <Shell />
  if (transcript === null) {
    return (
      <Shell>
        <main className="mx-auto max-w-4xl px-5 py-16 sm:px-10">
          <h1 className="font-bold text-3xl">This transcript is not in this browser</h1>
          <p className="mt-3 text-soft">
            Transcripts are saved on the device that made them.{' '}
            <Link to="/" className="underline underline-offset-3">
              Go to your transcripts
            </Link>
            .
          </p>
        </main>
      </Shell>
    )
  }
  return <Loaded key={id} transcript={transcript} startAt={at} />
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <div className="bg-cobalt px-5 py-5 sm:px-10">
        <Header />
      </div>
      {children}
    </>
  )
}

function useSourceUrl(id: string): string | null {
  const source = useLiveQuery(() => db.sources.get(id), [id])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!source) return
    const objectUrl = URL.createObjectURL(source.file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [source])
  return url
}

function Loaded({ transcript, startAt }: { transcript: Transcript; startAt?: number }) {
  const live = useLiveJob()
  const job = live?.id === transcript.id ? live : null
  const navigate = useNavigate()
  const media = useRef<HTMLAudioElement>(null)
  const sourceUrl = useSourceUrl(transcript.id)
  const [playable, setPlayable] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const canPlay = Boolean(sourceUrl) && playable

  const total = job?.total ?? transcript.duration
  const isWorking = transcript.status === 'processing' || transcript.status === 'queued'

  const seek = useCallback((seconds: number) => {
    const element = media.current
    setTime(seconds)
    if (element) {
      element.currentTime = seconds
      void element.play()
    }
  }, [])

  useEffect(() => {
    if (startAt === undefined) return
    const frame = requestAnimationFrame(() => {
      setTime(startAt)
      if (media.current) media.current.currentTime = startAt
      const sections = document.querySelectorAll<HTMLElement>('section[data-start]')
      const target = [...sections].findLast((s) => Number(s.dataset.start) <= startAt)
      target?.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [startAt])

  return (
    <>
      <div className="bg-cobalt px-5 pt-5 text-white sm:px-10">
        <Header />
        <h1 className="mt-5 break-words font-extrabold text-[clamp(1.6rem,4vw,3rem)] leading-[1.02] tracking-[-0.02em]">
          {transcript.name}
        </h1>
      </div>
      <div className="sticky top-0 z-20 bg-cobalt px-5 py-4 text-white sm:px-10">
        <Waveform
          peaks={transcript.peaks}
          duration={total}
          time={time}
          onSeek={canPlay ? seek : undefined}
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {canPlay && (
            <button
              type="button"
              onClick={() => {
                const element = media.current
                if (!element) return
                if (element.paused) void element.play()
                else element.pause()
              }}
              className="rounded-full bg-marker px-5 py-2 font-bold text-[#0d1240]"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
          )}
          {canPlay && (
            <span className="tabular-nums">
              {clock(time)} of {clock(total)}
            </span>
          )}
          <Status transcript={transcript} job={job} />
        </div>
        {sourceUrl && (
          <audio
            ref={media}
            src={sourceUrl}
            preload="metadata"
            onError={() => setPlayable(false)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          />
        )}
      </div>

      <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-10">
        {transcript.segments.length > 0 ? (
          <>
            <Actions transcript={transcript} disabled={isWorking} canPlay={canPlay} />
            <TranscriptBody
              segments={transcript.segments}
              words={transcript.words}
              media={media}
              canPlay={canPlay}
              onSeek={seek}
            />
          </>
        ) : (
          <p className="font-read text-soft text-xl">
            {isWorking
              ? 'The words will appear here as each part finishes.'
              : transcript.status === 'done'
                ? 'No speech was found in this file.'
                : 'Nothing was transcribed before this stopped.'}
          </p>
        )}
        <button
          type="button"
          className="mt-12 text-soft text-sm underline underline-offset-3"
          onClick={async () => {
            if (isWorking) await stop(transcript.id)
            await deleteTranscript(transcript.id)
            void navigate({ to: '/' })
          }}
        >
          Delete this transcript
        </button>
      </main>
    </>
  )
}

function useCountdown(until?: number): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!until) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [until])
  return until ? Math.max(0, (until - now) / 1000) : 0
}

function Status({ transcript, job }: { transcript: Transcript; job: LiveJob | null }) {
  const remaining = useCountdown(job?.waitUntil)
  const [resumable, setResumable] = useState(false)

  useEffect(() => {
    if (transcript.status === 'stopped') void canResume(transcript.id).then(setResumable)
  }, [transcript.status, transcript.id])

  if (transcript.status === 'done') {
    const language = transcript.detectedLanguage
    return (
      <span>
        {humanDuration(transcript.duration)}
        {language ? ` of ${language[0]?.toUpperCase()}${language.slice(1)}` : ''}
      </span>
    )
  }

  if (transcript.status === 'stopped') {
    return (
      <>
        <span role="alert">{transcript.error ?? 'Stopped.'}</span>
        {resumable ? (
          <button
            type="button"
            onClick={() => void resume(transcript.id)}
            className="rounded-full bg-marker px-5 py-2 font-bold text-[#0d1240]"
          >
            Continue transcribing
          </button>
        ) : (
          <span>Drop the same file to continue.</span>
        )}
      </>
    )
  }

  const message = (() => {
    if (!job) return 'Waiting for the file ahead of this one'
    if (job.waitReason === 'rate') {
      return `Groq's rate limit was reached. Continuing in ${clock(remaining)}`
    }
    if (job.waitReason === 'transient')
      return `Groq did not respond. Retrying in ${clock(remaining)}`
    if (transcript.duration === 0 && job.decoded === 0) return 'Reading the audio'
    const of = job.total ? ` of ${clock(job.total)}` : ''
    return `Transcribed ${clock(transcript.duration)}${of}`
  })()

  return (
    <>
      <span role="status">{message}</span>
      <button
        type="button"
        onClick={() => void stop(transcript.id)}
        className="underline underline-offset-3"
      >
        Stop
      </button>
    </>
  )
}

function Actions({
  transcript,
  disabled,
  canPlay,
}: {
  transcript: Transcript
  disabled: boolean
  canPlay: boolean
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="mb-10">
      <div className="relative flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(transcript.text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
          }}
          className="rounded-full bg-cobalt px-5 py-2 font-semibold text-white"
        >
          {copied ? 'Copied' : 'Copy text'}
        </button>
        <DownloadMenu transcript={transcript} disabled={disabled} />
      </div>
      <p className="mt-7 text-soft text-sm">
        {disabled
          ? 'You can download the transcript once it finishes.'
          : canPlay
            ? 'Click any word to play from there.'
            : ''}
      </p>
    </div>
  )
}
