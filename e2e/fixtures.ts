import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

export const FIXTURES = 'e2e/fixtures'

const TONE = ['-f', 'lavfi', '-i']
const FILES: Record<string, string[]> = {
  'short.mp3': [...TONE, 'sine=frequency=220:duration=8'],
  'long.m4a': [...TONE, 'sine=frequency=220:duration=660', '-b:a', '24k'],
  'clip.avi': [
    ...TONE,
    'testsrc=d=8:s=160x120',
    ...TONE,
    'sine=frequency=220:duration=8',
    '-c:v',
    'mpeg4',
    '-c:a',
    'libmp3lame',
  ],
  'silent.mp4': [...TONE, 'testsrc=d=2:s=160x120', '-pix_fmt', 'yuv420p'],
}

export default function generateFixtures(): void {
  mkdirSync(FIXTURES, { recursive: true })
  for (const [name, args] of Object.entries(FILES)) {
    const path = `${FIXTURES}/${name}`
    if (!existsSync(path)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args, path])
  }
}
