import { useSyncExternalStore } from 'react'
import { DEFAULT_MODEL } from './constants'

export interface Settings {
  apiKey: string
  model: string
  language: string
  prompt: string
}

const STORAGE_KEY = 'whispertxt.settings'
const DEFAULTS: Settings = { apiKey: '', model: DEFAULT_MODEL, language: '', prompt: '' }

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

let current = load()
const listeners = new Set<() => void>()

export function getSettings(): Settings {
  return current
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings)
}
