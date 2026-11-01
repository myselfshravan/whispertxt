import { expect, type Page, test } from '@playwright/test'
import { FIXTURES } from './fixtures'

const GROQ = 'https://api.groq.com/openai/v1/audio/transcriptions'

/** Answers like Groq: every chunk's timings start from zero. */
function reply(label: string) {
  return {
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({
      language: 'english',
      segments: [
        { text: ` Hello from ${label}.`, start: 1, end: 2 },
        { text: ' Second line.', start: 4, end: 5 },
      ],
      words: [
        { word: 'Hello', start: 1, end: 1.3 },
        { word: 'from', start: 1.3, end: 1.6 },
        { word: label, start: 1.6, end: 2 },
        { word: 'Second', start: 4, end: 4.5 },
        { word: 'line', start: 4.5, end: 5 },
      ],
    }),
  }
}

async function open(page: Page, apiKey = 'gsk_test') {
  await page.addInitScript((key) => {
    localStorage.setItem('whispertxt.settings', JSON.stringify({ apiKey: key }))
  }, apiKey)
  await page.goto('/')
}

async function choose(page: Page, name: string) {
  await page.getByLabel('Choose audio or video files').setInputFiles(`${FIXTURES}/${name}`)
}

async function downloaded(page: Page, label: string): Promise<string> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: label, exact: true }).click(),
  ])
  const stream = await file.createReadStream()
  const parts: Buffer[] = []
  for await (const part of stream) parts.push(part as Buffer)
  return Buffer.concat(parts).toString()
}

test('asks for a key first, then transcribes the held file', async ({ page }) => {
  await page.route('https://api.groq.com/openai/v1/models', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: '{"data":[]}',
    }),
  )
  await page.route(GROQ, (route) => route.fulfill(reply('tone')))
  await page.goto('/')
  await choose(page, 'short.mp3')

  await expect(page.getByRole('heading', { name: 'Add your Groq API key' })).toBeVisible()
  await page.getByLabel('API key').fill('gsk_test')
  await page.getByRole('button', { name: 'Save key' }).click()

  await expect(page.getByText('Hello from tone.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
})

test('a long file gets correct timestamps across chunks', async ({ page }) => {
  const seen: string[] = []
  await page.route(GROQ, (route) => {
    seen.push(String(route.request().headers()['content-type']))
    return route.fulfill(reply(`part${seen.length}`))
  })
  await open(page)
  await choose(page, 'long.m4a')

  await expect(page.getByRole('button', { name: 'SRT' })).toBeEnabled({ timeout: 60_000 })
  await expect(page.getByText(/11 min/)).toBeVisible()
  expect(seen).toHaveLength(3)

  const srt = await downloaded(page, 'SRT')
  expect(srt).toContain('00:05:01,000 --> 00:05:02,000')
  expect(srt).toContain('00:10:01,000 --> 00:10:02,000')
  const vtt = await downloaded(page, 'VTT')
  expect(vtt.startsWith('WEBVTT')).toBe(true)
})

test('waits out a rate limit and finishes', async ({ page }) => {
  let calls = 0
  await page.route(GROQ, (route) => {
    calls += 1
    if (calls === 1) {
      return route.fulfill({
        status: 429,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: '{"error":{"message":"Rate limit reached. Please try again in 2s."}}',
      })
    }
    return route.fulfill(reply('tone'))
  })
  await open(page)
  await choose(page, 'short.mp3')

  await expect(page.getByText(/rate limit was reached/)).toBeVisible()
  await expect(page.getByText('Hello from tone.')).toBeVisible()
  expect(calls).toBe(2)
})

test('a rejected key stops the job and reopens the key prompt', async ({ page }) => {
  await page.route(GROQ, (route) =>
    route.fulfill({
      status: 401,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: '{"error":{"message":"Invalid API Key"}}',
    }),
  )
  await open(page)
  await choose(page, 'short.mp3')

  await expect(page.getByRole('heading', { name: 'Add your Groq API key' })).toBeVisible()
  await expect(page.getByText('Groq rejected this API key.', { exact: false })).toBeAttached()
})

test('resumes after a failure without resending finished chunks', async ({ page }) => {
  let calls = 0
  let healthy = false
  await page.route(GROQ, (route) => {
    calls += 1
    if (!healthy && calls >= 2) {
      return route.fulfill({
        status: 400,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: '{"error":{"message":"Groq could not read this audio."}}',
      })
    }
    return route.fulfill(reply(`call${calls}`))
  })
  await open(page)
  await choose(page, 'long.m4a')

  const resume = page.getByRole('button', { name: 'Continue transcribing' })
  await expect(resume).toBeVisible({ timeout: 60_000 })
  const before = calls
  healthy = true

  // A reload loses the running job, so this also proves the saved source and chunks survive.
  await page.reload()
  await resume.click()

  await expect(page.getByText(/11 min/)).toBeVisible({ timeout: 60_000 })
  // Three chunks exist and at least one was saved, so a resume sends two at most.
  expect(calls - before).toBeLessThanOrEqual(2)
  const srt = await downloaded(page, 'SRT')
  expect(srt).toContain('00:10:01,000 --> 00:10:02,000')
})

test('falls back to ffmpeg for AVI under the production CSP', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text())
  })
  await page.route(GROQ, (route) => route.fulfill(reply('avi')))
  await open(page)
  await choose(page, 'clip.avi')

  await expect(page.getByText('Hello from avi.')).toBeVisible({ timeout: 60_000 })
  expect(violations).toEqual([])
})

test('explains a video with no audio', async ({ page }) => {
  await page.route(GROQ, (route) => route.fulfill(reply('never')))
  await open(page)
  await choose(page, 'silent.mp4')
  await expect(page.getByText('This file has no audio track to transcribe.')).toBeVisible()
})

test('search finds a word and history survives a reload', async ({ page }) => {
  await page.route(GROQ, (route) => route.fulfill(reply('searchable')))
  await open(page)
  await choose(page, 'short.mp3')
  await expect(page.getByText('Hello from searchable.')).toBeVisible()

  await page.goto('/')
  await page.getByLabel('Search transcripts').fill('searchable')
  await page.getByRole('link', { name: /Hello from searchable/ }).click()
  await expect(page).toHaveURL(/\/t\/.+at=1/)
  await expect(page.getByText('Second line.')).toBeVisible()
})

test('only ever talks to its own origin and Groq', async ({ page }) => {
  const hosts = new Set<string>()
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol.startsWith('http')) hosts.add(url.host)
  })
  await page.route(GROQ, (route) => route.fulfill(reply('tone')))
  await open(page)
  await choose(page, 'short.mp3')
  await expect(page.getByText('Hello from tone.')).toBeVisible()
  expect([...hosts].sort()).toEqual(['api.groq.com', 'localhost:4173'])
})
