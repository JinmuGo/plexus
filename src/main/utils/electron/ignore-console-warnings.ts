export function ignoreConsoleWarnings(warningsToIgnore: string[]) {
  const originalEmitWarning = process.emitWarning
  const originalConsoleError = console.error

  process.emitWarning = (warning, ...args) => {
    if (
      typeof warning === 'string' &&
      warningsToIgnore.length > 0 &&
      warningsToIgnore.some(ignoredWarning => warning.includes(ignoredWarning))
    ) {
      return
    }

    originalEmitWarning(warning, ...(args as string[]))
  }

  console.error = (warning, ...args) => {
    if (
      typeof warning === 'string' &&
      warningsToIgnore.length > 0 &&
      warningsToIgnore.some(ignoredWarning => warning.includes(ignoredWarning))
    ) {
      return
    }

    originalConsoleError(warning, ...args)
  }
}
