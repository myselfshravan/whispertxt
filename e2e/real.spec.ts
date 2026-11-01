import { expect, test } from '@playwright/test'

// Spends real Groq quota, so it only runs when given a key: GROQ_API_KEY=... REAL_FILE=path
const { GROQ_API_KEY, REAL_FILE } = process.env

test('transcribes a real file through real Groq', async ({ page }) => {
  test.skip(!GROQ_API_KEY || !REAL_FILE, 'needs GROQ_API_KEY and REAL_FILE')
  test.setTimeout(600_000)

  const statuses: number[] = []
  page.on('response', (response) => {
    if (response.url().includes('/audio/transcriptions')) statuses.push(response.status())
  })
  await page.addInitScript((key) => {
    localStorage.setItem('whispertxt.settings', JSON.stringify({ apiKey: key }))
  }, GROQ_API_KEY as string)
  await page.goto('/')
  const started = Date.now()
  await page.getByLabel('Choose audio or video files').setInputFiles(REAL_FILE as string)

  await expect(page.getByRole('button', { name: 'SRT' })).toBeEnabled({ timeout: 570_000 })

  const summary = await page.evaluate(async () => {
    const { db } = await new Promise<{ db: IDBDatabase }>((resolve, reject) => {
      const open = indexedDB.open('whispertxt')
      open.onsuccess = () => resolve({ db: open.result })
      open.onerror = () => reject(open.error)
    })
    const rows = await new Promise<
      {
        duration: number
        segments: { start: number; end: number }[]
        words: unknown[]
        text: string
        detectedLanguage: string
        status: string
      }[]
    >((resolve) => {
      const all = db.transaction('transcripts').objectStore('transcripts').getAll()
      all.onsuccess = () => resolve(all.result)
    })
    const row = rows[0]
    if (!row) return null
    let backwards = 0
    row.segments.forEach((s, i) => {
      if (i && s.start < (row.segments[i - 1]?.start ?? 0)) backwards += 1
    })
    return {
      status: row.status,
      duration: row.duration,
      segments: row.segments.length,
      words: row.words.length,
      chars: row.text.length,
      language: row.detectedLanguage,
      lastEnd: row.segments.at(-1)?.end,
      backwards,
    }
  })
  console.log(JSON.stringify({ ms: Date.now() - started, statuses, ...summary }))
  expect(statuses.every((status) => status === 200 || status === 429)).toBe(true)
  expect(summary?.backwards).toBe(0)
})
