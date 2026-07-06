import type { CheckedItemStatus, CheckedStateMap, ShoppingRequestItemPayload } from '../types/shopping'

const VALID_CHECKED_STATUSES = new Set<CheckedItemStatus>(['pending', 'inCart', 'verified'])

export type ShoppingCompletionState = {
  pendingCount: number
  needsVerificationCount: number
  isReadyForCheckoutReview: boolean
  isComplete: boolean
}

export function isCheckedItemStatus(value: unknown): value is CheckedItemStatus {
  return typeof value === 'string' && VALID_CHECKED_STATUSES.has(value as CheckedItemStatus)
}

export function normalizeCheckedState(value: unknown): CheckedStateMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const normalized: CheckedStateMap = {}
  for (const [itemId, status] of Object.entries(value)) {
    if (isCheckedItemStatus(status)) {
      normalized[itemId] = status
    }
  }

  return normalized
}

export function getItemStatus(
  checkedState: CheckedStateMap,
  itemId: string,
): CheckedItemStatus {
  const status = checkedState[itemId]
  return isCheckedItemStatus(status) ? status : 'pending'
}

export function hasCondition(item: ShoppingRequestItemPayload): boolean {
  return Boolean(item.memo?.trim())
}

export function getShoppingCompletionState(
  items: ShoppingRequestItemPayload[],
  checkedState: CheckedStateMap,
): ShoppingCompletionState {
  const pendingCount = items.filter((item) => getItemStatus(checkedState, item.id) === 'pending').length
  const needsVerificationCount = items.filter(
    (item) => hasCondition(item) && getItemStatus(checkedState, item.id) !== 'verified',
  ).length

  return {
    pendingCount,
    needsVerificationCount,
    isReadyForCheckoutReview: pendingCount === 0 && items.length > 0,
    isComplete: pendingCount === 0 && needsVerificationCount === 0 && items.length > 0,
  }
}
