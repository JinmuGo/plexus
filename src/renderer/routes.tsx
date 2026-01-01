import { Route } from 'react-router-dom'

import { Router } from 'renderer/lib/electron-router-dom'

import { MainScreen } from './screens/main'
import { PopoverScreen } from './screens/popover'
import { ErrorBoundary } from './components/error-boundary'

export function AppRoutes() {
  return (
    <Router
      main={
        <Route
          element={
            <ErrorBoundary>
              <MainScreen />
            </ErrorBoundary>
          }
          path="/"
        />
      }
      popover={
        <Route
          element={
            <ErrorBoundary>
              <PopoverScreen />
            </ErrorBoundary>
          }
          path="/"
        />
      }
    />
  )
}
