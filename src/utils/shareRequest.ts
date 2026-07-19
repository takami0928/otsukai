import { isShareCancellation } from './shareText'
import { MAX_SHARE_URL_LENGTH } from '../constants/requestLimits'

export type RequestShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'
export type RequestShareFunction = (data: ShareData) => Promise<void>
export type ClipboardTextWriter = (text: string) => Promise<void>

export type RequestShareLock = {
  tryAcquire: () => boolean
  release: () => void
  isActive: () => boolean
}

export function createRequestShareLock(): RequestShareLock {
  let active = false
  return {
    tryAcquire: () => {
      if (active) {
        return false
      }
      active = true
      return true
    },
    release: () => {
      active = false
    },
    isActive: () => active,
  }
}

export function isRequestUrlWithinShareLimit(requestUrl: string): boolean {
  return requestUrl.length <= MAX_SHARE_URL_LENGTH
}

function getBrowserShare(): RequestShareFunction | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.share?.bind(navigator)
}

function getBrowserClipboardWriter(): ClipboardTextWriter | undefined {
  return typeof navigator === 'undefined'
    ? undefined
    : navigator.clipboard?.writeText?.bind(navigator.clipboard)
}

export async function shareRequest(
  title: string,
  message: string,
  share: RequestShareFunction | undefined = getBrowserShare(),
  writeClipboardText: ClipboardTextWriter | undefined = getBrowserClipboardWriter(),
): Promise<RequestShareResult> {
  if (share) {
    try {
      await share({ title, text: message })
      return 'shared'
    } catch (error) {
      if (isShareCancellation(error)) {
        return 'cancelled'
      }
    }
  }

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
