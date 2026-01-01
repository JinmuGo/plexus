import ReactDom from 'react-dom/client'
import React from 'react'
import { MotionConfig } from 'framer-motion'

import { AppRoutes } from './routes'
import { ThemeProvider } from './lib/theme-context'
import { ShortcutProvider } from './lib/keyboard'
import { StoreProvider } from './providers'
import { CheatsheetOverlay } from './components/keyboard'
import { Toaster } from './components/ui/sonner'
import { prefersReducedMotion } from './lib/motion'

import './globals.css'

ReactDom.createRoot(document.querySelector('app') as HTMLElement).render(
  <React.StrictMode>
    <MotionConfig reducedMotion={prefersReducedMotion ? 'always' : 'never'}>
      <ThemeProvider>
        <StoreProvider>
          <ShortcutProvider>
            <AppRoutes />
            <CheatsheetOverlay />
            <Toaster position="bottom-right" richColors />
          </ShortcutProvider>
        </StoreProvider>
      </ThemeProvider>
    </MotionConfig>
  </React.StrictMode>
)
