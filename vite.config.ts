import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// `vite preview` serves the production CSP so tests run against what actually ships.
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
const securityHeaders = Object.fromEntries(
  vercel.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]),
)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: { headers: securityHeaders },
  worker: { format: 'es' },
  // ffmpeg.wasm spawns its own worker from a relative URL, which pre-bundling breaks.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  test: { include: ['tests/**/*.test.ts'] },
})
