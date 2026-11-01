import { db } from './db'
import type { Transcript } from './types'

const FORMAT = 'whispertxt-backup'

export async function exportLibrary(): Promise<string> {
  const transcripts = await db.transcripts.where('createdAt').above(0).toArray()
  const finished = transcripts.filter((t) => t.status === 'done')
  return JSON.stringify({ format: FORMAT, version: 1, transcripts: finished })
}

export async function importLibrary(json: string): Promise<number> {
  let parsed: { format?: string; transcripts?: Transcript[] }
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (parsed.format !== FORMAT || !Array.isArray(parsed.transcripts)) {
    throw new Error('That file is not a WhisperTxt backup.')
  }
  await db.transcripts.bulkPut(parsed.transcripts)
  return parsed.transcripts.length
}
