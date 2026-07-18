export type ShareTextResult = 'shared' | 'copied' | 'cancelled' | 'failed'

export type ShareTextInput = {
  title: string
  text: string
  url?: string
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

export function buildClipboardShareText(input: ShareTextInput): string {
  const url = input.url?.trim()

  if (!url || input.text.includes(url)) {
    return input.text
  }

  const text = input.text.trimEnd()
  return text ? `${text}\n\n${url}` : url
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
    await dependencies.writeClipboardText(buildClipboardShareText(input))
    return 'copied'
  } catch {
    return 'failed'
  }
}
