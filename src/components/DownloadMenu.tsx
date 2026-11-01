import { useEffect, useRef, useState } from 'react'
import { download } from '../lib/download'
import { EXPORT_OPTIONS, type ExportFormat, render } from '../lib/format'
import type { Transcript } from '../lib/types'

interface Props {
  transcript: Transcript
  disabled: boolean
}

export function DownloadMenu({ transcript, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(''), 4000)
    return () => clearTimeout(timer)
  }, [saved])

  function save(format: ExportFormat) {
    const filename = `${transcript.name.replace(/\.[^.]+$/, '')}.${format}`
    download(filename, render(transcript, format))
    setSaved(`Downloaded ${filename}`)
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div ref={root} className="sm:relative">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls="download-options"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border-2 border-line px-5 py-1.5 font-semibold hover:border-cobalt disabled:opacity-40"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none">
          <path
            d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 13.5h11"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Download
      </button>

      {open && (
        <ul
          id="download-options"
          className="absolute top-full right-0 left-0 z-10 mt-2 sm:right-auto sm:w-84 rounded-2xl border-2 border-line bg-paper p-1.5 shadow-[0_12px_32px_rgb(13_18_64/0.18)]"
        >
          {EXPORT_OPTIONS.map((option) => (
            <li key={option.format}>
              <button
                type="button"
                onClick={() => save(option.format)}
                className="w-full rounded-xl px-3.5 py-2.5 text-left hover:bg-line/50"
              >
                <span className="block font-semibold">
                  {option.label} <span className="font-normal text-soft">.{option.format}</span>
                </span>
                <span className="block text-soft text-sm">{option.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <span
        role="status"
        className="absolute top-full left-0 mt-1 whitespace-nowrap text-soft text-sm"
      >
        {!open && saved}
      </span>
    </div>
  )
}
