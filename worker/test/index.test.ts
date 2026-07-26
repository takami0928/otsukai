import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractOcrLines } from '../src/googleVision'
import {
  handleRequest,
  type WorkerDependencies,
  type WorkerEnv,
} from '../src/index'
import { MAX_IMAGE_BYTES } from '../src/validation'

const allowedOrigin = 'https://takami0928.github.io'
const env: WorkerEnv = {
  GOOGLE_VISION_API_KEY: 'google-secret-value',
  TURNSTILE_SECRET_KEY: 'turnstile-secret-value',
  ALLOWED_ORIGINS: allowedOrigin,
  GOOGLE_VISION_LANGUAGE_HINTS: '',
}

function jpegFile(size = 4, mime = 'image/jpeg'): File {
  const bytes = new Uint8Array(Math.max(size, 4))
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return new File([bytes], 'memo.jpg', { type: mime })
}

function ocrRequest(options: {
  origin?: string
  file?: File
  token?: string
  method?: string
  extraField?: [string, string]
} = {}): Request {
  const formData = new FormData()
  formData.append('image', options.file ?? jpegFile())
  formData.append('turnstileToken', options.token ?? 'single-use-token')
  if (options.extraField) {
    formData.append(...options.extraField)
  }
  return new Request('https://ocr.example.workers.dev/', {
    method: options.method ?? 'POST',
    headers: {
      Origin: options.origin ?? allowedOrigin,
    },
    ...(options.method === 'GET' ? {} : { body: formData }),
  })
}

