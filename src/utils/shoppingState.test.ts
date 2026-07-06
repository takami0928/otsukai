import { describe, expect, it } from 'vitest'
import type { CheckedStateMap, ShoppingRequestItemPayload } from '../types/shopping'
import {
  addToCartOrder,
  createCheckedStatusChange,
  getCartItemsInCartOrder,
  getItemStatus,
  getShoppingCompletionState,
  normalizeCheckedState,
  normalizeCartOrder,
  removeFromCartOrder,
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

  it('creates exactly one undo history entry for each persistent status transition', () => {
    expect(createCheckedStatusChange({}, 'milk', 'inCart')).toEqual({
      itemId: 'milk',
      previousStatus: 'pending',
      nextStatus: 'inCart',
    })
    expect(createCheckedStatusChange({ milk: 'inCart' }, 'milk', 'pending')).toEqual({
      itemId: 'milk',
      previousStatus: 'inCart',
      nextStatus: 'pending',
    })
    expect(createCheckedStatusChange({ milk: 'inCart' }, 'milk', 'verified')).toEqual({
      itemId: 'milk',
      previousStatus: 'inCart',
      nextStatus: 'verified',
    })
    expect(createCheckedStatusChange({ milk: 'verified' }, 'milk', 'inCart')).toEqual({
      itemId: 'milk',
      previousStatus: 'verified',
      nextStatus: 'inCart',
    })
    expect(createCheckedStatusChange({ milk: 'verified' }, 'milk', 'pending')).toEqual({
      itemId: 'milk',
      previousStatus: 'verified',
      nextStatus: 'pending',
    })
  })

  it('does not create undo history when the persistent status does not change', () => {
    expect(createCheckedStatusChange({ milk: 'inCart' }, 'milk', 'inCart')).toBeNull()
  })

  it('normalizes cart order by keeping strings once in their first-seen order', () => {
    expect(normalizeCartOrder('milk')).toEqual([])
    expect(normalizeCartOrder(['milk', 1, 'bread', 'milk', true, 'eggs'])).toEqual([
      'milk',
      'bread',
      'eggs',
    ])
  })

  it('adds cart order entries without duplicates', () => {
    expect(addToCartOrder(['milk'], 'bread')).toEqual(['milk', 'bread'])
    expect(addToCartOrder(['milk', 'bread'], 'milk')).toEqual(['milk', 'bread'])
  })

  it('removes cart order entries', () => {
    expect(removeFromCartOrder(['milk', 'bread', 'eggs'], 'bread')).toEqual(['milk', 'eggs'])
    expect(removeFromCartOrder(['milk', 'bread'], 'tomato')).toEqual(['milk', 'bread'])
  })

  it('returns cart items in cart order with missing ordered items appended by sort order', () => {
    const items = [
      createItem('milk', undefined, 30),
      createItem('tomato', undefined, 10),
      createItem('bread', undefined, 20),
      createItem('eggs', undefined, 40),
    ]

    expect(
      getCartItemsInCartOrder(
        items,
        {
          milk: 'inCart',
          tomato: 'verified',
          bread: 'inCart',
          eggs: 'pending',
        },
        ['missing', 'tomato', 'tomato', 'milk', 'eggs'],
      ).map((item) => item.id),
    ).toEqual(['tomato', 'milk', 'bread'])
  })
})
