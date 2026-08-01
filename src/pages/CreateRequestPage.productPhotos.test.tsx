// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { products } from '../data/products'
import {
  ProductPhotoProcessingError,
  type ProcessedProductPhoto,
} from '../features/productPhotos/imageProcessing'
import {
  ProductPhotoUploadError,
  type ProductPhotoUploadProvider,
} from '../features/productPhotos/ProductPhotoUploadProvider'
import {
  createEmptyHouseholdCatalog,
  updateBaseProduct,
} from '../utils/householdCatalog'
import { decodeShoppingSessionPayload } from '../utils/shoppingSession'
import { CreateRequestPage } from './CreateRequestPage'

const photoConfig = {
  enabled: true,
  endpoint: 'https://worker.example/',
  turnstileSiteKey: 'public-site-key',
} as const

const disabledPhotoConfig = {
  enabled: false,
  endpoint: '',
  turnstileSiteKey: '',
} as const

const milk = products.find((product) => product.id === 'milk')!

function processedPhoto(): ProcessedProductPhoto {
  const blob = new Blob(['compressed-jpeg'], { type: 'image/jpeg' })
  return {
    blob,
    width: 960,
    height: 720,
    bytes: blob.size,
  }
}

describe('CreateRequestPage product photo sharing', () => {
  let container: HTMLDivElement
  let root: Root
  let share: ReturnType<typeof vi.fn<(data: ShareData) => Promise<void>>>
  let revokePreviewUrl: ReturnType<typeof vi.fn<(url: string) => void>>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    window.localStorage.clear()
    window.history.replaceState({}, '', '/#/create')
    share = vi.fn(async () => undefined)
    revokePreviewUrl = vi.fn()
    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: share,
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

  function button(label: string): HTMLButtonElement {
    const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    )
    if (!found) {
      throw new Error(`Button was not rendered: ${label}`)
    }
    return found
  }

  async function click(element: Element): Promise<void> {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  function increaseMilkButton(): HTMLButtonElement {
    const found = container.querySelector<HTMLButtonElement>(
      `button[aria-label^="${milk.name}を1${milk.unit}増やす"]`,
    )
    if (!found) throw new Error('Milk increase button was not rendered')
    return found
  }

  function decreaseMilkButton(): HTMLButtonElement {
    const found = container.querySelector<HTMLButtonElement>(
      `button[aria-label^="${milk.name}を1${milk.unit}減らす"]`,
    )
    if (!found) throw new Error('Milk decrease button was not rendered')
    return found
  }

  async function selectMilkPhoto(file = new File(['source'], 'private.jpg', {
    type: 'image/jpeg',
  })): Promise<void> {
    await click(increaseMilkButton())
    const details = container.querySelector<HTMLButtonElement>(
      `button[aria-label^="${milk.name}の条件を開く"]`,
    )
    if (!details) throw new Error('Milk details button was not rendered')
    await click(details)
    const input = container.querySelector<HTMLInputElement>(
      `input[aria-label="${milk.name}の端末写真を選ぶ"]`,
    )
    if (!input) throw new Error('Photo library input was not rendered')
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  function sharedPayload() {
    const requestUrl = sharedRequestUrl()
    return decodeShoppingSessionPayload({
      encodedPayload: new URL(requestUrl).hash.slice('#/l/'.length),
      codec: 'compact-path',
    })
  }

  function sharedRequestUrl(): string {
    const text = share.mock.calls[0]?.[0].text ?? ''
    return text.split('\n').at(-1) ?? ''
  }

  async function renderPage(input: {
    processPhoto?: () => Promise<ProcessedProductPhoto>
    upload?: ProductPhotoUploadProvider['upload']
    enabled?: boolean
    validationSessionToken?: string
  } = {}): Promise<void> {
    const uploader: ProductPhotoUploadProvider = {
      upload: input.upload ?? vi.fn(async () => undefined),
    }
    await act(async () => {
      root.render(
        <CreateRequestPage
          onBackHome={() => undefined}
          productPhotoConfig={
            input.enabled === false
              ? disabledPhotoConfig
              : {
                  ...photoConfig,
                  ...(input.validationSessionToken
                    ? {
                        validationSessionToken:
                          input.validationSessionToken,
                      }
                    : {}),
                }
          }
          productPhotoUploadProvider={uploader}
          processProductPhoto={input.processPhoto ?? (async () => processedPhoto())}
          createProductPhotoPreviewUrl={() => 'blob:compressed-preview'}
          revokeProductPhotoPreviewUrl={revokePreviewUrl}
        />,
      )
      await Promise.resolve()
    })
  }

  it('keeps the feature hidden and normal sharing on v3 when the flag is off', async () => {
    const upload = vi.fn<ProductPhotoUploadProvider['upload']>(
      async () => undefined,
    )
    await renderPage({ enabled: false, upload })

    expect(container.querySelector('input[type="file"]')).toBeNull()
    await click(increaseMilkButton())
    await click(button('確認へ'))
    await click(button('LINEで送る'))

    expect(upload).not.toHaveBeenCalled()
    expect(sharedPayload().requestId).toMatch(/^v3-/)
  })

  it('does not put the validation capability on a photo-free v3 share', async () => {
    const validationSessionToken = `mv1_${'V'.repeat(32)}`
    await renderPage({ validationSessionToken })
    await click(increaseMilkButton())
    await click(button('確認へ'))
    await click(button('LINEで送る'))

    expect(sharedPayload().requestId).toMatch(/^v3-/)
    expect(sharedRequestUrl()).not.toContain(validationSessionToken)
  })

  it('puts the validation capability on a gated v4 share', async () => {
    const validationSessionToken = `mv1_${'V'.repeat(32)}`
    await renderPage({ validationSessionToken })
    await selectMilkPhoto()
    await click(button('確認へ'))
    await click(button('LINEで送る'))

    expect(sharedPayload().requestId).toMatch(/^v4-/)
    expect(new URL(sharedRequestUrl()).searchParams.get(
      'manualValidationSessionId',
    )).toBe(validationSessionToken)
  })

  it('processes locally, uploads before OS share, and creates v4 only after confirmation', async () => {
    const events: string[] = []
    const processPhoto = vi.fn(async () => {
      events.push('process')
      return processedPhoto()
    })
    const upload = vi.fn<ProductPhotoUploadProvider['upload']>(async () => {
      events.push('upload')
    })
    share.mockImplementation(async () => {
      events.push('share')
    })
    await renderPage({ processPhoto, upload })

    await selectMilkPhoto()

    expect(processPhoto).toHaveBeenCalledTimes(1)
    expect(upload).not.toHaveBeenCalled()
    expect(share).not.toHaveBeenCalled()
    expect(container.textContent).toContain('共有前の端末内プレビュー')

    await click(button('確認へ'))
    expect(container.querySelector('img[alt="牛乳の参考写真"]')).not.toBeNull()
    expect(upload).not.toHaveBeenCalled()

    await click(button('LINEで送る'))

    expect(events).toEqual(['process', 'upload', 'share'])
    expect(upload).toHaveBeenCalledTimes(1)
    const uploadedPhotos = upload.mock.calls[0][0]
    expect(uploadedPhotos).toHaveLength(1)
    expect(uploadedPhotos[0]).toMatchObject({
      itemKey: 'milk',
      blob: expect.any(Blob),
    })
    const payload = sharedPayload()
    expect(payload.requestId).toMatch(/^v4-/)
    expect(payload.items.find((item) => item.productId === 'milk')?.photoToken).toBe(
      uploadedPhotos[0].token,
    )
  })

  it('keeps a failed photo and shares v3 only after the explicit fallback choice', async () => {
    const upload = vi.fn<ProductPhotoUploadProvider['upload']>(async () => {
      throw new ProductPhotoUploadError('service-unavailable')
    })
    await renderPage({ upload })
    await selectMilkPhoto()
    await click(button('確認へ'))

    await click(button('LINEで送る'))

    expect(upload).toHaveBeenCalledTimes(1)
    expect(share).not.toHaveBeenCalled()
    expect(container.textContent).toContain('写真を保存できませんでした')
    expect(container.querySelector('img[alt="牛乳の参考写真"]')).not.toBeNull()

    await click(button('写真を外してv3で共有'))

    expect(share).toHaveBeenCalledTimes(1)
    expect(sharedPayload().requestId).toMatch(/^v3-/)
    expect(revokePreviewUrl).toHaveBeenCalledWith('blob:compressed-preview')
  })

  it('blocks review while compression is pending and never uploads a rejected source', async () => {
    let resolveProcessing: ((value: ProcessedProductPhoto) => void) | undefined
    const pending = new Promise<ProcessedProductPhoto>((resolve) => {
      resolveProcessing = resolve
    })
    const upload = vi.fn<ProductPhotoUploadProvider['upload']>(
      async () => undefined,
    )
    await renderPage({ processPhoto: () => pending, upload })

    await selectMilkPhoto()

    expect(button('確認へ').disabled).toBe(true)
    expect(container.textContent).toContain('写真の圧縮が終わるまで')
    expect(upload).not.toHaveBeenCalled()

    await act(async () => {
      resolveProcessing?.(processedPhoto())
      await pending
      await Promise.resolve()
    })
    expect(button('確認へ').disabled).toBe(false)

    act(() => root.unmount())
    container.replaceChildren()
    root = createRoot(container)
    const rejectedUpload = vi.fn(async () => undefined)
    await renderPage({
      processPhoto: async () => {
        throw new ProductPhotoProcessingError('decode-failed')
      },
      upload: rejectedUpload,
    })
    await selectMilkPhoto(
      new File(['unsupported'], 'private.heic', { type: 'image/heic' }),
    )

    expect(container.textContent).toContain('この端末では写真を読み込めません')
    expect(rejectedUpload).not.toHaveBeenCalled()
    expect(share).not.toHaveBeenCalled()
  })

  it('retains a local preview at quantity zero but excludes it from sharing', async () => {
    const upload = vi.fn<ProductPhotoUploadProvider['upload']>(
      async () => undefined,
    )
    await renderPage({ upload })
    await selectMilkPhoto()

    await click(decreaseMilkButton())
    expect(container.textContent).toContain('数量0のため共有対象外')
    expect(upload).not.toHaveBeenCalled()

    await click(increaseMilkButton())
    expect(container.querySelector('img[alt="牛乳の参考写真プレビュー"]')).not.toBeNull()
  })

  it('keeps a hidden quantity-zero item reachable while its local photo is retained', async () => {
    const catalog = updateBaseProduct(
      createEmptyHouseholdCatalog('2026-08-01T00:00:00.000Z'),
      'milk',
      {
        name: milk.name,
        unit: milk.unit,
        categoryId: milk.categoryId,
        hidden: true,
      },
      '2026-08-01T00:01:00.000Z',
    )
    window.localStorage.setItem(
      'otsukai:householdCatalog:v1',
      JSON.stringify(catalog),
    )
    window.localStorage.setItem(
      'otsukai:createDraft',
      JSON.stringify({ milk: { quantity: 1, memo: '' } }),
    )
    await renderPage()

    const details = container.querySelector<HTMLButtonElement>(
      `button[aria-label^="${milk.name}の条件を開く"]`,
    )
    if (!details) throw new Error('Hidden milk details button was not rendered')
    await click(details)
    const input = container.querySelector<HTMLInputElement>(
      `input[aria-label="${milk.name}の端末写真を選ぶ"]`,
    )
    if (!input) throw new Error('Hidden milk photo input was not rendered')
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['source'], 'private.jpg', { type: 'image/jpeg' })],
    })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await click(decreaseMilkButton())

    expect(container.textContent).toContain('写真の再利用・削除ができるように表示')
    expect(container.textContent).toContain('数量0の商品と写真は共有対象外')
    expect(container.querySelector('img[alt="牛乳の参考写真プレビュー"]')).not.toBeNull()
    expect(button('削除')).toBeDefined()
  })
})
