import { describe, expect, it } from 'vitest'
import type { CheckedStateMap, ShoppingRequestItemPayload } from '../types/shopping'
import {
  getItemStatus,
  getShoppingCompletionState,
  normalizeCheckedState,
} from './shoppingState'

const createItem = (
  id: string,
  memo?: string,
  sortOrderSnapshot = 1,
): ShoppingRequestItemPayload => ({
  id,
  productId: id,
  productNameSnapshot: id,
  categoryIdSnapshot: 'category',
  categoryNameSnapshot: 'Category',
  quantity: 1,
  unit: '個',
  memo,
  iconSnapshot: '🛒',
  sortOrderSnapshot,
})

describe('shopping checked state', () => {
  it('keeps legacy pending and inCart values and accepts verified', () => {
    const raw = {
      milk: 'pending',
      bread: 'inCart',
      eggs: 'verified',
    }

    expect(normalizeCheckedState(raw)).toEqual(raw)
  })

  it('treats unknown localStorage values as pending by omitting them', () => {
    expect(
      normalizeCheckedState({
        milk: 'lost',
        bread: true,
        eggs: 'verified',
      }),
    ).toEqual({ eggs: 'verified' })
  })

  it('returns pending for missing or unknown item statuses', () => {
    expect(getItemStatus({}, 'milk')).toBe('pending')
    expect(getItemStatus({ milk: 'lost' } as unknown as CheckedStateMap, 'milk')).toBe('pending')
  })

  it('requires pending to be zero and memo items to be verified before completion', () => {
    const memoItem = createItem('milk', '低脂肪')
    const plainItem = createItem('bread')
    const items = [memoItem, plainItem]

    expect(getShoppingCompletionState(items, { milk: 'inCart', bread: 'inCart' })).toEqual({
      pendingCount: 0,
      needsVerificationCount: 1,
      isReadyForCheckoutReview: true,
      isComplete: false,
    })

    expect(getShoppingCompletionState(items, { milk: 'verified', bread: 'inCart' })).toEqual({
      pendingCount: 0,
      needsVerificationCount: 0,
      isReadyForCheckoutReview: true,
      isComplete: true,
    })
  })
})
