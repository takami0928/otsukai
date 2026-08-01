import { describe, expect, it } from 'vitest'
import { resolveLiveRequestConfig } from './config'

describe('live request configuration', () => {
  it('is disabled when the flag is missing or false', () => {
    expect(resolveLiveRequestConfig({}).enabled).toBe(false)
    expect(
      resolveLiveRequestConfig({ VITE_LIVE_REQUESTS_ENABLED: 'false' })
        .enabled,
    ).toBe(false)
  })

  it('is enabled only by an explicit true value', () => {
    expect(
      resolveLiveRequestConfig({ VITE_LIVE_REQUESTS_ENABLED: ' TRUE ' })
        .enabled,
    ).toBe(true)
    expect(
      resolveLiveRequestConfig({ VITE_LIVE_REQUESTS_ENABLED: '1' })
        .enabled,
    ).toBe(false)
  })
})
