import { describe, expect, it } from 'vitest'
import type { Product } from '../types/product'
import {
  createDraftState,
  createEmptyDraftState,
  createInitialCreateRequestState,
  decreaseQuantity,
  getSavedExpandedProductIds,
  increaseQuantity,
  toggleExpandedProductId,
} from './createRequestState'

const productList: Product[] = [
  {
    id: 'apple',
    name: 'りんご',
    categoryId: 'fruits',
    defaultQuantity: 2,
    unit: '玉',
    memo: '王林かフジ',
    icon: '🍎',
    sortOrder: 1,
  },
  {
    id: 'milk',
    name: '牛乳',
    categoryId: 'dairy',
    defaultQuantity: 1,
    unit: '本',
    icon: '🥛',
    sortOrder: 2,
  },
]

describe('create request draft state', () => {
  it('restores valid quantities and conditions while filling missing products', () => {
    expect(
      createDraftState(
        {
          apple: { quantity: 3, memo: '安い方でOK' },
        },
        productList,
      ),
    ).toEqual({
      apple: { quantity: 3, memo: '安い方でOK' },
      milk: { quantity: 0, memo: '' },
    })
  })

  it('normalizes invalid draft values without crashing', () => {
    expect(createDraftState(null, productList)).toEqual({
      apple: { quantity: 0, memo: '王林かフジ' },
      milk: { quantity: 0, memo: '' },
    })

    expect(
      createDraftState(
        {
          apple: { quantity: '2', memo: 10 },
          milk: { quantity: -1, memo: [] },
        },
        productList,
      ),
    ).toEqual({
      apple: { quantity: 0, memo: '王林かフジ' },
      milk: { quantity: 0, memo: '' },
    })
  })

  it('creates a completely empty reset draft without master conditions', () => {
    expect(createEmptyDraftState(productList)).toEqual({
      apple: { quantity: 0, memo: '' },
      milk: { quantity: 0, memo: '' },
    })
  })

  it('opens only products with non-empty saved conditions', () => {
    const saved = {
      apple: { quantity: 0, memo: '王林かフジ' },
      milk: { quantity: 1, memo: '低脂肪' },
      unknown: { quantity: 1, memo: '対象外' },
    }

    expect([...getSavedExpandedProductIds(saved, productList)]).toEqual(['apple', 'milk'])
    expect([...createInitialCreateRequestState(saved, productList).expandedProductIds]).toEqual([
      'apple',
      'milk',
    ])
    expect([
      ...getSavedExpandedProductIds({ apple: { quantity: 0, memo: '   ' } }, productList),
    ]).toEqual([])
  })
})

describe('create request quantity changes', () => {
  it('always increases one at a time regardless of master default quantity', () => {
    const quantities = [0]
    for (let index = 0; index < 4; index += 1) {
      quantities.push(increaseQuantity(quantities[quantities.length - 1]))
    }

    expect(quantities).toEqual([0, 1, 2, 3, 4])
  })

  it('decreases one at a time without going below zero', () => {
    const quantities = [4]
    for (let index = 0; index < 5; index += 1) {
      quantities.push(decreaseQuantity(quantities[quantities.length - 1]))
    }

    expect(quantities).toEqual([4, 3, 2, 1, 0, 0])
  })
})

describe('create request condition expansion', () => {
  it('adds and removes one product without mutating the previous set', () => {
    const original = new Set(['apple'])
    const withMilk = toggleExpandedProductId(original, 'milk')
    const withoutApple = toggleExpandedProductId(withMilk, 'apple')

    expect([...original]).toEqual(['apple'])
    expect([...withMilk]).toEqual(['apple', 'milk'])
    expect([...withoutApple]).toEqual(['milk'])
    expect(withMilk).not.toBe(original)
    expect(withoutApple).not.toBe(withMilk)
  })
})
