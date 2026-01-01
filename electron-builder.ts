/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: <> */
import type { Configuration } from 'electron-builder'
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses'
import { join } from 'node:path'

import {
  main,
  name,
  version,
  resources,
  description,
  displayName,
  author as _author,
} from './package.json'

import { getDevFolder } from './scripts/release/utils/path'

const author = _author?.name ?? _author
const currentYear = new Date().getFullYear()
const authorInKebabCase = author.replace(/\s+/g, '-')
const appId = `com.${authorInKebabCase}.${name}`.toLowerCase()

const artifactName = `${name}-v${version}-\${os}-\${arch}.\${ext}`

export default {
  appId,
  productName: displayName,
  copyright: `Copyright © ${currentYear} — ${author}`,

  // GitHub Releases publish configuration
  publish: {
    provider: 'github',
    owner: 'JinmuGo',
    repo: name,
    releaseType: 'release',
  },

  directories: {
    app: getDevFolder(main),
    output: `dist/v${version}`,
  },

  extraResources: [
    {
      from: `${resources}/build/tray`,
      to: 'tray',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.dev/hooks',
      to: 'hooks',
      filter: ['**/*'],
    },
    {
      from: `${resources}/build/icons`,
      to: 'icons',
      filter: ['**/*'],
    },
  ],

  mac: {
    artifactName,
    icon: `${resources}/build/icons/icon.icns`,
    category: 'public.app-category.utilities',
    target: ['zip', 'dmg', 'dir'],
  },

  linux: {
    artifactName,
    category: 'Utilities',
    synopsis: description,
    target: ['AppImage', 'deb', 'pacman', 'freebsd', 'rpm'],
  },

  win: {
    artifactName,
    icon: `${resources}/build/icons/icon.ico`,
    target: ['zip', 'portable'],
  },

  // Security hardening: Flip Electron fuses after packaging
  afterPack: async context => {
    const { electronPlatformName, appOutDir, packager } = context
    const productFilename = packager.appInfo.productFilename

    let appPath: string
    switch (electronPlatformName) {
      case 'darwin':
        appPath = join(appOutDir, `${productFilename}.app`)
        break
      case 'win32':
        appPath = join(appOutDir, `${productFilename}.exe`)
        break
      default:
        // Linux: executable name is the package name (lowercase), not productName
        appPath = join(appOutDir, name)
        break
    }

    await flipFuses(appPath, {
      version: FuseVersion.V1,
      // Disable ELECTRON_RUN_AS_NODE environment variable
      [FuseV1Options.RunAsNode]: false,
      // Disable --inspect and --inspect-brk CLI arguments
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // Disable ELECTRON_RUN_AS_NODE in child_process.fork
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      // Enable cookie encryption
      [FuseV1Options.EnableCookieEncryption]: true,
    })
  },
} satisfies Configuration
