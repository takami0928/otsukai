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

function createRequest(itemCount = 1) {
  const draft: CreateDraftState = Object.fromEntries(
    products.map((product) => [product.id, { quantity: 0, memo: '' }]),
  )
  products.slice(0, itemCount).forEach((product) => {
    draft[product.id] = { quantity: 1, memo: '' }
  })
  const encoded = encodeCompactRequest(
    buildCompactRequestPayload({
      requestKey: `shopping-share-${itemCount}`,
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

  async function renderRequest(encoded: string) {
    window.history.replaceState({}, '', `/#/l/${encoded}`)
    await act(async () => {
      root.render(
        <ShoppingListPage
          encodedPayload={encoded}
          payloadFormat="v2"
          onBackHome={() => undefined}
          onOpenCreate={() => undefined}
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

  it('uses one native share call for a new individual consultation and marks it consulting', async () => {
    const deferred = createDeferredNativeShare()
    const { encoded, payload } = createRequest()
    await renderRequest(encoded)
    await openNewConsultation()

    act(() => {
      const shareButton = button('LINEで相談')
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

  it('uses one native share call for an individual reconsultation', async () => {
    const deferred = createDeferredNativeShare()
    const { encoded, payload } = createRequest()
    const itemId = payload.items[0].id
    storeShoppingState(
      payload.requestId,
      { [itemId]: 'consulting' },
      { [itemId]: { reason: 'notFound' } },
    )
    await renderRequest(encoded)

    act(() => {
      const shareButton = button('LINEで再相談')
      click(shareButton)
      click(shareButton)
    })
    expectTitleAndTextOnly(deferred.share, 'おつかい相談', '商品が見つからない')
    await deferred.resolve()
  })

  it('uses one native share call for a bulk consultation', async () => {
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
      const shareButton = button('まとめてLINEで相談')
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

  it('uses one native share call for the shopping result', async () => {
    const deferred = createDeferredNativeShare()
    const { encoded, payload } = createRequest()
    storeShoppingState(payload.requestId, { [payload.items[0].id]: 'inCart' })
    await renderRequest(encoded)
    await clickAndFlush(button('買い物を終了する'))

    act(() => {
      const shareButton = button('結果を共有')
      click(shareButton)
      click(shareButton)
    })
    expectTitleAndTextOnly(deferred.share, 'おつかい結果', '【おつかい結果】')
    await deferred.resolve()
    expect(container.textContent).toContain('LINEを選択して結果を送信してください。')
  })

  it.each([
    { outcome: 'shared', expectedStatus: 'consulting' },
    { outcome: 'copied', expectedStatus: 'consulting' },
    { outcome: 'cancelled', expectedStatus: undefined },
    { outcome: 'failed', expectedStatus: undefined },
  ] as const)(
    'keeps the new-consultation state transition correct after $outcome',
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
      await openNewConsultation()
      await clickAndFlush(button('LINEで相談'))

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
          onOpenCreate={() => undefined}
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
