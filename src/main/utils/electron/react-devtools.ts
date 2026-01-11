import { resolve } from 'node:path'
import { session } from 'electron'
import { devLog } from '../../lib/utils'

export async function loadReactDevtools() {
  const reactDevToolsPath = resolve(
    'src',
    'main',
    'extensions',
    'react-developer-tools'
  )

  try {
    await session.defaultSession.extensions.loadExtension(reactDevToolsPath, {
      allowFileAccess: true,
    })

    devLog.log('\nReact Developer Tools loaded!\n')
  } catch (err) {
    devLog.error('Error loading React Developer Tools:', err)
  }
}
