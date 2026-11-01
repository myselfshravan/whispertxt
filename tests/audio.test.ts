import { describe, expect, it } from 'vitest'
import { Resampler } from '../src/lib/audio/resample'
import { computePeaks, WindowBuilder } from '../src/lib/audio/windows'
import { CHUNK_SECONDS, OVERLAP_SECONDS, SAMPLE_RATE } from '../src/lib/constants'

/** Marks each sample with its position so tests can check exactly which audio each window got. */
function ramp(from: number, length: number): Float32Array {
  return Float32Array.from({ length }, (_, i) => (from + i) / 1e8)
}

describe('WindowBuilder', () => {
  const hop = CHUNK_SECONDS * SAMPLE_RATE
  const size = (CHUNK_SECONDS + OVERLAP_SECONDS) * SAMPLE_RATE

  it('sends a short file as one window', () => {
    const builder = new WindowBuilder()
    expect(builder.push(ramp(0, SAMPLE_RATE))).toEqual([])
    const tail = builder.flush()
    expect(tail).toMatchObject({ index: 0, start: 0, end: 1 })
    expect(tail?.samples).toHaveLength(SAMPLE_RATE)
  })

  it('overlaps neighbouring windows without losing samples', () => {
    const builder = new WindowBuilder()
    const windows = builder.push(ramp(0, hop * 2 + size))
    expect(windows.map((w) => [w.start, w.end])).toEqual([
      [0, 302],
      [300, 602],
      [600, 902],
    ])
    expect(windows[1]?.samples[0]).toBe(ramp(hop, 1)[0])
    expect(windows[2]?.samples.at(-1)).toBe(ramp(hop * 2 + size - 1, 1)[0])
  })

  it('gives the same windows however the stream is split', () => {
    const whole = new WindowBuilder().push(ramp(0, size))
    const pieces = new WindowBuilder()
    const split = [...pieces.push(ramp(0, 7)), ...pieces.push(ramp(7, size - 7))]
    expect(split[0]?.samples.every((v, i) => v === whole[0]?.samples[i])).toBe(true)
  })

  it('skips a tail that only repeats the overlap', () => {
    const builder = new WindowBuilder()
    builder.push(ramp(0, size))
    expect(builder.flush()).toBeNull()
  })

  it('keeps a tail with new audio', () => {
    const builder = new WindowBuilder()
    builder.push(ramp(0, size + SAMPLE_RATE))
    expect(builder.flush()).toMatchObject({ index: 1, start: 300, end: 303 })
  })

  it('numbers windows from where a resumed job picks up', () => {
    const builder = new WindowBuilder(4)
    expect(builder.push(ramp(0, size))[0]).toMatchObject({ index: 4, start: 1200, end: 1502 })
  })

  it('gives a window peaks for its new audio only, so the overlap is not drawn twice', () => {
    const builder = new WindowBuilder()
    const [first] = builder.push(ramp(0, size))
    expect(first?.peaks).toHaveLength(CHUNK_SECONDS * 2)
  })
})

describe('computePeaks', () => {
  it('reports the loudest sample in each half second', () => {
    const samples = new Float32Array(SAMPLE_RATE)
    samples[10] = -0.5
    samples[SAMPLE_RATE - 1] = 0.25
    expect(computePeaks(samples)).toEqual([0.5, 0.25])
  })
})

describe('Resampler', () => {
  function zeroCrossings(samples: Float32Array): number {
    let count = 0
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i - 1] ?? 0) < 0 !== (samples[i] ?? 0) < 0) count += 1
    }
    return count
  }

  function sine(hz: number, rate: number, seconds: number): Float32Array {
    return Float32Array.from({ length: rate * seconds }, (_, i) =>
      Math.sin((2 * Math.PI * hz * i) / rate),
    )
  }

  it.each([44_100, 48_000, 8_000, 16_000])('keeps pitch and length from %i Hz', (rate) => {
    const input = sine(440, rate, 2)
    const resampler = new Resampler(rate, SAMPLE_RATE)
    const blockSize = 1024
    const parts: Float32Array[] = []
    for (let i = 0; i < input.length; i += blockSize) {
      parts.push(resampler.process(input.subarray(i, i + blockSize)).slice())
    }
    const output = Float32Array.from(parts.flatMap((p) => [...p]))
    expect(Math.abs(output.length - SAMPLE_RATE * 2)).toBeLessThan(5)
    expect(Math.abs(zeroCrossings(output) - 1760)).toBeLessThanOrEqual(4)
  })
})
