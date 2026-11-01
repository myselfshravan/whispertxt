import { type FormEvent, useEffect, useRef, useState } from 'react'
import { checkKey, GroqError } from '../lib/groq'
import { getSettings, updateSettings } from '../lib/settings'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function KeyDialog({ open, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(getSettings().apiKey)
      setError('')
      dialog.current?.showModal()
    } else {
      dialog.current?.close()
    }
  }, [open])

  async function save(event: FormEvent) {
    event.preventDefault()
    const apiKey = value.trim()
    setChecking(true)
    setError('')
    try {
      await checkKey(apiKey)
      updateSettings({ apiKey })
      onSaved()
    } catch (cause) {
      setError(cause instanceof GroqError ? cause.message : 'Could not check that key.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-3xl bg-paper p-7 text-ink"
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <h2 className="font-bold text-3xl leading-tight tracking-tight">Add your Groq API key</h2>
        <p className="text-soft leading-relaxed">
          WhisperTxt uses your own key, and Groq has a free tier.{' '}
          <a
            className="font-semibold text-ink underline underline-offset-3"
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
          >
            Create a key at console.groq.com
          </a>
          , then paste it here. It stays in this browser and is only ever sent to Groq.
        </p>
        <label className="flex flex-col gap-1.5 font-medium">
          API key
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            placeholder="gsk_..."
            className="rounded-xl border-2 border-line bg-transparent px-4 py-3 font-normal"
          />
        </label>
        {error && (
          <p role="alert" className="text-alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={checking}
            className="rounded-full bg-cobalt px-6 py-3 font-semibold text-white disabled:opacity-60"
          >
            {checking ? 'Checking key' : 'Save key'}
          </button>
          <button type="button" onClick={onClose} className="px-3 py-3 font-medium text-soft">
            Cancel
          </button>
          {getSettings().apiKey && (
            <button
              type="button"
              onClick={() => {
                updateSettings({ apiKey: '' })
                onClose()
              }}
              className="ml-auto px-3 py-3 font-medium text-alert"
            >
              Remove key
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
