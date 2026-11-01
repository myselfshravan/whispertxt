import { Fragment, type RefObject, useEffect, useMemo, useRef } from 'react'
import { clock } from '../lib/format'
import { type Token, tokenize } from '../lib/merge'
import type { Segment, Word } from '../lib/types'

const PARAGRAPH_PAUSE_SECONDS = 1.2
const MAX_SEGMENTS_PER_PARAGRAPH = 6

interface Paragraph {
  start: number
  tokens: (Token & { position: number })[]
}

function toParagraphs(segments: Segment[], words: Word[]): Paragraph[] {
  const paragraphs: Paragraph[] = []
  let position = 0
  let count = 0
  let previousEnd = 0

  for (const segment of segments) {
    const pause = segment.start - previousEnd
    const current = paragraphs.at(-1)
    const tokens = tokenize(segment, words).map((token) => ({ ...token, position: position++ }))
    if (!current || pause > PARAGRAPH_PAUSE_SECONDS || count >= MAX_SEGMENTS_PER_PARAGRAPH) {
      paragraphs.push({ start: segment.start, tokens })
      count = 1
    } else {
      current.tokens.push(...tokens)
      count += 1
    }
    previousEnd = segment.end
  }
  return paragraphs
}

/** Finds the last token that has started, so a pause keeps the previous word marked. */
function activeIndex(starts: number[], time: number): number {
  let low = 0
  let high = starts.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if ((starts[middle] ?? 0) <= time) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

interface Props {
  segments: Segment[]
  words: Word[]
  media: RefObject<HTMLMediaElement | null>
  canPlay: boolean
  onSeek: (seconds: number) => void
}

export function TranscriptBody({ segments, words, media, canPlay, onSeek }: Props) {
  const paragraphs = useMemo(() => toParagraphs(segments, words), [segments, words])
  const starts = useMemo(
    () => paragraphs.flatMap((p) => p.tokens.map((t) => t.start)),
    [paragraphs],
  )
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!canPlay) return
    const words = container.current?.querySelectorAll<HTMLElement>('[data-position]')
    if (!words) return
    let previous = -1
    let frame = 0

    const tick = () => {
      const element = media.current
      if (element) {
        const index = element.currentTime > 0 ? activeIndex(starts, element.currentTime) : -1
        if (index !== previous) {
          words[previous]?.classList.remove('is-active')
          const word = words[index]
          word?.classList.add('is-active')
          previous = index
          if (word && !element.paused) keepInView(word)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [starts, canPlay, media])

  return (
    <div ref={container} className="flex flex-col gap-7">
      {paragraphs.map((paragraph) => (
        <section
          key={paragraph.start}
          className="grid gap-x-6 sm:grid-cols-[3.5rem_minmax(0,1fr)]"
          data-start={paragraph.start}
        >
          <button
            type="button"
            onClick={() => onSeek(paragraph.start)}
            className="self-start pt-1.5 text-left text-soft text-sm tabular-nums hover:text-ink"
            aria-label={`Jump to ${clock(paragraph.start)}`}
          >
            {clock(paragraph.start)}
          </button>
          <p className="max-w-[68ch] font-read text-[1.3rem] leading-[1.65]">
            {paragraph.tokens.map((token) => (
              <Fragment key={token.position}>
                <span
                  className="word"
                  data-position={token.position}
                  onClick={() => onSeek(token.start)}
                >
                  {token.text}
                </span>{' '}
              </Fragment>
            ))}
          </p>
        </section>
      ))}
    </div>
  )
}

function keepInView(element: HTMLElement): void {
  const { top, bottom } = element.getBoundingClientRect()
  // The sticky player covers the top of the screen.
  if (top < 200 || bottom > window.innerHeight - 80) {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
  }
}
