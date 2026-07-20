// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { products } from '../data/products'
import { decodeCompactRequest } from '../utils/compactRequest'
import { CreateRequestPage } from './CreateRequestPage'

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set
  if (!setter) {
    throw new Error('HTMLInputElement.value setter is unavailable')
  }
  setter.call(input, value)
}

describe('CreateRequestPage simplified request form', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    window.localStorage.clear()
    window.history.replaceState({}, '', '/#/create')
    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
    delete (window.navigator as unknown as Record<string, unknown>).share
    delete (window.navigator as unknown as Record<string, unknown>).clipboard
    vi.restoreAllMocks()
  })

  async function renderPage() {
    await act(async () => {
      root.render(<CreateRequestPage onBackHome={() => undefined} />)
      await Promise.resolve()
    })
  }

  function button(label: string): HTMLButtonElement {
    const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    )
    if (!found) {
      throw new Error(`Button was not rendered: ${label}`)
    }
    return found
  }

  async function clickAndFlush(element: Element) {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  async function inputText(selector: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(selector)
    if (!input) {
      throw new Error(`Input was not rendered: ${selector}`)
    }
    await act(async () => {
      setNativeInputValue(input, value)
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: value,
          inputType: 'insertText',
        }),
      )
      await Promise.resolve()
    })
    return input
  }

  function saveDraftWithConditionTotal(total: number) {
    let remaining = total
    const saved = Object.fromEntries(
      products.map((product, index) => {
        const length = Math.min(30, remaining)
        remaining -= length
        return [
          product.id,
          {
            quantity: length > 0 ? 1 : 0,
            memo: length > 0 ? String.fromCodePoint(0x4e00 + index).repeat(length) : '',
          },
        ]
      }),
    )
    window.localStorage.setItem('otsukai:createDraft', JSON.stringify(saved))
  }

  function saveDraftWithHighEntropyConditions(total: number) {
    let remaining = total
    let characterIndex = 0
    const saved = Object.fromEntries(
      products.map((product) => {
        const length = Math.min(30, remaining)
        remaining -= length
        const memo = Array.from({ length }, () => {
          const character = String.fromCodePoint(0x4e00 + characterIndex)
          characterIndex += 1
          return character
        }).join('')
        return [product.id, { quantity: length > 0 ? 1 : 0, memo }]
      }),
    )
    window.localStorage.setItem('otsukai:createDraft', JSON.stringify(saved))
  }

  it('hides the title and normal limit summary in the initial state', async () => {
    await renderPage()

    expect(container.textContent).not.toContain('依頼タイトル')
    expect(container.querySelector('#request-title-count')).toBeNull()
    expect(container.querySelector('.request-limit-notice')).toBeNull()
    expect(container.textContent).not.toContain('共有URL：')
    expect(container.textContent).not.toContain('条件はあと')
  })

  it('shows the condition warning at 800 characters, not 799, and removes it when resolved', async () => {
    saveDraftWithConditionTotal(799)
    await renderPage()
    expect(container.querySelector('.request-limit-notice')).toBeNull()

    act(() => root.unmount())
    container.replaceChildren()
    root = createRoot(container)
    saveDraftWithConditionTotal(800)
    await renderPage()
    expect(container.textContent).toContain('条件の合計が上限に近づいています。')
    expect(container.textContent).toContain('現在 800 / 1,000文字です。')

    const lastSelectedProduct = products[26]
    const decrease = container.querySelector<HTMLButtonElement>(
      `button[aria-label^="${lastSelectedProduct.name}を1個減らす"]`,
    )
    if (!decrease) {
      throw new Error('Last selected product decrement was not rendered')
    }
    await clickAndFlush(decrease)
    expect(container.querySelector('.request-limit-notice')).toBeNull()
  })

  it('shows an error only after a field value is truncated and removes it after correction', async () => {
    await renderPage()
    await clickAndFlush(button('＋ リストにないものを追加'))

    const name = await inputText(
      '[aria-describedby="custom-name-count"]',
      '商'.repeat(31),
    )
    expect(name.value).toBe('商'.repeat(30))
    expect(container.textContent).toContain('自由追加の商品名は30文字までです。')
    expect(container.querySelector('.request-limit-notice.is-error')).not.toBeNull()

    await inputText('[aria-describedby="custom-name-count"]', '洗剤')
    expect(container.querySelector('.request-limit-notice')).toBeNull()
  })

  it('shows a sharing warning when the real generated URL reaches the warning range', async () => {
    saveDraftWithHighEntropyConditions(1_000)
    await renderPage()

    expect(container.textContent).toContain('共有データ量が上限に近づいています。')
    expect(container.textContent).toContain(
      'これ以上内容を追加すると、LINEで共有できない可能性があります。',
    )
  })

  it('keeps the unit in details, preserves edits, and leaves the condition visible', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined)
    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: share,
    })
    await renderPage()
    await clickAndFlush(button('＋ リストにないものを追加'))
    await inputText('[aria-describedby="custom-name-count"]', 'お米')

    const detailsButton = button('詳細設定')
    expect(detailsButton.getAttribute('aria-expanded')).toBe('false')
    expect(detailsButton.getAttribute('aria-controls')).toBe('custom-item-details')
    expect(container.querySelector('[aria-describedby="custom-unit-count"]')).toBeNull()
    expect(container.querySelector('[aria-describedby="custom-condition-count"]')).not.toBeNull()

    await clickAndFlush(detailsButton)
    expect(button('詳細設定を閉じる').getAttribute('aria-expanded')).toBe('true')
    await inputText('[aria-describedby="custom-unit-count"]', '袋')
    await clickAndFlush(button('詳細設定を閉じる'))
    expect(container.querySelector('[aria-describedby="custom-unit-count"]')).toBeNull()
    expect(container.querySelector('[aria-describedby="custom-condition-count"]')).not.toBeNull()
    await clickAndFlush(button('詳細設定'))
    expect(
      container.querySelector<HTMLInputElement>('[aria-describedby="custom-unit-count"]')
        ?.value,
    ).toBe('袋')

    await clickAndFlush(button('追加'))
    expect(container.textContent).toContain('お米 1袋')
    await clickAndFlush(button('編集'))
    expect(button('詳細設定を閉じる').getAttribute('aria-expanded')).toBe('true')
    expect(
      container.querySelector<HTMLInputElement>('[aria-describedby="custom-unit-count"]')
        ?.value,
    ).toBe('袋')
    await clickAndFlush(button('変更を保存'))
    await clickAndFlush(button('確認へ'))
    await clickAndFlush(button('LINEで送る'))

    const requestUrl = share.mock.calls[0][0].text?.split('\n').at(-1) ?? ''
    const encoded = new URL(requestUrl).hash.slice('#/l/'.length)
    expect(decodeCompactRequest(encoded).items[0]).toMatchObject({
      productNameSnapshot: 'お米',
      unit: '袋',
    })
  })

  it('uses 個 when details stay closed and resets details after save', async () => {
    await renderPage()
    await clickAndFlush(button('＋ リストにないものを追加'))
    await inputText('[aria-describedby="custom-name-count"]', 'ティッシュ')
    await clickAndFlush(button('追加'))

    expect(container.textContent).toContain('ティッシュ 1個')
    await clickAndFlush(button('＋ リストにないものを追加'))
    expect(button('詳細設定').getAttribute('aria-expanded')).toBe('false')
    await clickAndFlush(button('詳細設定'))
    expect(
      container.querySelector<HTMLInputElement>('[aria-describedby="custom-unit-count"]')
        ?.value,
    ).toBe('個')
  })

  it('creates and reuses a v2 URL whose internal title is fixed', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined)
    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: share,
    })
    await renderPage()
    const increase = container.querySelector<HTMLButtonElement>(
      `button[aria-label^="${products[0].name}を1個増やす"]`,
    )
    if (!increase) {
      throw new Error('Product increment was not rendered')
    }
    await clickAndFlush(increase)
    await clickAndFlush(button('確認へ'))
    await clickAndFlush(button('LINEで送る'))
    await clickAndFlush(button('LINEで送る'))

    expect(share).toHaveBeenCalledTimes(2)
    const urls = share.mock.calls.map(([data]) => data.text?.split('\n').at(-1) ?? '')
    expect(urls[0]).toBe(urls[1])
    const encoded = new URL(urls[0]).hash.slice('#/l/'.length)
    expect(decodeCompactRequest(encoded).title).toBe('おつかいリスト')
    expect(share.mock.calls[0][0].title).toBe('おつかい依頼')

    const returnState = window.history.state?.otsukaiCreateRequestReturnState
    expect(returnState).not.toHaveProperty('title')
  })

  it.each([
    { label: 'has no title', legacyTitle: undefined },
    { label: 'has an old title', legacyTitle: '過去の可変タイトル' },
  ])('restores review data when return history $label', async ({ legacyTitle }) => {
    window.history.replaceState(
      {
        otsukaiCreateRequestReturnState: {
          ...(legacyTitle ? { title: legacyTitle } : {}),
          customItems: [
            {
              id: 'custom-old',
              name: '保存した商品',
              quantity: 2,
              unit: '本',
              memo: '細め',
            },
          ],
          expandedProductIds: [],
          sharedUrl: 'https://example.test/#/l/old',
          sharedSnapshot: 'old-snapshot',
        },
      },
      '',
      '/#/create',
    )
    await renderPage()

    expect(container.textContent).toContain('依頼内容の確認')
    expect(container.textContent).toContain('保存した商品')
    expect(container.textContent).toContain('2本')
    if (legacyTitle) {
      expect(container.textContent).not.toContain(legacyTitle)
    }
  })
})
