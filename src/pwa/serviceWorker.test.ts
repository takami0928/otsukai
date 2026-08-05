import { describe, expect, it, vi } from 'vitest'
import {
  registerServiceWorker,
  resolveServiceWorkerLocation,
} from './serviceWorker'

describe('service worker base path', () => {
  it.each([
    ['/', { scriptUrl: '/service-worker.js', scope: '/' }],
    [
      '/otsukai/',
      { scriptUrl: '/otsukai/service-worker.js', scope: '/otsukai/' },
    ],
  ])('uses the build base %s for registration and scope', (basePath, expected) => {
    expect(resolveServiceWorkerLocation(basePath)).toEqual(expected)
  })

  it.each(['otsukai/', '/otsukai', '/otsukai//'])(
    'rejects invalid base %s',
    (basePath) => {
      expect(() => resolveServiceWorkerLocation(basePath)).toThrow()
    },
  )

  it('registers the exact scoped worker and fails without affecting the app', async () => {
    const register = vi.fn(async () => ({} as ServiceWorkerRegistration))
    await registerServiceWorker({ register }, '/otsukai/')
    expect(register).toHaveBeenCalledWith('/otsukai/service-worker.js', {
      scope: '/otsukai/',
    })

    await expect(
      registerServiceWorker(
        {
          register: vi.fn(async () => {
            throw new Error('registration failed')
          }),
        },
        '/',
      ),
    ).resolves.toBeUndefined()
  })
})
