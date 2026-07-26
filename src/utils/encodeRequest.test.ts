import { describe, expect, it } from 'vitest'
import { PUBLISHED_V1_REQUEST_FIXTURE } from '../testFixtures/publishedFormats'
import type { ShoppingRequestPayload } from '../types/shopping'
import { decodeShoppingRequest, encodeShoppingRequest } from './encodeRequest'

const LEGACY_PAYLOAD: ShoppingRequestPayload = {
  requestId: 'legacy-request',
  title: '以前の依頼',
  createdAt: '2026-07-01T00:00:00.000Z',
  items: [
    {
      id: 'legacy-item',
      productId: 'milk',
      productNameSnapshot: '牛乳',
      categoryIdSnapshot: 'eggs-dairy',
      categoryNameSnapshot: '卵・乳製品',
      quantity: 1,
      unit: '本',
      memo: '低脂肪',
      iconSnapshot: '🥛',
      sortOrderSnapshot: 701,
    },
  ],
}

describe('shopping request URL compatibility', () => {
  it('decodes a payload produced by the existing memo-based URL format', () => {
    expect(decodeShoppingRequest(PUBLISHED_V1_REQUEST_FIXTURE)).toEqual(
      LEGACY_PAYLOAD,
    )
  })

  it('keeps the existing compressed payload format unchanged', () => {
    expect(encodeShoppingRequest(LEGACY_PAYLOAD)).toBe(
      PUBLISHED_V1_REQUEST_FIXTURE,
    )
  })

  it('preserves legacy quantities above the new creation limit and custom snapshots', () => {
    const legacyWithOldValues: ShoppingRequestPayload = {
      ...LEGACY_PAYLOAD,
      items: [
        { ...LEGACY_PAYLOAD.items[0], quantity: 25 },
        {
          id: 'legacy-custom',
          productId: 'custom:old',
          productNameSnapshot: '昔の自由商品',
          categoryIdSnapshot: 'other',
          categoryNameSnapshot: 'その他',
          quantity: 21,
          unit: '袋',
          memo: '旧URLの条件',
          iconSnapshot: '🛒',
          sortOrderSnapshot: 10000,
        },
      ],
    }

    expect(decodeShoppingRequest(encodeShoppingRequest(legacyWithOldValues))).toEqual(
      legacyWithOldValues,
    )
  })

  it('rejects an invalid encoded payload', () => {
    expect(() => decodeShoppingRequest('not-a-valid-request')).toThrow()
  })
})
