import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { ShoppingRequestPayload } from '../types/shopping'

function isValidPayload(value: unknown): value is ShoppingRequestPayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const payload = value as Partial<ShoppingRequestPayload>
  return (
    typeof payload.requestId === 'string' &&
    typeof payload.title === 'string' &&
    typeof payload.createdAt === 'string' &&
    Array.isArray(payload.items)
  )
}

export function encodeShoppingRequest(payload: ShoppingRequestPayload): string {
  const json = JSON.stringify(payload)
  return compressToEncodedURIComponent(json)
}

export function decodeShoppingRequest(encoded: string): ShoppingRequestPayload {
  try {
    const json = decompressFromEncodedURIComponent(encoded)

    if (!json) {
      throw new Error('共有URLの復元に失敗しました。')
    }

    const parsed = JSON.parse(json) as unknown

    if (!isValidPayload(parsed)) {
      throw new Error('共有URLの形式が正しくありません。')
    }

    return parsed
  } catch (error) {
    const message = error instanceof Error ? error.message : '共有URLの復元に失敗しました。'
    throw new Error(message)
  }
}
