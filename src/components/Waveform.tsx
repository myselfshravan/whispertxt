import { useEffect, useRef } from 'react'
import { PEAKS_PER_SECOND } from '../lib/constants'

const BAR_WIDTH = 4
const BAR_GAP = 2
const COLOR_PLAYED = '#f4ff52'
const COLOR_READY = 'rgba(255, 255, 255, 0.72)'
const COLOR_PENDING = 'rgba(255, 255, 255, 0.2)'

interface Props {
  peaks: number[]
  /** Full length of the file. Anything past the known peaks is drawn as still to come. */
  duration: number
  time: number
  onSeek?: (seconds: number) => void
}

export function Waveform({ peaks, duration, time, onSeek }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const redraw = useRef<() => void>(() => {})

  redraw.current = () => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return

    const ratio = window.devicePixelRatio || 1
    const { width, height } = element.getBoundingClientRect()
    element.width = width * ratio
    element.height = height * ratio
    context.scale(ratio, ratio)

    const bars = Math.max(1, Math.floor(width / (BAR_WIDTH + BAR_GAP)))
    const span = duration || peaks.length / PEAKS_PER_SECOND || 1
    const loudest = peaks.reduce((max, peak) => Math.max(max, peak), 0.01)

    for (let bar = 0; bar < bars; bar++) {
      const from = (bar / bars) * span
      const to = ((bar + 1) / bars) * span
      const first = Math.floor(from * PEAKS_PER_SECOND)
      const last = Math.max(first + 1, Math.ceil(to * PEAKS_PER_SECOND))
      const slice = peaks.slice(first, last)
      const known = slice.length > 0
      const level = known ? Math.max(...slice) / loudest : 0
      const barHeight = known ? Math.max(4, level * height) : 4

      context.fillStyle = !known ? COLOR_PENDING : from < time ? COLOR_PLAYED : COLOR_READY
      context.beginPath()
      context.roundRect(
        bar * (BAR_WIDTH + BAR_GAP),
        (height - barHeight) / 2,
        BAR_WIDTH,
        barHeight,
        2,
      )
      context.fill()
    }
  }

  useEffect(() => {
    redraw.current()
  })

  useEffect(() => {
    const observer = new ResizeObserver(() => redraw.current())
    if (canvas.current) observer.observe(canvas.current)
    return () => observer.disconnect()
  }, [])

  const seekable = Boolean(onSeek && duration)

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label="Audio waveform"
      className={`block h-14 w-full sm:h-24 ${seekable ? 'cursor-pointer' : ''}`}
      onClick={(event) => {
        if (!seekable) return
        const box = event.currentTarget.getBoundingClientRect()
        onSeek?.(((event.clientX - box.left) / box.width) * duration)
      }}
    />
  )
}
