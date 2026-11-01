import { FFFSType, FFmpeg } from '@ffmpeg/ffmpeg'
import { ALL_FORMATS, type AudioSample, AudioSampleSink, BlobSource, Input } from 'mediabunny'
import { SAMPLE_RATE } from '../constants'
import { Resampler } from './resample'

export class NoAudioError extends Error {
  constructor() {
    super('This file has no audio track to transcribe.')
    this.name = 'NoAudioError'
  }
}

/** Yields the file as 16 kHz mono from `startAt` seconds, using the fastest decoder that works. */
export async function* decodeToPcm(
  file: File,
  startAt: number,
  onDuration: (seconds: number) => void,
): AsyncGenerator<Float32Array> {
  const native = await openNative(file)
  if (native) {
    if (native.duration) onDuration(native.duration)
    yield* decodeNative(native.sink, startAt)
    return
  }
  yield* decodeWithFfmpeg(file, startAt)
}

/** Returns a sink when the browser can decode this file itself, null when ffmpeg must. */
async function openNative(
  file: File,
): Promise<{ sink: AudioSampleSink; duration: number | null } | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    if (!(await input.canRead())) return null
    const track = await input.getPrimaryAudioTrack()
    if (!track) {
      // A readable container with no audio at all is final. Nothing else will find any.
      if ((await input.getTracks()).length > 0) throw new NoAudioError()
      return null
    }
    if (!(await track.canDecode())) return null
    return { sink: new AudioSampleSink(track), duration: await input.getDurationFromMetadata() }
  } catch (error) {
    if (error instanceof NoAudioError) throw error
    return null
  }
}

async function* decodeNative(sink: AudioSampleSink, startAt: number): AsyncGenerator<Float32Array> {
  let resampler: Resampler | null = null
  let isFirst = true

  for await (const sample of sink.samples(startAt)) {
    using audio = sample
    resampler ??= new Resampler(audio.sampleRate, SAMPLE_RATE)

    if (isFirst) {
      isFirst = false
      // Keeps the transcript in sync with files whose audio starts after their video.
      const lead = Math.round(Math.max(0, audio.timestamp - startAt) * SAMPLE_RATE)
      if (lead > 0) yield new Float32Array(lead)
    }
    yield resampler.process(downmix(audio))
  }
}

function downmix(sample: AudioSample): Float32Array {
  const frames = sample.numberOfFrames
  const mono = new Float32Array(frames)
  const plane = new Float32Array(frames)
  for (let channel = 0; channel < sample.numberOfChannels; channel++) {
    sample.copyTo(plane, { planeIndex: channel, format: 'f32-planar' })
    for (let i = 0; i < frames; i++) mono[i] = (mono[i] ?? 0) + (plane[i] ?? 0)
  }
  for (let i = 0; i < frames; i++) mono[i] = (mono[i] ?? 0) / sample.numberOfChannels
  return mono
}

const FFMPEG_BLOCK_SECONDS = 60

/**
 * Handles what WebCodecs cannot, such as AVI and WMV. Works through the file a minute at a time
 * so memory stays flat, and reads it through WORKERFS rather than copying it into wasm memory.
 */
async function* decodeWithFfmpeg(file: File, startAt: number): AsyncGenerator<Float32Array> {
  const ffmpeg = new FFmpeg()
  await ffmpeg.load({
    coreURL: new URL('/ffmpeg/ffmpeg-core.js', self.location.origin).href,
    wasmURL: new URL('/ffmpeg/ffmpeg-core.wasm', self.location.origin).href,
  })

  try {
    await ffmpeg.createDir('/in')
    await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, '/in')

    for (let time = startAt; ; time += FFMPEG_BLOCK_SECONDS) {
      await ffmpeg.exec([
        '-ss',
        String(time),
        '-t',
        String(FFMPEG_BLOCK_SECONDS),
        '-i',
        `/in/${file.name}`,
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(SAMPLE_RATE),
        '-f',
        's16le',
        'block.raw',
      ])
      const pcm = await readBlock(ffmpeg)
      if (!pcm?.length) {
        if (time === startAt) throw new UnreadableError()
        return
      }
      yield pcm
    }
  } finally {
    ffmpeg.terminate()
  }
}

async function readBlock(ffmpeg: FFmpeg): Promise<Float32Array | null> {
  try {
    const bytes = (await ffmpeg.readFile('block.raw')) as Uint8Array
    await ffmpeg.deleteFile('block.raw')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const samples = new Float32Array(Math.floor(bytes.byteLength / 2))
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768
    return samples
  } catch {
    return null
  }
}

export class UnreadableError extends Error {
  constructor() {
    super('This file could not be read. It may be damaged, or have no audio track.')
    this.name = 'UnreadableError'
  }
}
