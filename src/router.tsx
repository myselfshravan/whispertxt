import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { TranscriptPage } from './pages/TranscriptPage'

const rootRoute = createRootRoute({ component: Layout })

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })

export const transcriptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/t/$id',
  component: TranscriptPage,
  validateSearch: (search: Record<string, unknown>): { at?: number } => {
    const at = Number(search.at)
    return Number.isFinite(at) && at > 0 ? { at } : {}
  },
})

const routeTree = rootRoute.addChildren([homeRoute, transcriptRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
