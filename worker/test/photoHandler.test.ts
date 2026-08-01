import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../src/config'
import {
  handlePhotoApiRequest,
  PHOTO_RETENTION_MS,
  PHOTO_TURNSTILE_ACTION,
} from '../src/photoHandler'
import type {
  PhotoObject,
  ReadPhotoResult,
  SavePhotoInput,
  SavePhotoResult,
} from '../src/photoObject'
import {
  allowedOrigin,
  createJpegBytes,
  photoBatchRequest,
  validPhotoTokens,
} from './photoTestHelpers'

class FakePhotoStub {
  saveResult: SavePhotoResult = { status: 'created' }
  readResult: ReadPhotoResult = { status: 'missing' }
  saveError: Error | undefined
  deleteError: Error | undefined
  readonly savePhoto = vi.fn(async (_input: SavePhotoInput) => {
    if (this.saveError) {
      throw this.saveError
    }
    return this.saveResult
  })
  readonly getPhoto = vi.fn(async (_now: number) => this.readResult)
  readonly deletePhoto = vi.fn(async () => {
    if (this.deleteError) {
      throw this.deleteError
    }
  })
}

class FakePhotoNamespace {
  readonly stubs = new Map<string, FakePhotoStub>()
  readonly getByName = vi.fn((name: string) => {
    let stub = this.stubs.get(name)
    if (!stub) {
      stub = new FakePhotoStub()
      this.stubs.set(name, stub)
    }
    return stub as unknown as DurableObjectStub<PhotoObject>
  })
}

function photoEnv(namespace = new FakePhotoNamespace()): {
  env: WorkerEnv
  namespace: FakePhotoNamespace
} {
  return {
    env: {
      PHOTO_API_ENABLED: 'true',
      SHARED_REQUEST_API_ENABLED: 'false',
      TURNSTILE_SECRET_KEY: 'turnstile-secret-value',
      ALLOWED_ORIGINS: allowedOrigin,
      PHOTO_OBJECTS:
        namespace as unknown as DurableObjectNamespace<PhotoObject>,
    },
    namespace,
  }
}

