import { Link } from '@tanstack/react-router'
import { useSettings } from '../lib/settings'
import { REPO_URL, useApp } from './Layout'

export function Header() {
  const { apiKey } = useSettings()
  const { openKeyDialog } = useApp()

  return (
    <header className="flex items-center gap-5 text-white">
      <Link to="/" className="mr-auto font-bold text-xl tracking-tight">
        whispertxt
      </Link>
      <a href={REPO_URL} className="font-medium opacity-90 hover:opacity-100">
        GitHub
      </a>
      <button
        type="button"
        onClick={openKeyDialog}
        className={
          apiKey
            ? 'rounded-full border-2 border-white/40 px-4 py-1.5 font-medium'
            : 'rounded-full bg-marker px-4 py-1.5 font-semibold text-[#0d1240]'
        }
      >
        {apiKey ? 'Groq key saved' : 'Add Groq key'}
      </button>
    </header>
  )
}
