import { CHUNK_SECONDS, OVERLAP_SECONDS, PEAKS_PER_SECOND, SAMPLE_RATE } from '../constants'

export interface AudioWindow {
  index: number
  /** Seconds from the start of the file. */
  start: number
  end: number
  samples: Float32Array
  peaks: number[]
}

/** The shortest final chunk worth sending; anything less is already covered by the overlap. */
const MIN_TAIL_SECONDS = 0.25

/**
 * Cuts a stream of 16 kHz mono audio into overlapping windows while holding at most one window
 * in memory, so a three hour file costs the same RAM as a ten minute one.
 */
export class WindowBuilder {
  private readonly hop = CHUNK_SECONDS * SAMPLE_RATE
  private readonly size = (CHUNK_SECONDS + OVERLAP_SECONDS) * SAMPLE_RATE
  private buffer = new Float32Array(this.size)
  private filled = 0
  private index: number

  constructor(firstIndex = 0) {
    this.index = firstIndex
  }

  push(input: Float32Array): AudioWindow[] {
    const ready: AudioWindow[] = []
    let offset = 0
    while (offset < input.length) {
      const take = Math.min(this.size - this.filled, input.length - offset)
      this.buffer.set(input.subarray(offset, offset + take), this.filled)
      this.filled += take
      offset += take
      if (this.filled === this.size) {
        ready.push(this.emit(this.size, this.hop))
        this.buffer.copyWithin(0, this.hop, this.size)
        this.filled = this.size - this.hop
        this.index += 1
      }
    }
    return ready
  }

  /** Returns the final partial window, if it holds audio the previous window did not. */
  flush(): AudioWindow | null {
    const isFirst = this.index === 0
    const newAudio = isFirst ? this.filled : this.filled - OVERLAP_SECONDS * SAMPLE_RATE
    if (newAudio <= 0 || (!isFirst && newAudio < MIN_TAIL_SECONDS * SAMPLE_RATE)) return null
    return this.emit(this.filled, this.filled)
  }

  private emit(length: number, peakLength: number): AudioWindow {
    const start = this.index * CHUNK_SECONDS
    return {
      index: this.index,
      start,
      end: start + length / SAMPLE_RATE,
      samples: this.buffer.slice(0, length),
      peaks: computePeaks(this.buffer.subarray(0, peakLength)),
    }
  }
}

export function computePeaks(samples: Float32Array): number[] {
  const width = SAMPLE_RATE / PEAKS_PER_SECOND
  const peaks: number[] = []
  for (let start = 0; start < samples.length; start += width) {
    let peak = 0
    const end = Math.min(start + width, samples.length)
    for (let i = start; i < end; i++) {
      const value = Math.abs(samples[i] ?? 0)
      if (value > peak) peak = value
    }
    peaks.push(Math.round(peak * 1000) / 1000)
  }
  return peaks
}
