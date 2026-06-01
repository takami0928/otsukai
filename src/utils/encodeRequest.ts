import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { ShoppingRequestPayload } from '../types/shopping'

function isValidShoppingRequestItem(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }

  const item = value as Record<string, unknown>

  return (
    typeof item.id === 'string' &&
    typeof item.productId === 'string' &&
    typeof item.productNameSnapshot === 'string' &&
    typeof item.categoryIdSnapshot === 'string' &&
    typeof item.categoryNameSnapshot === 'string' &&
    typeof item.quantity === 'number' &&
    Number.isFinite(item.quantity) &&
    typeof item.unit === 'string' &&
    (typeof item.memo === 'undefined' || typeof item.memo === 'string') &&
    typeof item.iconSnapshot === 'string' &&
    typeof item.sortOrderSnapshot === 'number' &&
    Number.isFinite(item.sortOrderSnapshot)
  )
}

function isValidPayload(value: unknown): value is ShoppingRequestPayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const payload = value as Partial<ShoppingRequestPayload>
  return (
    typeof payload.requestId === 'string' &&
    typeof payload.title === 'string' &&
    typeof payload.createdAt === 'string' &&
    Array.isArray(payload.items) &&
    payload.items.every((item) => isValidShoppingRequestItem(item))
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
