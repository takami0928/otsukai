export type ShareTextResult = 'shared' | 'copied' | 'cancelled' | 'failed'

export type ShareTextInput = {
  title: string
  text: string
}

export type ShareTextDependencies = {
  share?: (data: ShareData) => Promise<void>
  writeClipboardText?: (text: string) => Promise<void>
}

export function isShareCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function getBrowserDependencies(): ShareTextDependencies {
  if (typeof navigator === 'undefined') {
    return {}
  }

  return {
    share: navigator.share?.bind(navigator),
    writeClipboardText: navigator.clipboard?.writeText?.bind(navigator.clipboard),
  }
}

export async function shareText(
  input: ShareTextInput,
  dependencies: ShareTextDependencies = getBrowserDependencies(),
): Promise<ShareTextResult> {
  if (dependencies.share) {
    try {
      await dependencies.share(input)
      return 'shared'
    } catch (error) {
      if (isShareCancellation(error)) {
        return 'cancelled'
      }
    }
  }

  if (!dependencies.writeClipboardText) {
    return 'failed'
  }

  try {
    await dependencies.writeClipboardText(input.text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
