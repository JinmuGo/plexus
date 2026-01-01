import ReactDom from 'react-dom/client'
import React from 'react'

import { AppRoutes } from './routes'
import { ThemeProvider } from './lib/theme-context'
import { ShortcutProvider } from './lib/keyboard'
import { StoreProvider } from './providers'
import { CheatsheetOverlay } from './components/keyboard'
import { Toaster } from './components/ui/sonner'

import './globals.css'

ReactDom.createRoot(document.querySelector('app') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <StoreProvider>
        <ShortcutProvider>
          <AppRoutes />
          <CheatsheetOverlay />
          <Toaster position="bottom-right" richColors />
        </ShortcutProvider>
      </StoreProvider>
    </ThemeProvider>
  </React.StrictMode>
)
