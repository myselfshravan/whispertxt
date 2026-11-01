import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  canEncodeAudio,
  OggOutputFormat,
  Output,
  WavOutputFormat,
} from 'mediabunny'
import { SAMPLE_RATE } from '../constants'

const OPUS_BITRATE = 32_000
const BLOCK_FRAMES = SAMPLE_RATE

export interface EncodedAudio {
  blob: Blob
  extension: 'ogg' | 'wav'
}

let opusAvailable: Promise<boolean> | undefined

/** Prefers Opus, which is about a tenth the size of WAV, and falls back where it is missing. */
export async function encodeChunk(samples: Float32Array): Promise<EncodedAudio> {
  opusAvailable ??= canEncodeAudio('opus', {
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE,
    bitrate: OPUS_BITRATE,
  })
  if (await opusAvailable) {
    const output = new Output({ format: new OggOutputFormat(), target: new BufferTarget() })
    const source = new AudioSampleSource({ codec: 'opus', bitrate: OPUS_BITRATE })
    return { blob: await write(output, source, samples, 'audio/ogg'), extension: 'ogg' }
  }
  const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() })
  const source = new AudioSampleSource({ codec: 'pcm-s16' })
  return { blob: await write(output, source, samples, 'audio/wav'), extension: 'wav' }
}

async function write(
  output: Output<OggOutputFormat | WavOutputFormat, BufferTarget>,
  source: AudioSampleSource,
  samples: Float32Array,
  mimeType: string,
): Promise<Blob> {
  output.addAudioTrack(source)
  await output.start()
  for (let start = 0; start < samples.length; start += BLOCK_FRAMES) {
    using sample = new AudioSample({
      data: samples.slice(start, start + BLOCK_FRAMES),
      format: 'f32',
      numberOfChannels: 1,
      sampleRate: SAMPLE_RATE,
      timestamp: start / SAMPLE_RATE,
    })
    await source.add(sample)
  }
  await output.finalize()
  if (!output.target.buffer) throw new Error('Encoder produced no audio.')
  return new Blob([output.target.buffer], { type: mimeType })
}
