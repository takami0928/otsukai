// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { products } from '../data/products'
import type { CreateDraftState, ItemIssueMap } from '../types/shopping'
import {
  buildCompactRequestPayload,
  decodeCompactRequest,
  encodeCompactRequest,
} from '../utils/compactRequest'
import type { CheckedStateMap } from '../types/shopping'
import { ShoppingListPage } from './ShoppingListPage'

function createRequest(
  itemCount = 1,
  firstItemMemo = '',
  requestKey = `shopping-share-${itemCount}`,
) {
  const draft: CreateDraftState = Object.fromEntries(
    products.map((product) => [product.id, { quantity: 0, memo: '' }]),
  )
  products.slice(0, itemCount).forEach((product, index) => {
    draft[product.id] = { quantity: 1, memo: index === 0 ? firstItemMemo : '' }
  })
  const encoded = encodeCompactRequest(
    buildCompactRequestPayload({
      requestKey,
      title: '共有テスト',
      draft,
      customItems: [],
    }),
  )
  return { encoded, payload: decodeCompactRequest(encoded) }
}

function setNavigatorShare(
  share: ((data: ShareData) => Promise<void>) | undefined,
) {
  Object.defineProperty(window.navigator, 'share', {
    configurable: true,
    value: share,
  })
}

function setClipboardWriter(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

describe('ShoppingListPage native sharing', () => {
  let container: HTMLDivElement
  let root: Root
  let rootIsMounted: boolean

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
    setNavigatorShare(undefined)
    setClipboardWriter(async () => undefined)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    rootIsMounted = true
  })

  afterEach(() => {
    if (rootIsMounted) {
      act(() => root.unmount())
    }
    container.remove()
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
    delete (window.navigator as unknown as Record<string, unknown>).share
    delete (window.navigator as unknown as Record<string, unknown>).clipboard
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function renderRequest(encoded: string) {
    window.history.replaceState({}, '', `/#/l/${encoded}`)
    await act(async () => {
      root.render(
        <ShoppingListPage
          encodedPayload={encoded}
          payloadFormat="v2"
          onBackHome={() => undefined}
          onError={(title, description) => {
            throw new Error(`${title}: ${description}`)
          }}
        />,
      )
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

  function click(element: Element) {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  async function clickAndFlush(element: Element) {
    await act(async () => {
      click(element)
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  function storeShoppingState(
    requestId: string,
    checkedState: CheckedStateMap,
    itemIssues: ItemIssueMap = {},
  ) {
    window.localStorage.setItem(
      `otsukai:checked:${requestId}`,
      JSON.stringify(checkedState),
    )
    window.localStorage.setItem(
      `otsukai:itemIssues:${requestId}`,
      JSON.stringify(itemIssues),
    )
  }

  function createDeferredNativeShare() {
    let resolveShare: () => void = () => {}
    const share = vi.fn(
      (_data: ShareData) =>
        new Promise<void>((resolve) => {
          resolveShare = resolve
        }),
    )
    setNavigatorShare(share)
    return {
      share,
      resolve: async () => {
        await act(async () => {
          resolveShare()
          await Promise.resolve()
        })
      },
    }
  }

  function expectTitleAndTextOnly(
    share: ReturnType<typeof vi.fn>,
    title: string,
    expectedText: string,
  ) {
    expect(share).toHaveBeenCalledTimes(1)
    const sharedData = share.mock.calls[0][0] as ShareData
    expect(sharedData.title).toBe(title)
    expect(sharedData.text).toContain(expectedText)
    expect(Object.keys(sharedData).sort()).toEqual(['text', 'title'])
    expect('url' in sharedData).toBe(false)
  }

  async function openNewConsultation() {
    await clickAndFlush(button('買えない・相談する'))
    const reason = container.querySelector<HTMLInputElement>(
      'input[type="radio"][value="soldOut"]',
    )
    if (!reason) {
      throw new Error('Consultation reason was not rendered')
    }
    await clickAndFlush(reason)
  }

  async function addToConsultation() {
    await openNewConsultation()
    await clickAndFlush(button('相談リストに追加'))
  }

  it('adds an item to the consultation list without sharing, then shares one individual message', async () => {
    const deferred = createDeferredNativeShare()
    const { encoded, payload } = createRequest()
    await renderRequest(encoded)
    await addToConsultation()

    expect(deferred.share).not.toHaveBeenCalled()
    const savedBeforeShare = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    const savedIssues = JSON.parse(
      window.localStorage.getItem(`otsukai:itemIssues:${payload.requestId}`) ?? '{}',
    ) as ItemIssueMap
    expect(savedBeforeShare[payload.items[0].id]).toBe('consulting')
    expect(savedIssues[payload.items[0].id]).toEqual({ reason: 'soldOut' })
    expect(button('相談する 1件')).toBeDefined()

    act(() => {
      const shareButton = button('相談する 1件')
      click(shareButton)
      click(shareButton)
    })
    expectTitleAndTextOnly(deferred.share, 'おつかい相談', '【おつかい相談】')
    await deferred.resolve()

    const saved = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    expect(saved[payload.items[0].id]).toBe('consulting')
    expect(container.textContent).toContain('共有画面を開きました。')
    expect(container.textContent).toContain('LINEを選択して送信してください。')
  })

  it('uses the same button to share an existing single consultation again', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined)
    setNavigatorShare(share)
    const { encoded, payload } = createRequest()
    const itemId = payload.items[0].id
    storeShoppingState(
      payload.requestId,
      { [itemId]: 'consulting' },
      { [itemId]: { reason: 'notFound' } },
    )
    await renderRequest(encoded)

    await clickAndFlush(button('相談する 1件'))
    await clickAndFlush(button('相談する 1件'))

    expect(share).toHaveBeenCalledTimes(2)
    for (const [sharedData] of share.mock.calls) {
      expect(sharedData.title).toBe('おつかい相談')
      expect(sharedData.text).toContain('商品が見つからない')
      expect(Object.keys(sharedData).sort()).toEqual(['text', 'title'])
    }
  })

  it('uses the unified button for a bulk consultation', async () => {
    const deferred = createDeferredNativeShare()
    const { encoded, payload } = createRequest(2)
    const [first, second] = payload.items
    storeShoppingState(
      payload.requestId,
      { [first.id]: 'consulting', [second.id]: 'consulting' },
      {
        [first.id]: { reason: 'soldOut' },
        [second.id]: { reason: 'conditionMismatch' },
      },
    )
    await renderRequest(encoded)

    act(() => {
      const shareButton = button('相談する 2件')
      click(shareButton)
      click(shareButton)
    })
    expectTitleAndTextOnly(
      deferred.share,
      'おつかい相談',
      '次の商品について確認をお願いします。',
    )
    await deferred.resolve()
  })

  it('does not render legacy individual, reconsultation, or bulk button labels', async () => {
    const { encoded, payload } = createRequest(2)
    const [first, second] = payload.items
    storeShoppingState(
      payload.requestId,
      { [first.id]: 'consulting', [second.id]: 'consulting' },
      {
        [first.id]: { reason: 'soldOut' },
        [second.id]: { reason: 'notFound' },
      },
    )
    await renderRequest(encoded)

    expect(container.textContent).not.toContain('LINEで相談')
    expect(container.textContent).not.toContain('LINEで再相談')
    expect(container.textContent).not.toContain('まとめてLINEで相談')
    expect(button('相談する 2件')).toBeDefined()
  })

  it('always shows the fixed shopping heading even when the shared title differs', async () => {
    const { encoded } = createRequest()
    await renderRequest(encoded)

    expect(container.querySelector('h1')?.textContent).toBe('おつかいリスト')
    expect(container.textContent).not.toContain('共有テスト')
    expect(container.textContent).not.toContain('新しい依頼を作る')
    expect(container.textContent).not.toContain('localStorage')
  })

  it('uses one native share call for the shopping result', async () => {
    const deferred = createDeferredNativeShare()
    const { encoded, payload } = createRequest()
    storeShoppingState(payload.requestId, { [payload.items[0].id]: 'inCart' })
    await renderRequest(encoded)
    await clickAndFlush(button('買い物を終了する'))
    expect(button('ホームへ')).toBeDefined()
    expect(container.textContent).not.toContain('新しい依頼を作る')

    act(() => {
      const shareButton = button('結果を共有')
      click(shareButton)
      click(shareButton)
    })
    expectTitleAndTextOnly(deferred.share, 'おつかい結果', '【おつかい結果】')
    await deferred.resolve()
    expect(container.textContent).toContain('LINEを選択して結果を送信してください。')
  })

  it('keeps two-step cart updates, filtering, temporary undo, and persistence connected', async () => {
    const { encoded, payload } = createRequest(2)
    const firstItem = payload.items[0]
    await renderRequest(encoded)

    expect(container.textContent).not.toContain('Undo')
    expect(container.textContent).not.toContain('元に戻す')
    await clickAndFlush(button('かごに入れる'))
    expect(button('もう一度押して確定')).toBeDefined()

    const beforeConfirmation = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    expect(beforeConfirmation[firstItem.id]).toBeUndefined()

    await clickAndFlush(button('もう一度押して確定'))
    const afterConfirmation = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    expect(afterConfirmation[firstItem.id]).toBe('inCart')
    expect(container.textContent).toContain(
      `${firstItem.productNameSnapshot}をかご済みにしました`,
    )
    expect(button('元に戻す')).toBeDefined()

    await clickAndFlush(button('未購入・相談中だけ表示'))
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (candidate) =>
          candidate.getAttribute('aria-label') ===
          `${firstItem.productNameSnapshot}をかごに入れる確認を始める`,
      ),
    ).toBeUndefined()

    await clickAndFlush(button('元に戻す'))
    const afterUndo = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    expect(afterUndo[firstItem.id]).toBe('pending')
    expect(
      JSON.parse(
        window.localStorage.getItem(`otsukai:cartOrder:${payload.requestId}`) ?? '[]',
      ),
    ).toEqual([])
    expect(container.textContent).not.toContain('元に戻す')
  })

  it('expires the latest undo notice after five seconds', async () => {
    vi.useFakeTimers()
    const { encoded } = createRequest()
    await renderRequest(encoded)

    await clickAndFlush(button('かごに入れる'))
    await clickAndFlush(button('もう一度押して確定'))
    expect(button('元に戻す')).toBeDefined()

    act(() => vi.advanceTimersByTime(4_999))
    expect(button('元に戻す')).toBeDefined()
    act(() => vi.advanceTimersByTime(1))
    expect(container.textContent).not.toContain('元に戻す')
  })

  it('replaces the previous undo and resets the five-second timer', async () => {
    vi.useFakeTimers()
    const { encoded, payload } = createRequest(2)
    const [first, second] = payload.items
    await renderRequest(encoded)

    await clickAndFlush(button('かごに入れる'))
    await clickAndFlush(button('もう一度押して確定'))
    act(() => vi.advanceTimersByTime(4_000))
    await clickAndFlush(button('かごに入れる'))
    await clickAndFlush(button('もう一度押して確定'))

    expect(container.textContent).not.toContain(
      `${first.productNameSnapshot}をかご済みにしました`,
    )
    expect(container.textContent).toContain(
      `${second.productNameSnapshot}をかご済みにしました`,
    )
    act(() => vi.advanceTimersByTime(4_000))
    expect(button('元に戻す')).toBeDefined()

    await clickAndFlush(button('元に戻す'))
    const saved = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    expect(saved[first.id]).toBe('inCart')
    expect(saved[second.id]).toBe('pending')
    expect(container.textContent).not.toContain('元に戻す')
  })

  it('clears a temporary undo when another request URL is loaded', async () => {
    vi.useFakeTimers()
    const firstRequest = createRequest(1, '', 'first-request')
    const secondRequest = createRequest(1, '', 'second-request')
    await renderRequest(firstRequest.encoded)
    await clickAndFlush(button('かごに入れる'))
    await clickAndFlush(button('もう一度押して確定'))
    expect(button('元に戻す')).toBeDefined()

    await renderRequest(secondRequest.encoded)
    expect(container.textContent).not.toContain('元に戻す')
  })

  it('clears the undo timer when the page unmounts', async () => {
    vi.useFakeTimers()
    const clearTimeout = vi.spyOn(window, 'clearTimeout')
    const { encoded } = createRequest()
    await renderRequest(encoded)
    await clickAndFlush(button('かごに入れる'))
    await clickAndFlush(button('もう一度押して確定'))

    act(() => root.unmount())
    rootIsMounted = false
    expect(clearTimeout).toHaveBeenCalled()
  })

  it('restores the consultation reason and cart order without creating another undo', async () => {
    const { encoded, payload } = createRequest()
    const item = payload.items[0]
    storeShoppingState(
      payload.requestId,
      { [item.id]: 'consulting' },
      { [item.id]: { reason: 'other', note: '予算より高い' } },
    )
    await renderRequest(encoded)

    await clickAndFlush(button('相談を取り消す'))
    await clickAndFlush(button('元に戻す'))
    let saved = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    let issues = JSON.parse(
      window.localStorage.getItem(`otsukai:itemIssues:${payload.requestId}`) ?? '{}',
    ) as ItemIssueMap
    expect(saved[item.id]).toBe('consulting')
    expect(issues[item.id]).toEqual({ reason: 'other', note: '予算より高い' })
    expect(container.textContent).not.toContain('元に戻す')

    await clickAndFlush(button('かごに入れる'))
    await clickAndFlush(button('もう一度押して確定'))
    await clickAndFlush(button('未購入に戻す'))
    await clickAndFlush(button('元に戻す'))
    saved = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    const order = JSON.parse(
      window.localStorage.getItem(`otsukai:cartOrder:${payload.requestId}`) ?? '[]',
    ) as string[]
    issues = JSON.parse(
      window.localStorage.getItem(`otsukai:itemIssues:${payload.requestId}`) ?? '{}',
    ) as ItemIssueMap
    expect(saved[item.id]).toBe('inCart')
    expect(order).toEqual([item.id])
    expect(issues[item.id]).toBeUndefined()
  })

  it('restores the exact previous cart order when undoing a return to pending', async () => {
    const { encoded, payload } = createRequest(2)
    const [first, second] = payload.items
    storeShoppingState(payload.requestId, {
      [first.id]: 'inCart',
      [second.id]: 'inCart',
    })
    window.localStorage.setItem(
      `otsukai:cartOrder:${payload.requestId}`,
      JSON.stringify([first.id, second.id]),
    )
    await renderRequest(encoded)

    const resetFirst = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${first.productNameSnapshot}を未購入に戻す"]`,
    )
    if (!resetFirst) {
      throw new Error('First cart item reset was not rendered')
    }
    await clickAndFlush(resetFirst)
    await clickAndFlush(button('元に戻す'))

    expect(
      JSON.parse(
        window.localStorage.getItem(`otsukai:cartOrder:${payload.requestId}`) ?? '[]',
      ),
    ).toEqual([first.id, second.id])
  })

  it('marks an issue as not buying and can return it to pending', async () => {
    const { encoded, payload } = createRequest()
    const item = payload.items[0]
    await renderRequest(encoded)
    await openNewConsultation()
    await clickAndFlush(button('今回は買わない'))

    let saved = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    let issues = JSON.parse(
      window.localStorage.getItem(`otsukai:itemIssues:${payload.requestId}`) ?? '{}',
    ) as ItemIssueMap
    expect(saved[item.id]).toBe('notBuying')
    expect(issues[item.id]).toEqual({ reason: 'soldOut' })

    await clickAndFlush(button('未購入に戻す'))
    saved = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    issues = JSON.parse(
      window.localStorage.getItem(`otsukai:itemIssues:${payload.requestId}`) ?? '{}',
    ) as ItemIssueMap
    expect(saved[item.id]).toBe('pending')
    expect(issues[item.id]).toBeUndefined()
  })

  it('keeps checkout status changes and completion focus targets connected', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const flushAnimationFrames = async () => {
      await act(async () => {
        animationFrames.splice(0).forEach((callback) => callback(0))
        await Promise.resolve()
      })
    }

    const { encoded, payload } = createRequest(1, '大きめ')
    const item = payload.items[0]
    storeShoppingState(payload.requestId, { [item.id]: 'inCart' })
    await renderRequest(encoded)

    await clickAndFlush(button('条件を確認した'))
    let saved = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    expect(saved[item.id]).toBe('verified')

    await clickAndFlush(button('確認を戻す'))
    saved = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    expect(saved[item.id]).toBe('inCart')

    await clickAndFlush(button('条件を確認した'))
    await clickAndFlush(button('買い物を終了する'))
    await flushAnimationFrames()
    const completionHeading = [...container.querySelectorAll<HTMLHeadingElement>('h1')].find(
      (candidate) => candidate.textContent?.trim() === 'おつかい完了',
    )
    expect(document.activeElement).toBe(completionHeading)

    await clickAndFlush(button('買い物内容を見直す'))
    await flushAnimationFrames()
    const checkoutReview = container.querySelector<HTMLElement>('.checkout-review-card')
    expect(document.activeElement).toBe(checkoutReview)

    const resetButton = [...checkoutReview!.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) =>
        candidate.getAttribute('aria-label') ===
        `${item.productNameSnapshot}を未購入に戻す`,
    )
    expect(resetButton).toBeDefined()
    await clickAndFlush(resetButton!)
    saved = JSON.parse(
      window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
    ) as CheckedStateMap
    expect(saved[item.id]).toBe('pending')
  })

  it.each([
    { outcome: 'shared', expectedStatus: 'consulting' },
    { outcome: 'copied', expectedStatus: 'consulting' },
    { outcome: 'cancelled', expectedStatus: 'consulting' },
    { outcome: 'failed', expectedStatus: 'consulting' },
  ] as const)(
    'keeps the consultation state unchanged after the $outcome share result',
    async ({ outcome, expectedStatus }) => {
      const clipboard = vi.fn(async () => undefined)
      setClipboardWriter(clipboard)
      if (outcome === 'shared') {
        setNavigatorShare(vi.fn(async () => undefined))
      } else if (outcome === 'copied') {
        setNavigatorShare(undefined)
      } else if (outcome === 'cancelled') {
        setNavigatorShare(
          vi.fn(async () => {
            throw { name: 'AbortError' }
          }),
        )
      } else {
        setNavigatorShare(
          vi.fn(async () => {
            throw new Error('native share rejected')
          }),
        )
        setClipboardWriter(
          vi.fn(async () => {
            throw new Error('clipboard rejected')
          }),
        )
      }

      const { encoded, payload } = createRequest()
      await renderRequest(encoded)
      await addToConsultation()
      await clickAndFlush(button('相談する 1件'))

      const saved = JSON.parse(
        window.localStorage.getItem(`otsukai:checked:${payload.requestId}`) ?? '{}',
      ) as CheckedStateMap
      expect(saved[payload.items[0].id]).toBe(expectedStatus)
      if (outcome === 'cancelled') {
        expect(clipboard).not.toHaveBeenCalled()
        expect(container.textContent).toContain('状態は変更していません。')
      } else if (outcome === 'copied') {
        expect(clipboard).toHaveBeenCalledTimes(1)
        expect(container.textContent).toContain(
          'OS共有を利用できなかったため、相談文をコピーしました。',
        )
      } else if (outcome === 'failed') {
        expect(container.textContent).toContain(
          '共有またはコピーができませんでした。',
        )
      }
    },
  )

  it('shows a result-specific copy notice when native sharing is unavailable', async () => {
    const clipboard = vi.fn(async () => undefined)
    setNavigatorShare(undefined)
    setClipboardWriter(clipboard)
    const { encoded, payload } = createRequest()
    storeShoppingState(payload.requestId, { [payload.items[0].id]: 'inCart' })
    await renderRequest(encoded)
    await clickAndFlush(button('買い物を終了する'))
    await clickAndFlush(button('結果を共有'))

    expect(clipboard).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain(
      'OS共有を利用できなかったため、結果をコピーしました。',
    )
    expect(container.textContent).toContain('外部ブラウザで開く')
  })

  it('shows an external-browser link only when native sharing is unavailable', async () => {
    const { encoded } = createRequest()
    window.history.replaceState(
      {},
      '',
      `/?source=line&openExternalBrowser=0#/l/${encoded}`,
    )
    await act(async () => {
      root.render(
        <ShoppingListPage
          encodedPayload={encoded}
          payloadFormat="v2"
          onBackHome={() => undefined}
          onError={() => undefined}
        />,
      )
      await Promise.resolve()
    })

    expect(container.textContent).toContain(
      'この画面ではOSの共有機能を利用できません。',
    )
    const link = [...container.querySelectorAll<HTMLAnchorElement>('a')].find(
      (candidate) => candidate.textContent?.trim() === '外部ブラウザで開く',
    )
    expect(link).toBeDefined()
    const url = new URL(link?.href ?? '')
    expect(url.searchParams.get('source')).toBe('line')
    expect(url.searchParams.getAll('openExternalBrowser')).toEqual(['1'])
    expect(url.hash).toBe(`#/l/${encoded}`)
  })

  it('does not show an unnecessary warning when native sharing is available', async () => {
    setNavigatorShare(vi.fn(async () => undefined))
    const { encoded } = createRequest()
    await renderRequest(encoded)

    expect(container.textContent).not.toContain(
      'この画面ではOSの共有機能を利用できません。',
    )
    expect(container.querySelector('.native-share-unavailable')).toBeNull()
  })
})
