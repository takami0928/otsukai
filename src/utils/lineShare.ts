export const LINE_SHARE_ENDPOINT = 'https://social-plugins.line.me/lineit/share'

export type RequestShareCopyResult = 'copied' | 'failed'

export type ClipboardTextWriter = (text: string) => Promise<void>

export function buildLineShareUrl(requestUrl: string, requestText: string): string {
  return (
    `${LINE_SHARE_ENDPOINT}?url=${encodeURIComponent(requestUrl)}` +
    `&text=${encodeURIComponent(requestText)}`
  )
}

export async function copyRequestShareMessage(
  message: string,
  writeClipboardText?: ClipboardTextWriter,
): Promise<RequestShareCopyResult> {
  if (!writeClipboardText) {
    return 'failed'
  }

  try {
    await writeClipboardText(message)
    return 'copied'
  } catch {
    return 'failed'
  }
}
