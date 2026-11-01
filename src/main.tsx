import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/newsreader'
import './styles.css'

import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { recoverInterrupted } from './lib/jobs'
import { router } from './router'

const root = document.getElementById('root')
if (!root) throw new Error('Missing root element')

void recoverInterrupted()

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
