import { describe, expect, it, vi } from 'vitest'
import { GoogleVisionOcrProvider } from './GoogleVisionOcrProvider'

function createTurnstile(
  token: string | Error = 'turnstile-token',
) {
  const getToken = vi.fn(async () => {
    if (token instanceof Error) {
      throw token
    }
    return token
  })
  const reset = vi.fn<() => void>()
  const dispose = vi.fn<() => void>()
  return {
    getToken,
    reset,
    dispose,
  }
}

describe('GoogleVisionOcrProvider', () => {
  it('sends one image and a fresh Turnstile token and returns only OCR lines', async () => {
    const turnstile = createTurnstile()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(FormData)
      const body = init?.body as FormData
      expect(body.getAll('image')).toHaveLength(1)
      expect(body.get('turnstileToken')).toBe('turnstile-token')
      return Response.json({
        lines: [{ id: 'line-1', text: '牛乳', confidence: 0.91 }],
      })
    }) as typeof fetch
    const provider = new GoogleVisionOcrProvider(
      'https://ocr.example.test/',
      turnstile,
      fetchMock,
    )

    await expect(
      provider.recognizeProductLines(
        new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
          type: 'image/jpeg',
        }),
      ),
    ).resolves.toEqual([
      { id: 'line-1', text: '牛乳', confidence: 0.91 },
    ])
    expect(turnstile.getToken).toHaveBeenCalledTimes(1)
    expect(turnstile.reset).toHaveBeenCalledTimes(1)
  })

  it.each([
    { status: 403, body: { code: 'AUTH_FAILED' }, expected: 'auth-failed' },
    { status: 429, body: { code: 'OCR_LIMIT' }, expected: 'rate-limited' },
    {
      status: 503,
      body: { code: 'SERVICE_UNAVAILABLE' },
      expected: 'service-unavailable',
    },
  ] as const)(
    'maps endpoint status $status to a safe $expected error',
    async ({ status, body, expected }) => {
      const turnstile = createTurnstile()
      const fetchMock = vi.fn(
        async () => Response.json(body, { status }),
      ) as typeof fetch
      const provider = new GoogleVisionOcrProvider(
        'https://ocr.example.test/',
        turnstile,
        fetchMock,
      )

      await expect(
        provider.recognizeProductLines(new Blob([], { type: 'image/jpeg' })),
      ).rejects.toMatchObject({
        code: expected,
      })
      expect(turnstile.reset).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects an invalid endpoint response without exposing it', async () => {
    const turnstile = createTurnstile()
    const provider = new GoogleVisionOcrProvider(
      'https://ocr.example.test/',
      turnstile,
      vi.fn(async () =>
        Response.json({ responses: [{ fullTextAnnotation: { text: 'secret' } }] }),
      ) as typeof fetch,
    )
    await expect(
      provider.recognizeProductLines(new Blob([], { type: 'image/jpeg' })),
    ).rejects.toMatchObject({
      code: 'service-unavailable',
    })
  })

  it('maps an aborted token request to cancellation and does not reuse a token', async () => {
    const turnstile = createTurnstile(
      new DOMException('cancelled', 'AbortError'),
    )
    const fetchMock = vi.fn() as unknown as typeof fetch
    const provider = new GoogleVisionOcrProvider(
      'https://ocr.example.test/',
      turnstile,
      fetchMock,
    )

    await expect(
      provider.recognizeProductLines(new Blob([], { type: 'image/jpeg' })),
    ).rejects.toMatchObject({
      code: 'cancelled',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(turnstile.reset).toHaveBeenCalledTimes(1)
  })
})
