import { describe, expect, it } from 'vitest'
import { resolveApplicationBaseUrl } from './application'

describe('public application base URL', () => {
  it.each([
    ['/', 'https://root.example/'],
    ['/otsukai/', 'https://root.example/otsukai/'],
  ])('resolves Vite base %s without duplicate separators', (basePath, expected) => {
    expect(
      resolveApplicationBaseUrl({ BASE_URL: basePath }, 'https://root.example'),
    ).toBe(expected)
  })

  it('uses an explicitly configured public origin when present', () => {
    expect(
      resolveApplicationBaseUrl(
        {
          BASE_URL: '/otsukai/',
          VITE_PUBLIC_APP_ORIGIN: 'https://public.example/',
        },
        'https://preview.example',
      ),
    ).toBe('https://public.example/otsukai/')
  })

  it('safely falls back for missing or invalid optional values', () => {
    expect(
      resolveApplicationBaseUrl(
        {
          BASE_URL: 'invalid',
          VITE_PUBLIC_APP_ORIGIN: 'javascript:alert(1)',
        },
        'https://runtime.example',
      ),
    ).toBe('https://runtime.example/')
  })

  it('rejects when neither configured nor runtime origin is safe', () => {
    expect(() => resolveApplicationBaseUrl({}, 'not-an-origin')).toThrow()
  })
})
