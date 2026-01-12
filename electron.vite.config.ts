import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { resolve, normalize, dirname } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

import injectProcessEnvPlugin from 'rollup-plugin-inject-process-env'
import tsconfigPathsPlugin from 'vite-tsconfig-paths'
import reactPlugin from '@vitejs/plugin-react-swc'
import { visualizer } from 'rollup-plugin-visualizer'
import type { Plugin } from 'vite'

import { settings } from './src/renderer/lib/electron-router-dom'
import { main, resources, version } from './package.json'

/**
 * Vite plugin to remove crossorigin attribute from scripts in production.
 * The crossorigin attribute causes loading failures when using file:// protocol
 * in Electron production builds (blank screen issue).
 * @see https://github.com/vitejs/vite/issues/6648
 */
function removeCrossOriginPlugin(): Plugin {
  return {
    name: 'remove-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      // Remove crossorigin attribute from all tags
      return html.replace(/ crossorigin/g, '')
    },
  }
}

const [nodeModules, devFolder] = normalize(dirname(main)).split(/\/|\\/g)
const devPath = [nodeModules, devFolder].join('/')

const tsconfigPaths = tsconfigPathsPlugin({
  projects: [resolve('tsconfig.json')],
})

export default defineConfig(({ mode }) => {
  // Load environment variables based on mode
  const env = loadEnv(mode)

  // Determine environment
  const isDev = mode === 'development'
  const isProd = mode === 'production'

  return {
    main: {
      mode: 'es2022',
      plugins: [tsconfigPaths, externalizeDepsPlugin()],

      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        __APP_VERSION__: JSON.stringify(version),
        __APP_NAME__: JSON.stringify(env.VITE_APP_NAME || 'Plexus'),
        __IS_DEV__: isDev,
        __IS_PROD__: isProd,
        // Feature flags (build-time)
        __FEATURE_COST_TRACKING__: env.VITE_FEATURE_COST_TRACKING === 'true',
        __FEATURE_AI_INSIGHTS__: env.VITE_FEATURE_AI_INSIGHTS === 'true',
        __FEATURE_WEBHOOKS__: env.VITE_FEATURE_WEBHOOKS === 'true',
        __FEATURE_EXPERIMENTAL_UI__: env.VITE_FEATURE_EXPERIMENTAL_UI === 'true',
        __FEATURE_VERBOSE_LOGGING__: env.VITE_FEATURE_VERBOSE_LOGGING === 'true',
      },

      build: {
        minify: isProd,
        sourcemap: isDev,
        rollupOptions: {
          input: {
            index: resolve('src/main/index.ts'),
          },
          output: {
            dir: resolve(devPath, 'main'),
            format: 'es',
          },
        },
      },
    },

  // Agent scripts for Claude Code integration (standalone build)
  // Note: These are built separately as they run outside the Electron context
  // Build command: npx esbuild src/agent-scripts/plexus-hook.ts --bundle --platform=node --outfile=dist/hooks/plexus-hook.js

    preload: {
      mode: 'es2022',
      plugins: [tsconfigPaths, externalizeDepsPlugin()],

      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
      },

      build: {
        minify: isProd,
        sourcemap: isDev,
        rollupOptions: {
          output: {
            dir: resolve(devPath, 'preload'),
          },
        },
      },
    },

    renderer: {
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        'process.platform': JSON.stringify(process.platform),
        __APP_VERSION__: JSON.stringify(version),
        __APP_NAME__: JSON.stringify(env.VITE_APP_NAME || 'Plexus'),
        __IS_DEV__: isDev,
        __IS_PROD__: isProd,
        // Feature flags (build-time) for tree-shaking
        __FEATURE_COST_TRACKING__: env.VITE_FEATURE_COST_TRACKING === 'true',
        __FEATURE_AI_INSIGHTS__: env.VITE_FEATURE_AI_INSIGHTS === 'true',
        __FEATURE_WEBHOOKS__: env.VITE_FEATURE_WEBHOOKS === 'true',
        __FEATURE_EXPERIMENTAL_UI__: env.VITE_FEATURE_EXPERIMENTAL_UI === 'true',
        __FEATURE_VERBOSE_LOGGING__: env.VITE_FEATURE_VERBOSE_LOGGING === 'true',
      },

      server: {
        port: settings.port,
      },

      plugins: [
        tsconfigPaths,
        tailwindcss(),
        // Code inspector only in development
        ...(isDev
          ? [
              codeInspectorPlugin({
                bundler: 'vite',
                hotKeys: ['altKey'],
                hideConsole: true,
              }),
            ]
          : []),
        reactPlugin(),
        // Remove crossorigin attribute in production to fix file:// protocol issues
        ...(isProd ? [removeCrossOriginPlugin()] : []),
      ],

      publicDir: resolve(resources, 'public'),

      build: {
        minify: isProd ? 'esbuild' : false,
        sourcemap: isDev,
        outDir: resolve(devPath, 'renderer'),

        rollupOptions: {
          plugins: [
            injectProcessEnvPlugin({
              NODE_ENV: mode,
              platform: process.platform,
            }),
            // Bundle visualizer (only in production build with ANALYZE flag)
            ...(isProd && process.env.ANALYZE === 'true'
              ? [
                  visualizer({
                    filename: 'bundle-stats.html',
                    open: true,
                    gzipSize: true,
                    brotliSize: true,
                    template: 'treemap',
                  }),
                ]
              : []),
          ],

          input: {
            index: resolve('src/renderer/index.html'),
          },

          output: {
            dir: resolve(devPath, 'renderer'),
            // Production optimizations
            ...(isProd && {
              manualChunks: (id: string) => {
                // React core
                if (id.includes('node_modules/react')) {
                  return 'vendor-react'
                }
                // UI framework
                if (id.includes('framer-motion')) {
                  return 'vendor-animation'
                }
                if (id.includes('lucide-react')) {
                  return 'vendor-icons'
                }
                // Radix UI components (used by shadcn)
                if (id.includes('@radix-ui')) {
                  return 'vendor-radix'
                }
                // Charts
                if (id.includes('recharts') || id.includes('d3')) {
                  return 'vendor-charts'
                }
                // State management
                if (id.includes('zustand')) {
                  return 'vendor-state'
                }
                // Utilities
                if (
                  id.includes('clsx') ||
                  id.includes('tailwind-merge') ||
                  id.includes('class-variance-authority')
                ) {
                  return 'vendor-utils'
                }
              },
            }),
          },
        },
      },
    },
  }
})
