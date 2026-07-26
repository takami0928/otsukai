// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { products } from '../../data/products'
import type { EffectiveProduct } from '../../types/householdCatalog'
import { HandwritingImportError } from './errors'
import { HandwritingImportSection } from './HandwritingImportSection'
import type {
  HandwritingImportSelection,
  HandwritingOcrProvider,
  OcrLine,
} from './types'

const config = {
  enabled: true,
  endpoint: 'https://ocr.example.test/',
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
  }: {
    provider: HandwritingOcrProvider
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
  }) {
    await act(async () => {
      root.render(
        <HandwritingImportSection
          config={{ ...config, enabled }}
          effectiveProducts={effectiveProducts}
          ocrProvider={provider}
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

  it('renders the required camera/library input when enabled', async () => {
    await renderSection({
      provider: { recognizeProductLines: vi.fn(async () => []) },
    })
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    )
    expect(container.textContent).toContain('手書きメモから追加')
    expect(input?.accept).toBe('image/jpeg,image/png,image/webp')
    expect(input?.getAttribute('capture')).toBe('environment')
  })

  it('shows preparing and recognizing states and prevents a second run', async () => {
    const preparation = deferred<Blob>()
    const recognition = deferred<OcrLine[]>()
    const preprocessImage = vi.fn(() => preparation.promise)
    const recognizeProductLines = vi.fn(() => recognition.promise)
    await renderSection({
      provider: { recognizeProductLines },
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
    expect(container.textContent).toContain('メモを読み取り中')
    expect(recognizeProductLines).toHaveBeenCalledTimes(1)

    await act(async () => {
      recognition.resolve([{ id: 'line-1', text: '牛乳' }])
      await recognition.promise
      await Promise.resolve()
    })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('cancels an in-flight OCR request with AbortController', async () => {
    const recognizeProductLines = vi.fn(
      (_image: Blob, options?: { signal?: AbortSignal }) =>
        new Promise<OcrLine[]>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('cancelled', 'AbortError')),
            { once: true },
          )
        }),
    )
    await renderSection({
      provider: { recognizeProductLines },
    })
    await chooseImage()
    await vi.waitFor(() =>
      expect(container.textContent).toContain('メモを読み取り中'),
    )
    await click(button('キャンセル'))
    await vi.waitFor(() =>
      expect(container.textContent).toContain('処理をキャンセルしました。'),
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('initially selects exact matches, only displays similarities, and offers custom add', async () => {
    const onApplySelections = vi.fn(() => ({
      accepted: true,
      changedItemCount: 2,
    }))
    await renderSection({
      provider: {
        recognizeProductLines: vi.fn(async () => [
          { id: 'line-1', text: '牛乳' },
          { id: 'line-2', text: '豆乳' },
          { id: 'line-3', text: '電池' },
        ]),
      },
      onApplySelections,
    })
    await chooseImage()
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"]')).not.toBeNull(),
    )

    const exact = container.querySelector<HTMLSelectElement>(
      '[aria-label="牛乳の候補変更"]',
    )
    const similar = container.querySelector<HTMLSelectElement>(
      '[aria-label="豆乳の候補変更"]',
    )
    const unmatched = container.querySelector<HTMLSelectElement>(
      '[aria-label="電池の候補変更"]',
    )
    expect(exact?.value).toBe('product:milk')
    expect(similar?.value).toBe('ignore')
    expect(similar?.textContent).toContain('牛乳（類似候補・要確認）')
    expect(unmatched?.value).toBe('ignore')
    expect(unmatched?.textContent).toContain('リストにないものとして追加')
    expect(onApplySelections).not.toHaveBeenCalled()

    await act(async () => {
      if (!unmatched) {
        throw new Error('Unmatched select was not rendered')
      }
      unmatched.value = 'custom'
      unmatched.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(container.textContent).toContain(
      '単位は仮に個です。追加後に変更できます。',
    )
    expect(onApplySelections).not.toHaveBeenCalled()

    await click(button('選択した商品を追加'))
    expect(onApplySelections).toHaveBeenCalledWith([
      {
        lineId: 'line-1',
        kind: 'product',
        productId: 'milk',
      },
      {
        lineId: 'line-3',
        kind: 'custom',
        name: '電池',
        customItemId: 'custom:test',
      },
    ])
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain('2件の商品を依頼へ追加しました。')
  })

  it('keeps confirmation open and reports an atomic apply failure', async () => {
    await renderSection({
      provider: {
        recognizeProductLines: vi.fn(async () => [
          { id: 'line-1', text: '牛乳' },
        ]),
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

  it('shows a safe no-text error without opening confirmation', async () => {
    await renderSection({
      provider: { recognizeProductLines: vi.fn(async () => []) },
    })
    await chooseImage()
    await vi.waitFor(() =>
      expect(container.textContent).toContain('文字を検出できませんでした。'),
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows a safe OCR service failure', async () => {
    await renderSection({
      provider: {
        recognizeProductLines: vi.fn(async () => {
          throw new HandwritingImportError('service-unavailable')
        }),
      },
    })
    await chooseImage()
    await vi.waitFor(() =>
      expect(container.textContent).toContain(
        'OCRサービスへ接続できません。',
      ),
    )
  })

  it('does not render or initialize the feature when the flag is off', async () => {
    const recognizeProductLines = vi.fn(async () => [])
    await renderSection({
      provider: { recognizeProductLines },
      enabled: false,
    })
    expect(container.textContent).not.toContain('手書きメモから追加')
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(recognizeProductLines).not.toHaveBeenCalled()
  })
})
