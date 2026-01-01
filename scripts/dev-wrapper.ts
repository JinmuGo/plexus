import { spawn } from 'child_process'
import { createInterface } from 'readline'

const child = spawn('cross-env', ['NODE_ENV=development', 'electron-vite', 'dev', '--watch'], {
  shell: true,
  stdio: ['inherit', 'inherit', 'pipe'],
})

const IGNORE_PATTERNS = [
  'Request Autofill.enable failed',
  'Request Autofill.setAddresses failed',
  'Electron sandboxed_renderer.bundle.js script failed to run',
  'TypeError: object null is not iterable',
]

const stderrRl = createInterface({
  input: child.stderr,
  terminal: false,
})

stderrRl.on('line', (line) => {
  if (IGNORE_PATTERNS.some((p) => line.includes(p))) {
    return
  }
  console.error(line)
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