function successfulTurnstileFetch() {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe('POST')
    expect(String(init?.body)).toContain('response=single-use-token')
    return Response.json({
      success: true,
      action: PHOTO_TURNSTILE_ACTION,
      hostname: 'takami0928.github.io',
    })
  }) as typeof fetch
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('photo API handler', () => {
  it('validates Turnstile once and stores up to three photos without Gemini', async () => {
    const { env, namespace } = photoEnv()
    const fetchImplementation = successfulTurnstileFetch()
    const now = Date.UTC(2026, 7, 1)

    const response = await handlePhotoApiRequest(
      photoBatchRequest({ count: 3 }),
      env,
      { fetchImplementation, now: () => now },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      allowedOrigin,
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      photos: [0, 1, 2].map((index) => ({
        token: validPhotoTokens[index],
        itemKey: `item-${index}`,
      })),
    })
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(env.GEMINI_API_KEY).toBeUndefined()
    for (const stub of namespace.stubs.values()) {
      expect(stub.savePhoto).toHaveBeenCalledTimes(1)
      expect(stub.savePhoto).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: now,
          expiresAt: now + PHOTO_RETENTION_MS,
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      )
    }
  })

  it('rejects Turnstile failure before Durable Object storage', async () => {
    const { env, namespace } = photoEnv()
    const response = await handlePhotoApiRequest(
      photoBatchRequest(),
      env,
      {
        fetchImplementation: vi.fn(async () =>
          Response.json({
            success: false,
            action: PHOTO_TURNSTILE_ACTION,
            hostname: 'takami0928.github.io',
          }),
        ) as typeof fetch,
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ code: 'AUTH_FAILED' })
    expect(namespace.getByName).not.toHaveBeenCalled()
  })

  it('times out a stalled Turnstile request without storage access', async () => {
    const { env, namespace } = photoEnv()
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          )
        }),
    ) as typeof fetch

    const response = await handlePhotoApiRequest(
      photoBatchRequest(),
      env,
      { fetchImplementation, timeoutMs: 1 },
    )

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({ code: 'TIMEOUT' })
    expect(namespace.getByName).not.toHaveBeenCalled()
  })

  it('treats an identical token upload as idempotent success', async () => {
    const { env, namespace } = photoEnv()
    const stub = new FakePhotoStub()
    stub.saveResult = { status: 'existing' }
    namespace.stubs.set(validPhotoTokens[0], stub)

    const response = await handlePhotoApiRequest(
      photoBatchRequest(),
      env,
      { fetchImplementation: successfulTurnstileFetch() },
    )

    expect(response.status).toBe(200)
    expect(stub.deletePhoto).not.toHaveBeenCalled()
  })

  it('rejects a different image for the same token without overwrite', async () => {
    const { env, namespace } = photoEnv()
    const stub = new FakePhotoStub()
    stub.saveResult = { status: 'conflict' }
    namespace.stubs.set(validPhotoTokens[0], stub)

    const response = await handlePhotoApiRequest(
      photoBatchRequest(),
      env,
      { fetchImplementation: successfulTurnstileFetch() },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'PHOTO_TOKEN_CONFLICT',
    })
    expect(stub.deletePhoto).not.toHaveBeenCalled()
  })

  it('cleans up newly created objects after a partial save failure', async () => {
    const { env, namespace } = photoEnv()
    const first = new FakePhotoStub()
    const second = new FakePhotoStub()
    second.saveError = new Error('synthetic storage failure')
    namespace.stubs.set(validPhotoTokens[0], first)
    namespace.stubs.set(validPhotoTokens[1], second)

    const response = await handlePhotoApiRequest(
      photoBatchRequest({ count: 2 }),
      env,
      { fetchImplementation: successfulTurnstileFetch() },
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      code: 'SERVICE_UNAVAILABLE',
    })
    expect(first.deletePhoto).toHaveBeenCalledTimes(1)
    expect(second.deletePhoto).not.toHaveBeenCalled()
  })

  it('does not report success when best-effort cleanup itself fails', async () => {
    const { env, namespace } = photoEnv()
    const first = new FakePhotoStub()
    first.deleteError = new Error('synthetic cleanup failure')
    const second = new FakePhotoStub()
    second.saveResult = { status: 'conflict' }
    namespace.stubs.set(validPhotoTokens[0], first)
    namespace.stubs.set(validPhotoTokens[1], second)

    const response = await handlePhotoApiRequest(
      photoBatchRequest({ count: 2 }),
      env,
      { fetchImplementation: successfulTurnstileFetch() },
    )

    expect(response.status).toBe(409)
    expect(first.deletePhoto).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toEqual({
      code: 'PHOTO_TOKEN_CONFLICT',
    })
  })

  it.each([
    {
      result: { status: 'missing' } as ReadPhotoResult,
      status: 404,
      body: { code: 'PHOTO_NOT_FOUND' },
    },
    {
      result: { status: 'expired' } as ReadPhotoResult,
      status: 410,
      body: { code: 'PHOTO_EXPIRED' },
    },
  ])('returns a finite JSON response for $result.status', async ({
    result,
    status,
    body,
  }) => {
    const { env, namespace } = photoEnv()
    const stub = new FakePhotoStub()
    stub.readResult = result
    namespace.stubs.set(validPhotoTokens[0], stub)

    const response = await handlePhotoApiRequest(
      photoBatchRequest({
        method: 'GET',
        pathname: `/v1/photos/${validPhotoTokens[0]}`,
      }),
      env,
    )

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual(body)
  })

  it('returns JPEG bytes with private short-lived caching', async () => {
    const { env, namespace } = photoEnv()
    const jpeg = createJpegBytes().buffer
    const stub = new FakePhotoStub()
    stub.readResult = {
      status: 'found',
      jpeg,
      expiresAt: Date.now() + PHOTO_RETENTION_MS,
    }
    namespace.stubs.set(validPhotoTokens[0], stub)

    const response = await handlePhotoApiRequest(
      photoBatchRequest({
        method: 'GET',
        pathname: `/v1/photos/${validPhotoTokens[0]}`,
      }),
      env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Cache-Control')).toBe(
      'private, max-age=300, must-revalidate',
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array(jpeg),
    )
  })

  it('keeps disabled or incomplete photo configuration safely unavailable', async () => {
    const disabled = await handlePhotoApiRequest(photoBatchRequest(), {
      PHOTO_API_ENABLED: 'false',
    })
    expect(disabled.status).toBe(404)

    const incomplete = await handlePhotoApiRequest(photoBatchRequest(), {
      PHOTO_API_ENABLED: 'true',
      ALLOWED_ORIGINS: allowedOrigin,
      TURNSTILE_SECRET_KEY: 'turnstile-secret-value',
    })
    expect(incomplete.status).toBe(503)
  })

  it('rejects an unlisted Origin without CORS or storage access', async () => {
    const { env, namespace } = photoEnv()
    const response = await handlePhotoApiRequest(
      photoBatchRequest({ origin: 'https://attacker.example' }),
      env,
    )

    expect(response.status).toBe(403)
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(namespace.getByName).not.toHaveBeenCalled()
  })

  it('does not write photo input or capability data to console logs', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { env } = photoEnv()

    const response = await handlePhotoApiRequest(
      photoBatchRequest(),
      env,
      { fetchImplementation: successfulTurnstileFetch() },
    )

    expect(response.status).toBe(200)
    expect(consoleLog).not.toHaveBeenCalled()
  })
})
