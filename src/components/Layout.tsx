import { Outlet, useNavigate } from '@tanstack/react-router'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { addFile, onAuthFailure } from '../lib/jobs'
import { getSettings } from '../lib/settings'
import { KeyDialog } from './KeyDialog'

interface AppActions {
  addFiles: (files: File[]) => void
  openKeyDialog: () => void
  isDragging: boolean
}

const AppContext = createContext<AppActions | null>(null)

export function useApp(): AppActions {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside Layout')
  return value
}

export const REPO_URL = 'https://github.com/myselfshravan/whispertxt'

export function Layout() {
  const navigate = useNavigate()
  const [keyOpen, setKeyOpen] = useState(false)
  const [isDragging, setDragging] = useState(false)
  const heldFiles = useRef<File[]>([])
  const dragDepth = useRef(0)

  const start = useCallback(
    async (files: File[]) => {
      const ids = await Promise.all(files.map(addFile))
      const first = ids[0]
      if (first) void navigate({ to: '/t/$id', params: { id: first } })
    },
    [navigate],
  )

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return
      if (getSettings().apiKey) {
        void start(files)
        return
      }
      heldFiles.current = files
      setKeyOpen(true)
    },
    [start],
  )

  useEffect(() => onAuthFailure(() => setKeyOpen(true)), [])

  useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files')
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault()
    }
    const leave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const drop = (event: DragEvent) => {
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      addFiles([...(event.dataTransfer?.files ?? [])])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [addFiles])

  const actions = useMemo(
    () => ({ addFiles, isDragging, openKeyDialog: () => setKeyOpen(true) }),
    [addFiles, isDragging],
  )

  return (
    <MotionConfig reducedMotion="user">
      <AppContext.Provider value={actions}>
        <div className="flex min-h-dvh flex-col">
          <Outlet />
          <footer className="mt-auto border-line border-t px-5 py-6 text-soft text-sm sm:px-10">
            MIT licensed.{' '}
            <a className="underline underline-offset-3" href={REPO_URL}>
              Read the source on GitHub
            </a>
            . Built by{' '}
            <a className="underline underline-offset-3" href="https://myselfshravan.github.io">
              Shravan Revanna
            </a>
            .
          </footer>
        </div>

        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-3xl border-4 border-marker border-dashed bg-cobalt/90 font-bold text-4xl text-marker sm:text-6xl"
            >
              Drop to transcribe
            </motion.div>
          )}
        </AnimatePresence>

        <KeyDialog
          open={keyOpen}
          onClose={() => {
            setKeyOpen(false)
            heldFiles.current = []
          }}
          onSaved={() => {
            setKeyOpen(false)
            const held = heldFiles.current
            heldFiles.current = []
            if (held.length > 0) void start(held)
          }}
        />
      </AppContext.Provider>
    </MotionConfig>
  )
}
