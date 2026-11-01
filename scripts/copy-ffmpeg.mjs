// Copies the ffmpeg.wasm core into public/ so it is self-hosted, never fetched from a CDN.
import { cpSync, mkdirSync } from 'node:fs'

mkdirSync('public/ffmpeg', { recursive: true })
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  cpSync(`node_modules/@ffmpeg/core/dist/esm/${file}`, `public/ffmpeg/${file}`)
}
