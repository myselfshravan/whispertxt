import { MODELS } from '../lib/constants'
import { updateSettings, useSettings } from '../lib/settings'

const LANGUAGES = [
  ['', 'Detect automatically'],
  ['en', 'English'],
  ['hi', 'Hindi'],
  ['kn', 'Kannada'],
  ['ta', 'Tamil'],
  ['te', 'Telugu'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['pt', 'Portuguese'],
  ['it', 'Italian'],
  ['zh', 'Chinese'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['ar', 'Arabic'],
] as const

const FIELD = 'rounded-xl border-2 border-white/40 bg-cobalt-deep px-3 py-2 text-white'

export function Options() {
  const { model, language, prompt } = useSettings()

  return (
    <details className="mt-5 max-w-2xl">
      <summary className="w-fit cursor-pointer font-medium">Transcription options</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 font-medium">
          Model
          <select
            value={model}
            onChange={(event) => updateSettings({ model: event.target.value })}
            className={FIELD}
          >
            {MODELS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}: {option.hint}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-medium">
          Language
          <select
            value={language}
            onChange={(event) => updateSettings({ language: event.target.value })}
            className={FIELD}
          >
            {LANGUAGES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-medium sm:col-span-2">
          Names and terms to spell correctly
          <input
            value={prompt}
            onChange={(event) => updateSettings({ prompt: event.target.value })}
            placeholder="Priya, Kubernetes, Bengaluru"
            className={`${FIELD} placeholder:text-white/60`}
          />
        </label>
      </div>
    </details>
  )
}
