// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { products } from '../../data/products'
import type { EffectiveProduct } from '../../types/householdCatalog'
import { HandwritingImportError } from './errors'
import { HandwritingImportSection } from './HandwritingImportSection'
import type {
  HandwritingImportProvider,
  HandwritingImportResult,
  HandwritingImportSelection,
  ImportProductCandidate,
} from './types'

const config = {
  enabled: true,
  endpoint: 'https://import.example.test/',
  turnstileSiteKey: 'site-key',
}
const effectiveProducts: EffectiveProduct[] = products.map((product) => ({
  ...product,
  source: 'base',
  hidden: false,
  isCustomized: false,
}))
const preparedImage = new Blob(
  [new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
  { type: 'image/jpeg' },
)

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function result(
  items: HandwritingImportResult['items'],
): HandwritingImportResult {
  return { version: 1, items }
}

describe('HandwritingImportSection', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  async function renderSection({
    provider,
    preprocessImage = vi.fn(async () => preparedImage),
    onApplySelections = vi.fn(() => ({
      accepted: true,
      changedItemCount: 1,
    })),
    enabled = true,
    productsForView = effectiveProducts,
  }: {
    provider: HandwritingImportProvider
    preprocessImage?: (
      file: File,
      options?: { signal?: AbortSignal },
    ) => Promise<Blob>
    onApplySelections?: (
      selections: readonly HandwritingImportSelection[],
    ) => {
      accepted: boolean
      changedItemCount: number
      reason?:
        | 'url-limit'
        | 'custom-item-limit'
        | 'invalid-selection'
    }
    enabled?: boolean
    productsForView?: EffectiveProduct[]
  }) {
    await act(async () => {
      root.render(
        <HandwritingImportSection
          config={{ ...config, enabled }}
          effectiveProducts={productsForView}
          importProvider={provider}
          preprocessImage={preprocessImage}
          onApplySelections={onApplySelections}
          createCustomItemId={() => 'custom:test'}
        />,
      )
      await Promise.resolve()
    })
    return { preprocessImage, onApplySelections }
  }

  async function chooseImage() {
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    )
    if (!input) {
      throw new Error('File input was not rendered')
    }
    const file = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
      'memo.jpg',
      { type: 'image/jpeg' },
    )
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    return input
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

  async function click(element: Element) {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
  }

  it('renders the camera/library input and Gemini privacy explanation', async () => {
    await renderSection({
      provider: { analyze: vi.fn(async () => result([])) },
    })
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    )
    expect(container.textContent).toContain('手書きメモから追加')
    expect(container.textContent).toContain('画像と商品候補をGoogle Geminiへ送信')
    expect(container.textContent).toContain('サービス改善に使用される場合があります')
    expect(input?.accept).toBe('image/jpeg,image/png,image/webp')
    expect(input?.getAttribute('capture')).toBe('environment')
  })

  it('sends visible current products and aliases, but no hidden product', async () => {
    let sentProducts: readonly ImportProductCandidate[] = []
    const analyze = vi.fn(
      async (
        _image: Blob,
        candidates: readonly ImportProductCandidate[],
      ) => {
        sentProducts = candidates
        return result([
        {
          sourceText: 'たまご',
          status: 'matched',
          productId: 'eggs',
          candidateProductIds: [],
        },
        ])
      },
    )
    await renderSection({
      provider: { analyze },
      productsForView: [
        ...effectiveProducts,
        {
          ...effectiveProducts[0],
          id: 'hidden-product',
          name: '非表示',
          hidden: true,
        },
      ],
    })
    await chooseImage()
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1))
    expect(sentProducts.find((product) => product.id === 'eggs')).toEqual(
      expect.objectContaining({
        name: '卵',
        aliases: ['たまご', '玉子'],
      }),
    )
    expect(
      sentProducts.some((product) => product.id === 'hidden-product'),
    ).toBe(false)
  })

  it('shows preparing and analyzing states and prevents a second run', async () => {
    const preparation = deferred<Blob>()
    const analysis = deferred<HandwritingImportResult>()
    const preprocessImage = vi.fn(() => preparation.promise)
    const analyze = vi.fn(() => analysis.promise)
    await renderSection({
      provider: { analyze },
      preprocessImage,
    })

    const input = await chooseImage()
    expect(container.textContent).toContain('画像を準備中')
    expect(input.disabled).toBe(true)

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [
        new File([new Uint8Array([0xff, 0xd8, 0xff])], 'second.jpg', {
          type: 'image/jpeg',
        }),
      ],
    })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(preprocessImage).toHaveBeenCalledTimes(1)

    await act(async () => {
      preparation.resolve(preparedImage)
      await preparation.promise
      await Promise.resolve()
    })
    expect(container.textContent).toContain('メモを分析中')
    expect(analyze).toHaveBeenCalledTimes(1)

    await act(async () => {
      analysis.resolve(
        result([
          {
            sourceText: '牛乳',
            status: 'matched',
            productId: 'milk',
            candidateProductIds: [],
          },
        ]),
      )
      await analysis.promise
      await Promise.resolve()
    })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('cancels an in-flight analysis with AbortController', async () => {
    const analyze = vi.fn(
      (
        _image: Blob,
        _products: readonly unknown[],
        options?: { signal?: AbortSignal },
      ) =>
        new Promise<HandwritingImportResult>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('cancelled', 'AbortError')),
            { once: true },
          )
        }),
    )
    await renderSection({ provider: { analyze } })
    await chooseImage()
    await vi.waitFor(() =>
      expect(container.textContent).toContain('メモを分析中'),
    )
    await click(button('キャンセル'))
    await vi.waitFor(() =>
      expect(container.textContent).toContain('処理をキャンセルしました。'),
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('selects matched only and requires a choice for ambiguous and unknown items', async () => {
    const onApplySelections = vi.fn(() => ({
      accepted: true,
      changedItemCount: 2,
    }))
    await renderSection({
      provider: {
        analyze: vi.fn(async () =>
          result([
            {
              sourceText: '牛乳',
              status: 'matched',
              productId: 'milk',
              candidateProductIds: [],
            },
            {
              sourceText: 'とうふ',
              status: 'ambiguous',
              productId: null,
              candidateProductIds: ['tofu', 'three-pack-tofu'],
            },
            {
              sourceText: '電池',
              status: 'unknown',
              productId: null,
              candidateProductIds: [],
            },
          ]),
        ),
      },
      onApplySelections,
    })
    await chooseImage()
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"]')).not.toBeNull(),
    )

    const matched = container.querySelector<HTMLSelectElement>(
      '[aria-label="牛乳の候補を選択"]',
    )
    const ambiguous = container.querySelector<HTMLSelectElement>(
      '[aria-label="とうふの候補を選択"]',
    )
    const unknown = container.querySelector<HTMLSelectElement>(
      '[aria-label="電池の候補を選択"]',
    )
    expect(matched?.value).toBe('product:milk')
    expect(ambiguous?.value).toBe('ignore')
    expect(ambiguous?.closest('article')?.textContent).toContain(
      '豆腐、三連豆腐',
    )
    expect(unknown?.value).toBe('ignore')
    expect(onApplySelections).not.toHaveBeenCalled()

    await act(async () => {
      if (!ambiguous || !unknown) {
        throw new Error('Expected selects were not rendered')
      }
      ambiguous.value = 'product:tofu'
      ambiguous.dispatchEvent(new Event('change', { bubbles: true }))
      unknown.value = 'custom'
      unknown.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(container.textContent).toContain(
      '単位は仮に個です。追加後に変更できます。',
    )
    expect(onApplySelections).not.toHaveBeenCalled()

    await click(button('選択した商品を追加'))
    expect(onApplySelections).toHaveBeenCalledWith([
      {
        itemId: 'analysis-item-1',
        kind: 'product',
        productId: 'milk',
      },
      {
        itemId: 'analysis-item-2',
        kind: 'product',
        productId: 'tofu',
      },
      {
        itemId: 'analysis-item-3',
        kind: 'custom',
        name: '電池',
        customItemId: 'custom:test',
      },
    ])
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('allows a matched item to be changed or ignored before applying', async () => {
    const onApplySelections = vi.fn(() => ({
      accepted: true,
      changedItemCount: 1,
    }))
    await renderSection({
      provider: {
        analyze: vi.fn(async () =>
          result([
            {
              sourceText: '牛乳',
              status: 'matched',
              productId: 'milk',
              candidateProductIds: [],
            },
          ]),
        ),
      },
      onApplySelections,
    })
    await chooseImage()
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"]')).not.toBeNull(),
    )
    const select = container.querySelector<HTMLSelectElement>(
      '[aria-label="牛乳の候補を選択"]',
    )
    await act(async () => {
      if (!select) {
        throw new Error('Select not found')
      }
      select.value = 'product:eggs'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    await click(button('選択した商品を追加'))
    expect(onApplySelections).toHaveBeenCalledWith([
      {
        itemId: 'analysis-item-1',
        kind: 'product',
        productId: 'eggs',
      },
    ])
  })

  it('keeps confirmation open and reports an atomic apply failure', async () => {
    await renderSection({
      provider: {
        analyze: vi.fn(async () =>
          result([
            {
              sourceText: '牛乳',
              status: 'matched',
              productId: 'milk',
              candidateProductIds: [],
            },
          ]),
        ),
      },
      onApplySelections: vi.fn(() => ({
        accepted: false,
        changedItemCount: 0,
        reason: 'url-limit' as const,
      })),
    })
    await chooseImage()
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"]')).not.toBeNull(),
    )
    await click(button('選択した商品を追加'))
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.textContent).toContain('依頼上限により追加できません。')
  })

  it('rejects a malformed provider result before opening confirmation', async () => {
    await renderSection({
      provider: {
        analyze: vi.fn(async () =>
          ({
            version: 1,
            items: [
              {
                sourceText: '架空',
                status: 'matched',
                productId: 'invented',
                candidateProductIds: [],
              },
            ],
          }) as HandwritingImportResult,
        ),
      },
    })
    await chooseImage()
    await vi.waitFor(() =>
      expect(container.textContent).toContain(
        '読み取り結果を安全に確認できませんでした。',
      ),
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows a safe failure without changing ordinary input', async () => {
    await renderSection({
      provider: {
        analyze: vi.fn(async () => {
          throw new HandwritingImportError('service-unavailable')
        }),
      },
    })
    await chooseImage()
    await vi.waitFor(() =>
      expect(container.textContent).toContain(
        '手書きメモ解析サービスへ接続できません。',
      ),
    )
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
  })

  it('does not render or initialize the feature when the flag is off', async () => {
    const analyze = vi.fn(async () => result([]))
    await renderSection({
      provider: { analyze },
      enabled: false,
    })
    expect(container.textContent).not.toContain('手書きメモから追加')
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(analyze).not.toHaveBeenCalled()
  })
})
