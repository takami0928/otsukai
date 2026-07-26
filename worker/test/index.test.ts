import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeminiAnalysisError } from '../src/gemini'
import {
  handleRequest,
  type WorkerDependencies,
  type WorkerEnv,
} from '../src/index'
import {
  MAX_IMAGE_BYTES,
  MAX_PRODUCT_CANDIDATES,
} from '../src/validation'

const allowedOrigin = 'https://takami0928.github.io'
const env: WorkerEnv = {
  GEMINI_API_KEY: 'gemini-secret-value',
  TURNSTILE_SECRET_KEY: 'turnstile-secret-value',
  ALLOWED_ORIGINS: allowedOrigin,
}
const products = [
  {
    id: 'eggs',
    name: '卵',
    aliases: ['たまご', '玉子'],
  },
  {
    id: 'milk',
    name: '牛乳',
    aliases: [],
  },
]

function jpegFile(size = 4, mime = 'image/jpeg'): File {
  const bytes = new Uint8Array(Math.max(size, 4))
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return new File([bytes], 'memo.jpg', { type: mime })
}

function importRequest(
  options: {
    origin?: string
    file?: File
    token?: string
    method?: string
    productsJson?: string
    extraField?: [string, string]
  } = {},
): Request {
  const formData = new FormData()
  formData.append('image', options.file ?? jpegFile())
  formData.append('turnstileToken', options.token ?? 'single-use-token')
  formData.append(
    'products',
    options.productsJson ?? JSON.stringify(products),
  )
  if (options.extraField) {
    formData.append(...options.extraField)
  }
  return new Request('https://import.example.workers.dev/', {
    method: options.method ?? 'POST',
    headers: {
      Origin: options.origin ?? allowedOrigin,
    },
    ...(options.method === 'GET' ? {} : { body: formData }),
  })
}

function successfulTurnstileFetch() {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe('POST')
    expect(String(init?.body)).toContain('response=single-use-token')
    return Response.json({
      success: true,
      action: 'handwriting_import',
      hostname: 'takami0928.github.io',
    })
  }) as typeof fetch
}

