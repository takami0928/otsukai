import { describe, expect, it } from 'vitest'
import type { Product } from '../types/product'
import {
  createDraftState,
  createEmptyDraftState,
  createInitialCreateRequestState,
  decreaseQuantity,
  getSavedExpandedProductIds,
  hasAnyCreateRequestInput,
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

describe('create request reset confirmation', () => {
  const createInputState = () => ({
    title: '今日のおつかい',
    defaultTitle: '今日のおつかい',
    draft: createDraftState(undefined, productList),
    productList,
    customItemCount: 0,
    isCustomFormOpen: false,
    customName: '',
    customQuantity: 1,
    customUnit: '個',
    customMemo: '',
    sharedUrl: '',
    lastSharedUrl: '',
    mode: 'edit',
    copyMessage: '',
  })

  it('does not require confirmation for the untouched initial state', () => {
    expect(hasAnyCreateRequestInput(createInputState())).toBe(false)
  })

  it('requires confirmation when only a quantity is selected', () => {
    const state = createInputState()
    state.draft = {
      ...state.draft,
      milk: { ...state.draft.milk, quantity: 1 },
    }

    expect(hasAnyCreateRequestInput(state)).toBe(true)
  })

  it('requires confirmation for a user condition even when quantity is zero', () => {
    const state = createInputState()
    state.draft = {
      ...state.draft,
      milk: { quantity: 0, memo: '低脂肪' },
    }

    expect(hasAnyCreateRequestInput(state)).toBe(true)
  })

  it('requires confirmation when a master condition changes to another value', () => {
    const state = createInputState()
    state.draft = {
      ...state.draft,
      apple: { quantity: 0, memo: 'ふじのみ' },
    }

    expect(hasAnyCreateRequestInput(state)).toBe(true)
  })

  it('requires confirmation when only the title changes', () => {
    expect(
      hasAnyCreateRequestInput({ ...createInputState(), title: '週末のおつかい' }),
    ).toBe(true)
  })

  it.each([
    ['商品名', { customName: '洗濯ネット' }],
    ['条件', { customMemo: '大きめ' }],
    ['数量', { customQuantity: 2 }],
    ['単位', { customUnit: '袋' }],
  ])('requires confirmation for an in-progress custom item %s change', (_, change) => {
    expect(hasAnyCreateRequestInput({ ...createInputState(), ...change })).toBe(true)
  })

  it('requires confirmation when only the custom item form is open', () => {
    expect(
      hasAnyCreateRequestInput({ ...createInputState(), isCustomFormOpen: true }),
    ).toBe(true)
  })

  it('requires confirmation for an added custom item', () => {
    expect(hasAnyCreateRequestInput({ ...createInputState(), customItemCount: 1 })).toBe(true)
  })

  it('requires confirmation when a shared URL exists', () => {
    expect(
      hasAnyCreateRequestInput({ ...createInputState(), sharedUrl: 'https://example.com/list' }),
    ).toBe(true)
  })

  it('requires confirmation when only the last saved shared URL exists', () => {
    expect(
      hasAnyCreateRequestInput({
        ...createInputState(),
        lastSharedUrl: 'https://example.com/saved-list',
      }),
    ).toBe(true)
  })

  it.each(['review', 'shared'])('requires confirmation in %s mode', (mode) => {
    expect(hasAnyCreateRequestInput({ ...createInputState(), mode })).toBe(true)
  })

  it('requires confirmation when a copy result message exists', () => {
    expect(
      hasAnyCreateRequestInput({ ...createInputState(), copyMessage: 'コピーしました' }),
    ).toBe(true)
  })

  it('ignores untouched product master conditions', () => {
    const state = createInputState()
    expect(state.draft.apple.memo).toBe('王林かフジ')
    expect(hasAnyCreateRequestInput(state)).toBe(false)
  })

  it('treats a completely empty reset draft as having no input', () => {
    expect(
      hasAnyCreateRequestInput({
        ...createInputState(),
        draft: createEmptyDraftState(productList),
      }),
    ).toBe(false)
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
