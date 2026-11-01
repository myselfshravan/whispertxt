import Dexie, { type EntityTable } from 'dexie'
import type { StoredChunk, Transcript } from './types'

interface StoredSource {
  transcriptId: string
  file: File
}

/** Everything stays in this browser's IndexedDB. There is no server to sync to. */
class WhisperTxtDb extends Dexie {
  transcripts!: EntityTable<Transcript, 'id'>
  chunks!: Dexie.Table<StoredChunk, [string, number]>
  sources!: EntityTable<StoredSource, 'transcriptId'>

  constructor() {
    super('whispertxt')
    this.version(1).stores({
      transcripts: 'id, createdAt, fingerprint',
      chunks: '[transcriptId+index], transcriptId',
      sources: 'transcriptId',
    })
  }
}

export const db = new WhisperTxtDb()

export async function deleteTranscript(id: string): Promise<void> {
  await db.transaction('rw', db.transcripts, db.chunks, db.sources, async () => {
    await db.transcripts.delete(id)
    await db.chunks.where('transcriptId').equals(id).delete()
    await db.sources.delete(id)
  })
}
