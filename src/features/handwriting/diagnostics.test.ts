import { describe, expect, it, vi } from 'vitest'
import {
  createHandwritingDiagnosticsStore,
  createHandwritingRequestId,
  HANDWRITING_DIAGNOSTICS_STORAGE_KEY,
  isValidHandwritingRequestId,
  toSafeWorkerErrorCode,
} from './diagnostics'

function memoryStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial) {
    values.set(HANDWRITING_DIAGNOSTICS_STORAGE_KEY, initial)
  }
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    value: () => values.get(HANDWRITING_DIAGNOSTICS_STORAGE_KEY),
  }
}

describe('handwriting diagnostics', () => {
  it('does not read, write, or remove storage while disabled', () => {
    const storage = memoryStorage()
    const store = createHandwritingDiagnosticsStore(false, { storage })

    store.begin({
      requestId: 'request-disabled',
      sourceImageBytes: 123,
      sourceMime: 'image/jpeg',
    })
    store.record('decode-started')
    store.clear()

    expect(store.getView()).toEqual({})
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('records only safe metadata and updates subscribers', () => {
    const storage = memoryStorage()
    const listener = vi.fn()
    let timestamp = Date.parse('2026-07-28T00:00:00.000Z')
    const store = createHandwritingDiagnosticsStore(true, {
      storage,
      now: () => timestamp,
      navigator: {
        userAgent:
          'Mozilla/5.0 Chrome/140.0.0.0 forbidden-file-name.jpg',
        deviceMemory: 8,
        hardwareConcurrency: 12,
        onLine: true,
      },
    })
    const unsubscribe = store.subscribe(listener)

    store.begin({
      requestId: 'client-request-123',
      sourceImageBytes: 2_000_000,
      sourceMime: 'image/jpeg',
    })
    timestamp += 25
    store.record('decode-completed', {
      decodedWidth: 4_032,
      decodedHeight: 3_024,
    })
    timestamp += 10
    store.record('worker-response-validated', {
      httpStatus: 200,
      resultItemCount: 6,
      matchedCount: 4,
      ambiguousCount: 1,
      unknownCount: 1,
    })
    unsubscribe()

    expect(store.getView().current).toEqual(
      expect.objectContaining({
        requestId: 'client-request-123',
        stage: 'worker-response-validated',
        elapsedMs: 35,
        sourceImageBytes: 2_000_000,
        decodedWidth: 4_032,
        resultItemCount: 6,
        browser: {
          name: 'Chrome',
          version: '140.0.0.0',
          deviceMemory: 8,
          hardwareConcurrency: 12,
          online: true,
        },
      }),
    )
    expect(listener).toHaveBeenCalledTimes(3)
    const serialized = storage.value() ?? ''
    expect(serialized).not.toContain('forbidden-file-name')
    expect(serialized).not.toContain('sourceText')
    expect(serialized).not.toContain('productId')
    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain('apiKey')
  })

  it('restores only a strictly validated previous snapshot', () => {
    const validPrevious = JSON.stringify({
      schemaVersion: 1,
      requestId: 'previous-request',
      stage: 'decode-started',
      timestamp: '2026-07-28T00:00:00.000Z',
      elapsedMs: 20,
      browser: {
        name: 'Safari',
        version: '19.0',
        online: true,
      },
    })
    const restored = createHandwritingDiagnosticsStore(true, {
      storage: memoryStorage(validPrevious),
    })
    expect(restored.getView().previous?.stage).toBe('decode-started')

    const unsafePrevious = JSON.stringify({
      ...JSON.parse(validPrevious),
      sourceText: 'must-not-load',
    })
    const rejected = createHandwritingDiagnosticsStore(true, {
      storage: memoryStorage(unsafePrevious),
    })
    expect(rejected.getView().previous).toBeUndefined()
  })

  it('keeps the just-finished run as previous when a new analysis starts', () => {
    const store = createHandwritingDiagnosticsStore(true, {
      storage: memoryStorage(),
      now: () => Date.parse('2026-07-28T00:00:00.000Z'),
      navigator: { onLine: false },
    })
    store.begin({
      requestId: 'first-request',
      sourceImageBytes: 100,
      sourceMime: 'image/jpeg',
    })
    store.record('failed', { errorCode: 'service-unavailable' })
    store.begin({
      requestId: 'second-request',
      sourceImageBytes: 200,
      sourceMime: 'image/png',
    })

    expect(store.getView().previous).toEqual(
      expect.objectContaining({
        requestId: 'first-request',
        stage: 'failed',
      }),
    )
    expect(store.getView().current).toEqual(
      expect.objectContaining({
        requestId: 'second-request',
        stage: 'file-selected',
        browser: expect.objectContaining({ online: false }),
      }),
    )
  })

  it('adopts only a valid response request ID and clears persisted data', () => {
    const storage = memoryStorage()
    const store = createHandwritingDiagnosticsStore(true, { storage })
    store.begin({
      requestId: 'initial-request',
      sourceImageBytes: 100,
      sourceMime: 'image/jpeg',
    })
    store.adoptRequestId('bad id\ninjection')
    expect(store.getView().current?.requestId).toBe('initial-request')
    store.adoptRequestId('worker-request-456')
    expect(store.getView().current?.requestId).toBe('worker-request-456')

    store.clear()
    expect(store.getView()).toEqual({})
    expect(storage.removeItem).toHaveBeenCalledWith(
      HANDWRITING_DIAGNOSTICS_STORAGE_KEY,
    )
  })

  it('returns defensive copies so callers cannot inject persisted fields', () => {
    const storage = memoryStorage()
    const store = createHandwritingDiagnosticsStore(true, { storage })
    store.begin({
      requestId: 'defensive-copy-request',
      sourceImageBytes: 100,
      sourceMime: 'image/jpeg',
    })

    const exposed = store.getView().current
    if (!exposed) {
      throw new Error('expected current diagnostics')
    }
    exposed.browser.version = 'mutated'
    ;(exposed.browser as unknown as Record<string, unknown>).sourceText =
      'must-not-persist'
    store.record('decode-started')

    expect(store.getView().current?.browser.version).not.toBe('mutated')
    expect(storage.value()).not.toContain('sourceText')
  })

  it('prefers randomUUID and supports a getRandomValues fallback', () => {
    expect(
      createHandwritingRequestId({
        randomUUID: () => 'preferred-request-id',
      }),
    ).toBe('preferred-request-id')

    const fallback = createHandwritingRequestId({
      randomUUID: () => 'not a valid request id',
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        new Uint8Array(
          array.buffer,
          array.byteOffset,
          array.byteLength,
        ).fill(7)
        return array
      },
    })
    expect(fallback).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
  })

  it('validates request IDs and allowlisted Worker error codes', () => {
    expect(isValidHandwritingRequestId('abc-123')).toBe(true)
    expect(isValidHandwritingRequestId('bad id')).toBe(false)
    expect(isValidHandwritingRequestId('a'.repeat(65))).toBe(false)
    expect(toSafeWorkerErrorCode('TIMEOUT')).toBe('TIMEOUT')
    expect(toSafeWorkerErrorCode('raw-provider-error')).toBeUndefined()
  })

  it('ignores storage failures so diagnostics cannot break imports', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('quota')
      }),
      removeItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }
    const store = createHandwritingDiagnosticsStore(true, { storage })
    expect(() =>
      store.begin({
        requestId: 'safe-request',
        sourceImageBytes: 1,
        sourceMime: 'image/webp',
      }),
    ).not.toThrow()
    expect(() => store.clear()).not.toThrow()
  })
})
