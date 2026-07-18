import { describe, expect, it } from 'vitest'
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

const LEGACY_ENCODED =
  'N4IgTgpgjgrhDOAXAkgExALhAGwgcwEMBjATwFpJYFEQAaERAS0V0xEFO5QWSVA7BkFz5QHgy6IIpAKIIqAII0sAJgAMsgGxl5AdlUBGACrz5GPQfkA6PfIBaQ5hAC28TAG1QjdFlyFSZazaEAHMAD2qDBEKK4gNozYANZ+gcGhAHIENhAAygB2BL7wABYBMiCA2k6AznJCRGL4AWAkaJnZeQVs+HjwZKgEjDXllXjVJMmp9Tn5hYCuyoDfDCWAvxGAgypCsAQZTIgkmJr0MBnMbIA05kKpNgFsgHLygECBgFUBVkQBGcONhYB8G4Dau0Lw1YgA8mCoEGD3o0wankmgAvgBdUFAA'

describe('shopping request URL compatibility', () => {
  it('decodes a payload produced by the existing memo-based URL format', () => {
    expect(decodeShoppingRequest(LEGACY_ENCODED)).toEqual(LEGACY_PAYLOAD)
  })

  it('keeps the existing compressed payload format unchanged', () => {
    expect(encodeShoppingRequest(LEGACY_PAYLOAD)).toBe(LEGACY_ENCODED)
  })

  it('rejects an invalid encoded payload', () => {
    expect(() => decodeShoppingRequest('not-a-valid-request')).toThrow()
  })
})