function successfulOutput(): string {
  return JSON.stringify({
    version: 1,
    items: [
      {
        sourceText: 'たまご',
        status: 'matched',
        productId: 'eggs',
        candidateProductIds: [],
      },
      {
        sourceText: '電池',
        status: 'unknown',
        productId: null,
        candidateProductIds: [],
      },
    ],
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Cloudflare handwriting import Worker', () => {
  it('validates Turnstile, passes the image and candidates, and returns only validated data', async () => {
    const fetchImplementation = successfulTurnstileFetch()
    const analyzeImplementation = vi.fn(async (options) => {
      expect(options.image.type).toBe('image/jpeg')
      expect(options.products).toEqual(products)
      expect(options.products[0].aliases).toEqual(['たまご', '玉子'])
      expect(options.apiKey).toBe(env.GEMINI_API_KEY)
      expect(options.signal).toBeInstanceOf(AbortSignal)
      return successfulOutput()
    })
    const response = await handleRequest(importRequest(), env, {
      fetchImplementation,
      analyzeImplementation,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      allowedOrigin,
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual(
      JSON.parse(successfulOutput()),
    )
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(analyzeImplementation).toHaveBeenCalledTimes(1)
  })

  it('rejects Turnstile failure before analysis', async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({
        success: false,
        action: 'handwriting_import',
        hostname: 'takami0928.github.io',
      }),
    ) as typeof fetch
    const analyzeImplementation = vi.fn()
    const response = await handleRequest(importRequest(), env, {
      fetchImplementation,
      analyzeImplementation,
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ code: 'AUTH_FAILED' })
    expect(analyzeImplementation).not.toHaveBeenCalled()
  })

  it.each([
    ['handwriting_import', 'attacker.example'],
    ['wrong_action', 'takami0928.github.io'],
  ])(
    'rejects a token with action %s and hostname %s',
    async (action, hostname) => {
      const fetchImplementation = vi.fn(async () =>
        Response.json({ success: true, action, hostname }),
      ) as typeof fetch
      const analyzeImplementation = vi.fn()
      const response = await handleRequest(importRequest(), env, {
        fetchImplementation,
        analyzeImplementation,
      })
      expect(response.status).toBe(403)
      expect(analyzeImplementation).not.toHaveBeenCalled()
    },
  )

  it('rejects a disallowed Origin without CORS permission or external calls', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const analyzeImplementation = vi.fn()
    const response = await handleRequest(
      importRequest({ origin: 'https://attacker.example' }),
      env,
      { fetchImplementation, analyzeImplementation },
    )
    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    await expect(response.json()).resolves.toEqual({
      code: 'ORIGIN_NOT_ALLOWED',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
    expect(analyzeImplementation).not.toHaveBeenCalled()
  })

  it('rejects non-POST methods before external calls', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const response = await handleRequest(
      importRequest({ method: 'GET' }),
      env,
      { fetchImplementation },
    )
    expect(response.status).toBe(405)
    await expect(response.json()).resolves.toEqual({
      code: 'METHOD_NOT_ALLOWED',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects an invalid multipart content type', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const request = new Request('https://import.example.workers.dev/', {
      method: 'POST',
      headers: {
        Origin: allowedOrigin,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    const response = await handleRequest(request, env, {
      fetchImplementation,
    })
    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toEqual({
      code: 'UNSUPPORTED_CONTENT_TYPE',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects a declared MIME that does not match image bytes', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const response = await handleRequest(
      importRequest({ file: jpegFile(4, 'image/png') }),
      env,
      { fetchImplementation },
    )
    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toEqual({
      code: 'UNSUPPORTED_IMAGE_TYPE',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects an image over 2MB before external calls', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const response = await handleRequest(
      importRequest({ file: jpegFile(MAX_IMAGE_BYTES + 1) }),
      env,
      { fetchImplementation },
    )
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      code: 'IMAGE_TOO_LARGE',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects unexpected multipart fields before external calls', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const response = await handleRequest(
      importRequest({ extraField: ['unexpected', 'value'] }),
      env,
      { fetchImplementation },
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'REQUEST_INVALID',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it.each([
    ['not json'],
    [JSON.stringify([])],
    [
      JSON.stringify(
        Array.from(
          { length: MAX_PRODUCT_CANDIDATES + 1 },
          (_, index) => ({
            id: `product-${index}`,
            name: `商品${index}`,
            aliases: [],
          }),
        ),
      ),
    ],
    [
      JSON.stringify([
        products[0],
        { ...products[0], name: '重複ID' },
      ]),
    ],
    [JSON.stringify([{ id: 'empty', name: ' ', aliases: [] }])],
    [
      JSON.stringify([
        {
          id: 'too-many-aliases',
          name: '商品',
          aliases: Array.from({ length: 11 }, (_, index) => `別名${index}`),
        },
      ]),
    ],
    [
      JSON.stringify([
        {
          id: 'extra',
          name: '商品',
          aliases: [],
          categoryId: 'not-allowed',
        },
      ]),
    ],
    [
      '[{"id":"danger","name":"商品","aliases":[],"__proto__":{"polluted":true}}]',
    ],
  ])('rejects invalid product candidate JSON before external calls', async (productsJson) => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const analyzeImplementation = vi.fn()
    const response = await handleRequest(
      importRequest({ productsJson }),
      env,
      { fetchImplementation, analyzeImplementation },
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'INVALID_PRODUCTS',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
    expect(analyzeImplementation).not.toHaveBeenCalled()
  })

  it('rejects an oversized product candidate JSON', async () => {
    const oversized = JSON.stringify(
      Array.from({ length: 200 }, (_, productIndex) => ({
        id: `product-${productIndex}-${'x'.repeat(100)}`,
        name: 'あ'.repeat(30),
        aliases: Array.from(
          { length: 10 },
          (_, aliasIndex) => `${aliasIndex}${'あ'.repeat(29)}`,
        ),
      })),
    )
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const response = await handleRequest(
      importRequest({ productsJson: oversized }),
      env,
      { fetchImplementation },
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'INVALID_PRODUCTS',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it.each([
    ['analysis-limit', 429, 'ANALYSIS_LIMIT'],
    ['invalid-response', 502, 'INVALID_ANALYSIS_RESPONSE'],
    ['safety-blocked', 422, 'SAFETY_BLOCKED'],
    ['unavailable', 502, 'SERVICE_UNAVAILABLE'],
  ] as const)(
    'maps Gemini %s without exposing provider details',
    async (kind, status, code) => {
      const response = await handleRequest(importRequest(), env, {
        fetchImplementation: successfulTurnstileFetch(),
        analyzeImplementation: vi.fn(async () => {
          throw new GeminiAnalysisError(kind)
        }),
      })
      expect(response.status).toBe(status)
      expect(await response.text()).toBe(JSON.stringify({ code }))
    },
  )

  it('rejects invalid model JSON after analysis', async () => {
    const response = await handleRequest(importRequest(), env, {
      fetchImplementation: successfulTurnstileFetch(),
      analyzeImplementation: vi.fn(async () => '{invalid'),
    })
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      code: 'INVALID_ANALYSIS_RESPONSE',
    })
  })

  it('times out a stalled analysis and aborts its signal', async () => {
    const analyzeImplementation = vi.fn(
      async (options) =>
        new Promise<string>((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new DOMException('timeout', 'AbortError')),
            { once: true },
          )
        }),
    )
    const dependencies: WorkerDependencies = {
      fetchImplementation: successfulTurnstileFetch(),
      analyzeImplementation,
      timeoutMs: 5,
    }
    const response = await handleRequest(
      importRequest(),
      env,
      dependencies,
    )
    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({ code: 'TIMEOUT' })
  })

  it('does not log secrets, images, candidates, or model output', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const response = await handleRequest(importRequest(), env, {
      fetchImplementation: successfulTurnstileFetch(),
      analyzeImplementation: vi.fn(async () => successfulOutput()),
    })
    expect(response.status).toBe(200)
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('fails safely when a required secret is missing', async () => {
    const response = await handleRequest(importRequest(), {
      ...env,
      GEMINI_API_KEY: '',
    })
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      code: 'SERVICE_UNAVAILABLE',
    })
  })
})