function visionResponse(): unknown {
  const word = (
    text: string,
    confidence: number,
    breakType: 'SPACE' | 'LINE_BREAK',
  ) => ({
    confidence,
    symbols: Array.from(text).map((character, index, symbols) => ({
      text: character,
      ...(index === symbols.length - 1
        ? {
            property: {
              detectedBreak: { type: breakType },
            },
          }
        : {}),
    })),
  })
  return {
    responses: [
      {
        fullTextAnnotation: {
          text: '牛乳 低脂肪\n卵\n',
          pages: [
            {
              blocks: [
                {
                  paragraphs: [
                    {
                      words: [
                        word('牛乳', 0.9, 'SPACE'),
                        word('低脂肪', 0.8, 'LINE_BREAK'),
                        word('卵', 0.95, 'LINE_BREAK'),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  }
}

function successfulFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/siteverify')) {
      expect(init?.method).toBe('POST')
      expect(String(init?.body)).toContain('response=single-use-token')
      return Response.json({
        success: true,
        action: 'handwriting_ocr',
        hostname: 'takami0928.github.io',
      })
    }
    if (url.includes('vision.googleapis.com')) {
      expect(new Headers(init?.headers).get('X-goog-api-key')).toBe(
        env.GOOGLE_VISION_API_KEY,
      )
      const requestBody = JSON.parse(String(init?.body)) as {
        requests: Array<{
          features: Array<{ type: string }>
          imageContext?: unknown
        }>
      }
      expect(requestBody.requests).toHaveLength(1)
      expect(requestBody.requests[0].features).toEqual([
        { type: 'DOCUMENT_TEXT_DETECTION' },
      ])
      expect(requestBody.requests[0]).not.toHaveProperty('imageContext')
      return Response.json(visionResponse())
    }
    throw new Error('Unexpected external request')
  }) as typeof fetch
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Cloudflare OCR Worker', () => {
  it('validates Turnstile, calls document OCR, and returns only line data', async () => {
    const fetchImplementation = successfulFetch()
    const response = await handleRequest(ocrRequest(), env, {
      fetchImplementation,
    })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      allowedOrigin,
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toEqual({
      lines: [
        { id: 'line-1', text: '牛乳 低脂肪', confidence: 0.8500000000000001 },
        { id: 'line-2', text: '卵', confidence: 0.95 },
      ],
    })
    expect(body).not.toHaveProperty('responses')
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('rejects Turnstile failure before calling Google Vision', async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({
        success: false,
        action: 'handwriting_ocr',
        hostname: 'takami0928.github.io',
      }),
    ) as typeof fetch
    const response = await handleRequest(ocrRequest(), env, {
      fetchImplementation,
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ code: 'AUTH_FAILED' })
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })

  it('rejects a valid token for the wrong hostname', async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({
        success: true,
        action: 'handwriting_ocr',
        hostname: 'attacker.example',
      }),
    ) as typeof fetch
    const response = await handleRequest(ocrRequest(), env, {
      fetchImplementation,
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ code: 'AUTH_FAILED' })
  })

  it('rejects a disallowed Origin without CORS permission or external fetches', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const response = await handleRequest(
      ocrRequest({ origin: 'https://attacker.example' }),
      env,
      { fetchImplementation },
    )
    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    await expect(response.json()).resolves.toEqual({
      code: 'ORIGIN_NOT_ALLOWED',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects non-POST methods', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const response = await handleRequest(
      ocrRequest({ method: 'GET' }),
      env,
      { fetchImplementation },
    )
    expect(response.status).toBe(405)
    await expect(response.json()).resolves.toEqual({
      code: 'METHOD_NOT_ALLOWED',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects non-POST methods even if required configuration is missing', async () => {
    const response = await handleRequest(ocrRequest({ method: 'GET' }), {
      ...env,
      GOOGLE_VISION_API_KEY: '',
    })
    expect(response.status).toBe(405)
    await expect(response.json()).resolves.toEqual({
      code: 'METHOD_NOT_ALLOWED',
    })
  })

  it('rejects an invalid multipart content type', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const request = new Request('https://ocr.example.workers.dev/', {
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

  it('rejects a declared MIME that does not match the image bytes', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const response = await handleRequest(
      ocrRequest({ file: jpegFile(4, 'image/png') }),
      env,
      { fetchImplementation },
    )
    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toEqual({
      code: 'UNSUPPORTED_IMAGE_TYPE',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects an image over 2MB before external fetches', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const response = await handleRequest(
      ocrRequest({ file: jpegFile(MAX_IMAGE_BYTES + 1) }),
      env,
      { fetchImplementation },
    )
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      code: 'IMAGE_TOO_LARGE',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects unexpected multipart fields before external fetches', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const response = await handleRequest(
      ocrRequest({ extraField: ['unexpected', 'value'] }),
      env,
      { fetchImplementation },
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'INVALID_IMAGE_COUNT',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('maps Google Vision quota errors without exposing Google response details', async () => {
    let calls = 0
    const fetchImplementation = vi.fn(async () => {
      calls += 1
      return calls === 1
        ? Response.json({
            success: true,
            action: 'handwriting_ocr',
            hostname: 'takami0928.github.io',
          })
        : Response.json(
            { error: { message: 'raw provider detail', key: 'secret' } },
            { status: 429 },
          )
    }) as typeof fetch
    const response = await handleRequest(ocrRequest(), env, {
      fetchImplementation,
    })
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('{"code":"OCR_LIMIT"}')
  })

  it('maps a Google Vision canonical resource-exhausted error to the quota response', async () => {
    let calls = 0
    const fetchImplementation = vi.fn(async () => {
      calls += 1
      return calls === 1
        ? Response.json({
            success: true,
            action: 'handwriting_ocr',
            hostname: 'takami0928.github.io',
          })
        : Response.json({
            responses: [
              {
                error: {
                  code: 8,
                  message: 'raw quota detail',
                },
              },
            ],
          })
    }) as typeof fetch
    const response = await handleRequest(ocrRequest(), env, {
      fetchImplementation,
    })
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('{"code":"OCR_LIMIT"}')
  })

  it('maps Google Vision failures to a safe service error', async () => {
    let calls = 0
    const fetchImplementation = vi.fn(async () => {
      calls += 1
      return calls === 1
        ? Response.json({
            success: true,
            action: 'handwriting_ocr',
            hostname: 'takami0928.github.io',
          })
        : Response.json(
            { error: { message: 'internal Google error' } },
            { status: 500 },
          )
    }) as typeof fetch
    const response = await handleRequest(ocrRequest(), env, {
      fetchImplementation,
    })
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('{"code":"OCR_UNAVAILABLE"}')
  })

  it('times out a stalled Google Vision request', async () => {
    let calls = 0
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1
        if (calls === 1) {
          return Response.json({
            success: true,
            action: 'handwriting_ocr',
            hostname: 'takami0928.github.io',
          })
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('timeout', 'AbortError')),
            { once: true },
          )
        })
      },
    ) as typeof fetch
    const dependencies: WorkerDependencies = {
      fetchImplementation,
      timeoutMs: 5,
    }
    const response = await handleRequest(ocrRequest(), env, dependencies)
    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({ code: 'OCR_TIMEOUT' })
  })

  it('does not log secrets, image content, OCR text, or raw responses', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const response = await handleRequest(ocrRequest(), env, {
      fetchImplementation: successfulFetch(),
    })
    expect(response.status).toBe(200)
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('fails safely when required secrets are missing', async () => {
    const response = await handleRequest(ocrRequest(), {
      ...env,
      GOOGLE_VISION_API_KEY: '',
    })
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      code: 'SERVICE_UNAVAILABLE',
    })
  })
})

describe('extractOcrLines', () => {
  it('falls back to full text lines when structural words are unavailable', () => {
    expect(
      extractOcrLines({
        responses: [
          {
            fullTextAnnotation: {
              text: '牛乳\n\n卵\n',
            },
          },
        ],
      }),
    ).toEqual([
      { id: 'line-1', text: '牛乳' },
      { id: 'line-2', text: '卵' },
    ])
  })

  it('returns no line for a response with no document text', () => {
    expect(extractOcrLines({ responses: [{}] })).toEqual([])
  })
})
