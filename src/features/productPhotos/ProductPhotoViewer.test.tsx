// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductPhotoViewer } from './ProductPhotoViewer'

const token = 'p1_AAECAwQFBgcICQoLDA0ODxAREhMUFRYX'

function jpegBlob(): Blob {
  return new Blob(
    [new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0xff, 0xd9])],
    { type: 'image/jpeg' },
  )
}

describe('ProductPhotoViewer', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function renderResponse(response: Response) {
    const fetchImplementation = vi.fn(async () => response) as typeof fetch
    const revoke = vi.fn()
    await act(async () => {
      root.render(
        <ProductPhotoViewer
          endpoint="https://worker.example/"
          token={token}
          itemName="牛乳"
          fetchImplementation={fetchImplementation}
          createPreviewUrl={() => 'blob:remote-photo'}
          revokePreviewUrl={revoke}
        />,
      )
    })
    return { fetchImplementation, revoke }
  }

  it('loads JPEG independently and supports an accessible enlarged view', async () => {
    const { fetchImplementation, revoke } = await renderResponse(
      new Response(jpegBlob(), {
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    )
    expect(fetchImplementation).toHaveBeenCalledWith(
      `https://worker.example/v1/photos/${token}`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
    expect(container.querySelector('[data-photo-state="loaded"]')).not.toBeNull()
    const button = container.querySelector<HTMLButtonElement>('.shopping-photo-button')
    act(() => button?.click())
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    act(() => root.unmount())
    expect(revoke).toHaveBeenCalledWith('blob:remote-photo')
    container.remove()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  it.each([
    [404, 'expired', '保存期限'],
    [410, 'expired', '保存期限'],
    [503, 'failed', '取得できません'],
  ] as const)('maps HTTP %s to %s without throwing', async (status, state, text) => {
    await renderResponse(Response.json({ code: 'finite' }, { status }))
    expect(container.querySelector(`[data-photo-state="${state}"]`)).not.toBeNull()
    expect(container.textContent).toContain(text)
  })

  it('rejects invalid token and content without a request-body fallback', async () => {
    const fetchImplementation = vi.fn()
    await act(async () => {
      root.render(
        <ProductPhotoViewer
          endpoint="https://worker.example/"
          token="bad-token"
          itemName="牛乳"
          fetchImplementation={fetchImplementation}
        />,
      )
    })
    expect(container.querySelector('[data-photo-state="invalid"]')).not.toBeNull()
    expect(fetchImplementation).not.toHaveBeenCalled()

    await renderResponse(
      new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    )
    expect(container.querySelector('[data-photo-state="invalid"]')).not.toBeNull()

    await renderResponse(
      new Response(new Blob(['not-jpeg'], { type: 'image/jpeg' }), {
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    )
    expect(container.querySelector('[data-photo-state="invalid"]')).not.toBeNull()
  })

  it('keeps a network failure inside the photo area', async () => {
    await act(async () => {
      root.render(
        <ProductPhotoViewer
          endpoint="https://worker.example/"
          token={token}
          itemName="牛乳"
          fetchImplementation={vi.fn(async () => {
            throw new TypeError('offline')
          }) as typeof fetch}
        />,
      )
    })
    expect(container.querySelector('[data-photo-state="failed"]')).not.toBeNull()
  })

  it('does not retain an object URL when a late response completes after unmount', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    const createPreviewUrl = vi.fn(() => 'blob:late-photo')
    const revokePreviewUrl = vi.fn()
    await act(async () => {
      root.render(
        <ProductPhotoViewer
          endpoint="https://worker.example/"
          token={token}
          itemName="牛乳"
          fetchImplementation={vi.fn(() => pendingResponse) as typeof fetch}
          createPreviewUrl={createPreviewUrl}
          revokePreviewUrl={revokePreviewUrl}
        />,
      )
    })

    act(() => root.unmount())
    await act(async () => {
      resolveResponse?.(
        new Response(jpegBlob(), {
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      )
      await pendingResponse
      await Promise.resolve()
    })

    expect(createPreviewUrl).not.toHaveBeenCalled()
    expect(revokePreviewUrl).not.toHaveBeenCalled()
    container.remove()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
})
