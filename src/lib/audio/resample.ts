/**
 * Streaming resampler for mono audio. Downsampling averages each output sample's input window,
 * which doubles as an anti-aliasing filter. Upsampling interpolates linearly.
 */
export class Resampler {
  private readonly step: number
  private position = 0
  private carry = new Float32Array(0)

  constructor(inputRate: number, outputRate: number) {
    this.step = inputRate / outputRate
  }

  process(input: Float32Array): Float32Array {
    const samples = new Float32Array(this.carry.length + input.length)
    samples.set(this.carry)
    samples.set(input, this.carry.length)

    const step = this.step
    const needed = Math.max(step, 1) + 1
    const capacity = Math.ceil(samples.length / step) + 1
    const output = new Float32Array(capacity)
    let written = 0
    let position = this.position

    while (position + needed <= samples.length) {
      output[written++] = step > 1 ? average(samples, position, step) : lerp(samples, position)
      position += step
    }

    const keepFrom = Math.floor(position)
    this.carry = samples.slice(keepFrom)
    this.position = position - keepFrom
    return output.subarray(0, written)
  }
}

function average(samples: Float32Array, position: number, width: number): number {
  const from = Math.floor(position)
  const to = Math.floor(position + width)
  let sum = 0
  for (let i = from; i < to; i++) sum += samples[i] ?? 0
  return sum / (to - from)
}

function lerp(samples: Float32Array, position: number): number {
  const index = Math.floor(position)
  const fraction = position - index
  const a = samples[index] ?? 0
  const b = samples[index + 1] ?? a
  return a + (b - a) * fraction
}
